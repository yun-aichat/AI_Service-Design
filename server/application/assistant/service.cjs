const {
  parseAssistantModelResponse,
  normalizeAssistantRequest,
} = require("./protocol.cjs");
const { readAssistantSkill } = require("./skill-loader.cjs");

function createAssistantService({
  modelProvider,
  usageRecorder,
  readSkill = readAssistantSkill,
} = {}) {
  if (!modelProvider?.generateJson) {
    throw new Error("Assistant service requires a modelProvider.generateJson implementation.");
  }

  const recorder = usageRecorder || { recordGenerated: async () => null };

  return {
    async handleRequest(input, options = {}) {
      const request = normalizeAssistantRequest(input);
      const systemPrompt = buildSystemPrompt(request, readSkill(request.skillId));
      const providerMessages = request.messages.map(toProviderMessage);
      const completion = await modelProvider.generateJson({
        systemPrompt,
        messages: providerMessages,
      });
      const response = parseAssistantModelResponse(completion.content);

      await recorder.recordGenerated({
        request,
        response,
        user: options.user || null,
        model: completion.model || null,
      });

      return response;
    },
  };
}

function buildSystemPrompt(request, skillPrompt) {
  return [
    skillPrompt,
    "你正在服务设计平台的正式 assistant 协议中工作。",
    "你收到的是工具级 document 上下文，而不是临时页面局部状态。",
    "必须只返回一个符合响应协议的 JSON 对象，不要输出 Markdown 代码块。",
    "如果信息不足，只返回 clarify 并提出问题；不要生成 proposal。",
    "proposal 只是候选修改，必须等待用户确认后才会应用到正式 document。",
    JSON.stringify(
      {
        scope: request.scope,
        toolId: request.toolId,
        skillId: request.skillId,
        skillVersion: request.skillVersion,
        document: request.document,
        context: request.context,
      },
      null,
      2,
    ),
  ].join("\n\n");
}

function toProviderMessage(message) {
  if (message.role === "assistant") {
    return {
      role: "assistant",
      content: message.content || "",
    };
  }

  const imageAttachments = (message.attachments || []).filter(
    (attachment) => attachment.kind === "image",
  );
  if (!imageAttachments.length) {
    return {
      role: "user",
      content: message.content || "",
    };
  }

  return {
    role: "user",
    content: [
      ...imageAttachments.map((attachment) => ({
        type: "image_url",
        image_url: {
          url: attachment.dataUrl,
        },
      })),
      {
        type: "text",
        text: message.content || "请结合截图和当前工具 document 继续对话。",
      },
    ],
  };
}

module.exports = {
  buildSystemPrompt,
  createAssistantService,
  toProviderMessage,
};
