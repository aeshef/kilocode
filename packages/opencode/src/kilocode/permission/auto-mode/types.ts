export type Decision = "allow" | "deny" | "ask"

export type Layer = "tier" | "classifier_stage_1" | "classifier_stage_2" | "none"

export type Variant = "off" | "single" | "cascade"

export interface GateInput {
  permission: string
  patterns: readonly string[]
  metadata?: Record<string, unknown>
  userMessage?: string
  policies?: readonly string[]
}

export interface GateOutput {
  decision: Decision
  layer: Layer
  reason: string
  summary?: string
  risk?: ModelDecision["risk"]
  latencyMs: number
}

export interface ModelDecision {
  decision: Decision
  reason: string
  summary: string
  risk: "low" | "medium" | "high"
  confidence?: number
  model?: string
  inputTokens?: number
  outputTokens?: number
}

export interface ClassifierModel {
  classify(input: GateInput, stage: 1 | 2): Promise<ModelDecision>
}

export function primaryPattern(input: GateInput): string {
  const fromMeta = input.metadata?.["command"]
  if (typeof fromMeta === "string" && fromMeta.length > 0) return fromMeta
  return input.patterns[0] ?? ""
}
