import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import type { GateOutput } from "./types"

/** Deny-and-continue: tool error with an actionable message for the model. */
export class AutoModeGateDeniedError extends PermissionV1.DeniedError {
  readonly gate: GateOutput
  readonly blockCount: number

  constructor(gate: GateOutput, permission: string, pattern: string, blockCount: number) {
    super({
      ruleset: {
        permission,
        pattern,
        action: "deny" as const,
        source: "auto_mode_gate",
        layer: gate.layer,
        reason: gate.reason,
        blockCount,
      },
    })
    this.gate = gate
    this.blockCount = blockCount
  }

  override get message() {
    const suffix =
      this.blockCount >= 20
        ? " Too many blocked actions in this session; stop and ask the user."
        : this.blockCount >= 3
          ? ` (${this.blockCount} blocks this session — consider a different approach.)`
          : ""
    const effect = this.gate.summary ? ` Planned effect: ${this.gate.summary}.` : ""
    return `Auto mode security gate blocked this action (${this.gate.layer}): ${this.gate.reason}.${effect}${suffix} Use a safer alternative and continue.`
  }
}
