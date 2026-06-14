const GLM_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

const DEFAULT_GLM_MODEL = "glm-4.6v";

function createGlmAssistantModelProvider({
  apiKey = process.env.ZHIPU_API_KEY,
  model = process.env.GLM_MODEL || DEFAULT_GLM_MODEL,
  endpoint = GLM_ENDPOINT,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) {
    const error = new Error("服务端未配置 ZHIPU_API_KEY");
    error.statusCode = 503;
    throw error;
  }

  return {
    async generateJson({ systemPrompt, messages }) {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          temperature: 0.3,
          max_tokens: 8192,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(
          data?.error?.message || data?.message || `GLM API 请求失败：${response.status}`,
        );
        error.statusCode = response.status;
        throw error;
      }

      return {
        content: data?.choices?.[0]?.message?.content || "",
        raw: data,
        model,
      };
    },
  };
}

module.exports = {
  DEFAULT_GLM_MODEL,
  GLM_ENDPOINT,
  createGlmAssistantModelProvider,
};
