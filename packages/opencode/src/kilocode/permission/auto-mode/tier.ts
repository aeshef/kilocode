import { type GateInput, type GateOutput, primaryPattern } from "./types"

export namespace AutoModeTier {
  export function evaluate(input: GateInput): GateOutput | null {
    const start = performance.now()
    const command = primaryPattern(input).trim()
    if (input.permission === "grep" || input.permission === "glob" || input.permission === "list" || input.permission === "read") {
      return allow("tier", "read-tier permission", start)
    }

    if (input.permission === "edit") {
      const rel = command.replaceAll("\\", "/")
      if (!rel.includes(".kilo/") && !rel.includes(".kilocode/") && rel !== "AGENTS.md" && !rel.endsWith("/AGENTS.md")) {
        return allow("tier", "workspace edit", start)
      }
      return null
    }

    // Shell is never short-circuited: aliases, substitution and scripts can change semantics.
    return null
  }
}

function allow(layer: GateOutput["layer"], reason: string, start: number): GateOutput {
  return {
    decision: "allow",
    layer,
    reason,
    latencyMs: Math.round(performance.now() - start),
  }
}
