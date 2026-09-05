import { Effect } from "effect"
import { journal, record, type Stage } from "./journal"
import { AutoModeTier } from "./tier"
import { type ClassifierModel, type GateInput, type GateOutput, type Variant } from "./types"

export namespace AutoModePipeline {
  export function variant(): Variant {
    const raw = process.env.KILO_AUTO_MODE_VARIANT ?? "cascade"
    if (raw === "off" || raw === "single" || raw === "cascade") return raw
    return "cascade"
  }

  export function enabled() {
    return process.env.KILO_AUTO_MODE_GATE === "1"
  }

  export const evaluate = Effect.fn("AutoModePipeline.evaluate")(function* (input: GateInput) {
    const result = yield* Effect.promise(async () => {
      try {
        const policies: unknown = JSON.parse(process.env.KILO_AUTO_MODE_POLICIES ?? "[]")
        if (!Array.isArray(policies) || !policies.every((rule) => typeof rule === "string")) {
          throw new Error("KILO_AUTO_MODE_POLICIES must be a JSON array of strings")
        }
        const { LlmPermissionClassifier } = await import("./llm-classifier")
        return await evaluateWith({ ...input, policies }, variant(), LlmPermissionClassifier)
      } catch {
        const result: GateOutput = {
          decision: "ask",
          layer: "none",
          reason: "Invalid administrator policy configuration",
          summary: "Automatic review unavailable",
          latencyMs: 0,
        }
        await journal({ ...record(input, variant(), result, []), error: "policy_configuration" })
        return result
      }
    })
    if (result.decision === "allow") return null
    yield* Effect.logInfo("auto-mode classifier", {
      decision: result.decision,
      layer: result.layer,
      latencyMs: result.latencyMs,
    })
    return result
  })
}

/** Shared by runtime and evals so one-stage and cascade receive the exact same input. */
export async function evaluateWith(input: GateInput, variant: Variant, model: ClassifierModel): Promise<GateOutput> {
  const stages: Stage[] = []
  const observer: ClassifierModel = {
    async classify(request, stage) {
      const start = performance.now()
      try {
        const result = await model.classify(request, stage)
        stages.push({
          stage,
          decision: result.decision,
          latencyMs: performance.now() - start,
          model: result.model ?? null,
          inputTokens: result.inputTokens ?? null,
          outputTokens: result.outputTokens ?? null,
          error: result.error ?? null,
        })
        return result
      } catch (error) {
        stages.push({
          stage,
          decision: "ask",
          latencyMs: performance.now() - start,
          model: null,
          inputTokens: null,
          outputTokens: null,
          error: "classifier_exception",
        })
        throw error
      }
    },
  }
  const result = await evaluate(input, variant, observer)
  await journal(record(input, variant, result, stages))
  return { ...result, stages }
}

async function evaluate(input: GateInput, variant: Variant, model: ClassifierModel): Promise<GateOutput> {
  const start = performance.now()
  if (variant === "off") return output({ decision: "allow", reason: "classifier disabled" }, "none", start)

  // Prose policy can restrict reads/edits too; it must not be bypassed by the fast path.
  const tier = input.policies?.length ? null : AutoModeTier.evaluate(input)
  if (tier) return tier

  if (variant === "single") {
    const result = await classifyOrAsk(model, input, 2)
    return output(result, "classifier_stage_2", start)
  }

  const screen = await classifyOrAsk(model, input, 1)
  if (screen.error) return output(screen, "classifier_stage_1", start)
  if (screen.decision === "allow") return output(screen, "classifier_stage_1", start)

  const review = await classifyOrAsk(model, input, 2)
  return output(review, "classifier_stage_2", start)
}

async function classifyOrAsk(model: ClassifierModel, input: GateInput, stage: 1 | 2) {
  try {
    return await model.classify(input, stage)
  } catch (error) {
    return {
      error: "classifier_exception",
      decision: "ask" as const,
      risk: "medium" as const,
      summary: "The automatic check failed",
      reason: error instanceof Error ? error.message : "unknown classifier error",
    }
  }
}

function output(
  result: { decision: GateOutput["decision"]; reason: string; summary?: string; risk?: GateOutput["risk"] },
  layer: GateOutput["layer"],
  start: number,
): GateOutput {
  return { ...result, layer, latencyMs: Math.round(performance.now() - start) }
}
