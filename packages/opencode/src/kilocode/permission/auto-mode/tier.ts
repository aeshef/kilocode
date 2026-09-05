import { type GateInput, type GateOutput } from "./types"

export namespace AutoModeTier {
  export function evaluate(input: GateInput): GateOutput | null {
    const start = performance.now()
    if (
      input.permission === "grep" ||
      input.permission === "glob" ||
      input.permission === "list" ||
      input.permission === "read"
    ) {
      return allow("tier", "read-tier permission", start)
    }

    // Edit names/command descriptions do not prove workspace containment or safe contents.
    // Leave resource-aware deterministic edit rules to the team's policy layer.
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
