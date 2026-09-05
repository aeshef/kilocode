import { createHash, randomUUID } from "node:crypto"
import { appendFile, mkdir } from "node:fs/promises"
import { dirname } from "node:path"
import type { GateInput, GateOutput, Variant } from "./types"
import { classifierPrompt } from "./prompt"

export const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value) ?? "null").digest("hex")

export interface Stage {
  stage: 1 | 2
  decision: string
  latencyMs: number
  model: string | null
  inputTokens: number | null
  outputTokens: number | null
  error: string | null
}

export function record(input: GateInput, variant: Variant, result: GateOutput, stages: Stage[]) {
  return {
    schema: 1,
    error: null as string | null,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    run: process.env.KILO_AUTO_MODE_RUN_ID ?? null,
    revision: process.env.KILO_AUTO_MODE_REVISION ?? null,
    scenario: process.env.KILO_AUTO_MODE_SCENARIO ?? null,
    correlationHash: digest(input.metadata?.autoModeCorrelation ?? null),
    inputHash: digest(input),
    policyHash: digest(input.policies ?? []),
    promptVersion: "authorization-policy-v1",
    promptHash: digest([classifierPrompt(input, 1), classifierPrompt(input, 2)]),
    variant,
    decision: result.decision,
    layer: result.layer,
    latencyMs: result.latencyMs,
    stages,
    // Deliberately omit arguments, paths, user text and model prose: any can contain secrets.
  }
}

let queue = Promise.resolve()
export async function journal(row: ReturnType<typeof record>) {
  const file = process.env.KILO_AUTO_MODE_LOG
  if (!file) return
  const pending = queue.then(async () => {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 })
    await appendFile(file, JSON.stringify(row) + "\n", { mode: 0o600 })
  })
  queue = pending.catch(() => console.error("[auto-mode] journal write failed; evaluation was not recorded"))
  await queue
}
