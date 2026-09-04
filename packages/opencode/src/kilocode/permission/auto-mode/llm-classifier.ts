import { generateText } from "ai"
import { mergeDeep } from "remeda"
import { Effect } from "effect"
import { AppRuntime } from "@/effect/app-runtime"
import { Provider } from "@/provider/provider"
import { ProviderTransform } from "@/provider/transform"
import { classifierPrompt } from "./prompt"
import type { ClassifierModel, GateInput, ModelDecision } from "./types"

async function resolveLanguage() {
  return AppRuntime.runPromise(
    Provider.Service.use((svc) =>
      Effect.gen(function* () {
        const ref = yield* svc.defaultModel()
        const model = (yield* svc.getSmallModel(ref.providerID)) ?? (yield* svc.getModel(ref.providerID, ref.modelID))
        return { model, language: yield* svc.getLanguage(model) }
      }),
    ),
  )
}

export const LlmPermissionClassifier: ClassifierModel = {
  async classify(input, stage) {
    const resolved = await resolveLanguage()
    const result = await generateText({
      model: resolved.language,
      temperature: 0,
      maxRetries: 1,
      providerOptions: ProviderTransform.providerOptions(
        resolved.model,
        mergeDeep(ProviderTransform.smallOptions(resolved.model), resolved.model.options),
      ),
      prompt: classifierPrompt(input, stage),
    })
    if (stage === 1) {
      return result.text.trim().toUpperCase().startsWith("ALLOW")
        ? { decision: "allow", risk: "low", summary: "low-risk action", reason: "stage 1 allowed" }
        : { decision: "ask", risk: "medium", summary: "deeper review required", reason: "stage 1 escalated" }
    }
    return parseDecision(result.text)
  },
}

export function parseDecision(text: string): ModelDecision {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return fallback("model returned invalid JSON")
  try {
    const value = JSON.parse(match[0]) as Partial<ModelDecision>
    if (!value.decision || !["allow", "deny", "ask"].includes(value.decision)) return fallback("invalid decision")
    return {
      decision: value.decision,
      risk: value.risk && ["low", "medium", "high"].includes(value.risk) ? value.risk : "medium",
      summary: typeof value.summary === "string" ? value.summary : "No summary",
      reason: typeof value.reason === "string" ? value.reason : "No reason",
      confidence: typeof value.confidence === "number" ? value.confidence : undefined,
    }
  } catch {
    return fallback("model returned malformed JSON")
  }
}

function fallback(reason: string): ModelDecision {
  return { decision: "ask", risk: "medium", summary: "Classifier failed; human review required", reason }
}
