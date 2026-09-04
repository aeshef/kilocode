import { SessionV1 } from "@opencode-ai/core/v1/session"

/** Latest user-visible text in the transcript (reasoning-blind classifier input). */
export function lastUserMessageText(messages: SessionV1.WithParts[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.info.role !== "user") continue
    const text = msg.parts
      .filter((part): part is SessionV1.TextPart => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim()
    if (text) return text
  }
}
