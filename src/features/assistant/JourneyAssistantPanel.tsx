import {
  Button,
  Heading,
  IconButton,
  Text,
  Textarea,
} from "@chakra-ui/react"
import {
  Copy,
  ImagePlus,
  Send,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react"
import { useEffect, useRef, useState, type KeyboardEvent } from "react"
import type { JourneyMap, JourneyProposal } from "../../tools/journey-map"
import { requestJourneyAssistant } from "./api"
import type { AssistantFeedback, AssistantMessage } from "./types"

const DEFAULT_MESSAGES: AssistantMessage[] = [
  {
    id: "assistant-welcome",
    role: "assistant",
    phase: "message",
    content:
      "描述服务场景、当前问题或想调整的阶段。我会先澄清，再给出可确认的修改提案。",
  },
]

function createMessageId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
}

export default function JourneyAssistantPanel({
  serviceName,
  journey,
  documentId,
  projectId,
  revision,
  initialMessages = DEFAULT_MESSAGES,
  initialAttachment = null,
  onApplyProposal,
  onDraftRevision,
}: {
  serviceName: string
  journey: JourneyMap
  documentId: string
  projectId: string
  revision: number | null
  initialMessages?: AssistantMessage[]
  initialAttachment?: string | null
  onApplyProposal: (proposal: JourneyProposal) => void
  onDraftRevision?: (text: string) => void
}) {
  const [messages, setMessages] = useState<AssistantMessage[]>(initialMessages)
  const [draftValue, setDraftValue] = useState("")
  const [attachmentImage, setAttachmentImage] = useState<string | null>(
    initialAttachment,
  )
  const [messageFeedback, setMessageFeedback] = useState<
    Record<string, AssistantFeedback | undefined>
  >({})
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [isLoading, messages])

  const handleChatImage = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return
    const reader = new FileReader()
    reader.onload = () =>
      setAttachmentImage(typeof reader.result === "string" ? reader.result : null)
    reader.readAsDataURL(file)
  }

  const copyAssistantMessage = async (message: AssistantMessage) => {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopiedMessageId(message.id)
      window.setTimeout(() => {
        setCopiedMessageId((current) => (current === message.id ? null : current))
      }, 1400)
    } catch {
      // Ignore clipboard failures in unsupported environments.
    }
  }

  const applyJourneyProposal = (proposal: JourneyProposal) => {
    onApplyProposal(proposal)
    setMessages((current) => [
      ...current,
      {
        id: createMessageId("assistant"),
        role: "assistant",
        phase: "message",
        content: "修改已应用到左侧用户旅程图。",
      },
    ])
  }

  const draftRevision = (message: AssistantMessage) => {
    const nextDraft = message.proposal?.summary.join("\n") || message.content
    setDraftValue(nextDraft)
    onDraftRevision?.(nextDraft)
  }

  const sendChatMessage = async () => {
    const content = draftValue.trim()
    if ((!content && !attachmentImage) || isLoading) return

    const userMessage: AssistantMessage = {
      id: createMessageId("user"),
      role: "user",
      content,
      image: attachmentImage || undefined,
    }

    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setDraftValue("")
    setAttachmentImage(null)
    setIsLoading(true)

    try {
      const result = await requestJourneyAssistant({
        serviceName,
        currentJourney: journey,
        messages: nextMessages,
        documentId,
        projectId,
        revision,
      })

      setMessages((current) => [
        ...current,
        {
          id: createMessageId("assistant"),
          role: "assistant",
          content: result.message,
          phase: result.phase,
          questions:
            result.phase === "clarify"
              ? result.questions?.map((question) => String(question))
              : undefined,
          proposal: result.phase === "proposal" ? result.proposal : undefined,
        },
      ])
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: createMessageId("assistant"),
          role: "assistant",
          phase: "message",
          content:
            error instanceof Error ? error.message : "AI 服务请求失败，请稍后重试。",
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      void sendChatMessage()
    }
  }

  return (
    <>
      <section className="chat-service" aria-label="AI 对话">
        <Text className="eyebrow">AI Assistant</Text>
        <Heading as="h2" className="panel-heading">
          AI 对话
        </Heading>
        <Text color="fg.muted" fontSize="sm" mt="2">
          当前服务：{serviceName.trim() || "未命名服务"}
        </Text>
      </section>

      <section className="chat-history-wrap" aria-label="AI 对话记录">
        <div className="chat-history">
          {messages.map((message) =>
            message.role === "user" ? (
              <article className="chat-message chat-message-user" key={message.id}>
                {message.image ? (
                  <img
                    alt="用户上传的截图"
                    className="chat-message-image"
                    src={message.image}
                  />
                ) : null}
                {message.content ? <p>{message.content}</p> : null}
              </article>
            ) : (
              <article
                className="chat-message chat-message-assistant"
                key={message.id}
              >
                {message.phase === "clarify" && message.questions?.length ? (
                  <div className="proposal-preview">
                    <ul>
                      {message.questions.map((question, index) => (
                        <li key={`${message.id}-${index}`}>{question}</li>
                      ))}
                    </ul>
                  </div>
                ) : message.content ? (
                  <p>{message.content}</p>
                ) : null}

                {message.proposal ? (
                  <div className="proposal-preview">
                    <strong>建议修改</strong>
                    <ul>
                      {message.proposal.summary.map((item, index) => (
                        <li key={`${message.id}-summary-${index}`}>{item}</li>
                      ))}
                    </ul>
                    <div className="proposal-actions">
                      <Button
                        className="proposal-confirm"
                        onClick={() => applyJourneyProposal(message.proposal!)}
                      >
                        确认更新
                      </Button>
                      <Button
                        className="proposal-revise"
                        onClick={() => draftRevision(message)}
                      >
                        继续调整
                      </Button>
                    </div>
                  </div>
                ) : null}

                <div className="assistant-actions">
                  <IconButton
                    aria-label="复制回复"
                    className="chat-icon-button"
                    onClick={() => void copyAssistantMessage(message)}
                    title={copiedMessageId === message.id ? "已复制" : "复制"}
                  >
                    <Copy size={14} />
                  </IconButton>
                  <IconButton
                    aria-label="喜欢回复"
                    aria-pressed={messageFeedback[message.id] === "like"}
                    className={`chat-icon-button ${
                      messageFeedback[message.id] === "like" ? "is-active" : ""
                    }`}
                    onClick={() =>
                      setMessageFeedback((current) => ({
                        ...current,
                        [message.id]:
                          current[message.id] === "like" ? undefined : "like",
                      }))
                    }
                  >
                    <ThumbsUp size={14} />
                  </IconButton>
                  <IconButton
                    aria-label="不喜欢回复"
                    aria-pressed={messageFeedback[message.id] === "dislike"}
                    className={`chat-icon-button ${
                      messageFeedback[message.id] === "dislike"
                        ? "is-active"
                        : ""
                    }`}
                    onClick={() =>
                      setMessageFeedback((current) => ({
                        ...current,
                        [message.id]:
                          current[message.id] === "dislike"
                            ? undefined
                            : "dislike",
                      }))
                    }
                  >
                    <ThumbsDown size={14} />
                  </IconButton>
                </div>
              </article>
            ),
          )}

          {isLoading ? (
            <div className="chat-thinking">AI 正在整理修改建议...</div>
          ) : null}
          <div ref={chatEndRef} />
        </div>
      </section>

      <section className="chat-composer">
        <div className="composer-shell">
          <div className="composer-input-area">
            {attachmentImage ? (
              <div className="chat-attachment">
                <img alt="待发送截图" src={attachmentImage} />
                <IconButton
                  aria-label="移除截图"
                  className="attachment-remove"
                  onClick={() => setAttachmentImage(null)}
                >
                  <X size={14} />
                </IconButton>
              </div>
            ) : null}
            <Textarea
              aria-label="输入对话内容"
              disabled={isLoading}
              onChange={(event) => setDraftValue(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="描述需要调整的旅程阶段、内容或上下文"
              rows={3}
              value={draftValue}
            />
          </div>

          <div className="composer-actions">
            <input
              accept="image/*"
              hidden
              onChange={(event) => {
                handleChatImage(event.target.files?.[0])
                event.currentTarget.value = ""
              }}
              ref={fileInputRef}
              type="file"
            />
            <IconButton
              aria-label="添加截图"
              className="composer-icon-button"
              disabled={isLoading}
              onClick={() => fileInputRef.current?.click()}
              title="添加截图"
            >
              <ImagePlus size={16} />
            </IconButton>
            <IconButton
              aria-label="发送消息"
              className="composer-send-button"
              disabled={isLoading || (!draftValue.trim() && !attachmentImage)}
              onClick={() => void sendChatMessage()}
            >
              <Send size={16} />
            </IconButton>
          </div>
        </div>
      </section>
    </>
  )
}
