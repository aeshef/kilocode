import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { expect, beforeEach, afterEach } from "bun:test"
import { Effect, Fiber, Layer } from "effect"
import * as CrossSpawnSpawner from "@opencode-ai/core/cross-spawn-spawner"
import { Permission } from "@/permission"
import * as Config from "@/config/config"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { PermissionProvenance } from "@/kilocode/permission/provenance"
import { SessionID } from "@/session/schema"
import { testEffect } from "../../lib/effect"

const keys = ["KILO_AUTO_MODE_GATE", "KILO_AUTO_MODE_VARIANT", "KILO_AUTO_MODE_POLICIES"] as const
const saved = keys.map((key) => process.env[key])
beforeEach(() => {
  process.env.KILO_AUTO_MODE_GATE = "1"
  process.env.KILO_AUTO_MODE_VARIANT = "single"
  // Exercise the real gate without external models: invalid config must require a human.
  process.env.KILO_AUTO_MODE_POLICIES = "invalid-json"
})
afterEach(() =>
  keys.forEach((key, i) => {
    if (saved[i] === undefined) delete process.env[key]
    else process.env[key] = saved[i]
  }),
)
const it = testEffect(
  Layer.mergeAll(
    AppNodeBuilder.build(Permission.node),
    AppNodeBuilder.build(Config.node),
    AppNodeBuilder.build(CrossSpawnSpawner.node),
  ),
)
const pending = (svc: Permission.Interface) =>
  Effect.gen(function* () {
    for (let i = 0; i < 100; i++) {
      const rows = yield* svc.list()
      if (rows.length) return rows[0]!
      yield* Effect.sleep("10 millis")
    }
    throw new Error("Permission never reached pending state")
  })
const request = (ruleset: PermissionV1.Ruleset): Permission.AskInput => ({
  sessionID: SessionID.make("session_gate_wiring"),
  permission: "bash",
  patterns: ["rm -rf db/test_env"],
  metadata: { command: "rm -rf db/test_env", userMessage: "Fix the tests" },
  always: [],
  ruleset,
})

for (const kind of ["empty", "builtin", "explicit", "off", "disabled"] as const) {
  it.instance(
    `gate wiring: ${kind}`,
    () =>
      Effect.gen(function* () {
        const svc = yield* Permission.Service
        if (kind === "off") process.env.KILO_AUTO_MODE_VARIANT = "off"
        if (kind === "disabled") process.env.KILO_AUTO_MODE_GATE = "0"
        const { prepare } = yield* Effect.promise(() => import("@/kilocode/agent"))
        const defaults = prepare({} as Config.Info).defaultsPatch
        const rules =
          kind === "empty"
            ? []
            : kind === "explicit"
              ? [...defaults, { permission: "bash", pattern: "*", action: "ask" as const }]
              : defaults
        const fiber = yield* svc.ask(request(PermissionProvenance.tagAgent(rules, undefined))).pipe(Effect.forkScoped)
        const row = yield* pending(svc)
        expect(row.metadata.autoModeReview === true).toBe(kind !== "off" && kind !== "disabled")
        if (kind === "builtin" || kind === "empty")
          expect(row.metadata.autoModeReason).toBe("Invalid administrator policy configuration")
        if (kind === "explicit")
          expect(row.metadata.autoModeReason).toBe("Existing permission policy requires human approval")
        yield* svc.reply({ requestID: row.id, reply: "reject" })
        yield* Fiber.await(fiber)
      }),
    { git: true },
  )
}

it.instance(
  "review survives machine reply, always reply and allowEverything",
  () =>
    Effect.gen(function* () {
      const svc = yield* Permission.Service
      const fiber = yield* svc.ask(request([])).pipe(Effect.forkScoped)
      const row = yield* pending(svc)
      yield* svc.reply({ requestID: row.id, reply: "once" })
      expect(yield* svc.list()).toHaveLength(1)
      yield* svc.reply({ requestID: row.id, reply: "always", interactive: true })
      expect(yield* svc.list()).toHaveLength(1)
      yield* svc.allowEverything({ enable: true })
      expect(yield* svc.list()).toHaveLength(1)
      yield* svc.reply({ requestID: row.id, reply: "once", interactive: true })
      expect((yield* Fiber.join(fiber)).manual).toBe(true)
    }),
  { git: true },
)

it.instance(
  "explicit deny remains terminal even with broken classifier configuration",
  () =>
    Effect.gen(function* () {
      const svc = yield* Permission.Service
      const result = yield* svc.ask(request([{ permission: "bash", pattern: "*", action: "deny" }])).pipe(Effect.exit)
      expect(result._tag).toBe("Failure")
      expect(yield* svc.list()).toHaveLength(0)
    }),
  { git: true },
)
