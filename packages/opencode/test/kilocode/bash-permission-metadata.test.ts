// regression test for bash permission metadata.command
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { describe, expect, test } from "bun:test"
import { Effect, Fiber, Layer, ManagedRuntime } from "effect"
import { ShellTool } from "../../src/tool/shell"
import { provideTestInstance } from "../fixture/fixture"
import { tmpdir } from "../fixture/fixture"
import { Shell } from "@opencode-ai/core/shell"
import { SessionID, MessageID } from "../../src/session/schema"
import { Permission } from "../../src/permission"
import { Agent } from "../../src/agent/agent"
import { Truncate } from "../../src/tool/truncate"
import * as CrossSpawnSpawner from "@opencode-ai/core/cross-spawn-spawner"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Plugin } from "../../src/plugin"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    AppNodeBuilder.build(Permission.node),
    AppNodeBuilder.build(CrossSpawnSpawner.node),
    AppNodeBuilder.build(FSUtil.node),
    AppNodeBuilder.build(Plugin.node),
    AppNodeBuilder.build(Truncate.node),
    AppNodeBuilder.build(Agent.node),
    AppNodeBuilder.build(Config.node),
    RuntimeFlags.layer(),
  ),
)

Shell.acceptable.reset()

const baseCtx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "code",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

const capture = (requests: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">>) => ({
  ...baseCtx,
  ask: (req: Omit<Permission.Request, "id" | "sessionID" | "tool">) =>
    Effect.sync(() => {
      requests.push(req)
    }),
})

describe("bash permission metadata.command", () => {
  test.each([false, true])("real shell execution respects auto-mode review: %s", async (active) => {
    const keys = ["KILO_AUTO_MODE_GATE", "KILO_AUTO_MODE_VARIANT", "KILO_AUTO_MODE_POLICIES"] as const
    const saved = keys.map((key) => process.env[key])
    process.env.KILO_AUTO_MODE_GATE = active ? "1" : "0"
    process.env.KILO_AUTO_MODE_VARIANT = "single"
    process.env.KILO_AUTO_MODE_POLICIES = "invalid-json"
    try {
      await using tmp = await tmpdir()
      const marker = `${tmp.path}/gate-marker.txt`
      await Bun.write(marker, "synthetic disposable marker")
      await provideTestInstance({
        directory: tmp.path,
        fn: () =>
          runtime.runPromise(
            Effect.gen(function* () {
              const svc = yield* Permission.Service
              const agents = yield* Agent.Service
              const ruleset = (yield* agents.get("code")).permission
              const bash = yield* ShellTool.pipe(Effect.flatMap((info) => info.init()))
              const fiber = yield* bash
                .execute(
                  { command: "rm -f gate-marker.txt", workdir: tmp.path },
                  {
                    ...baseCtx,
                    ask: (req) => svc.ask({ ...req, sessionID: baseCtx.sessionID, ruleset }).pipe(Effect.asVoid, Effect.orDie),
                  },
                )
                .pipe(Effect.forkScoped)
              const row = yield* Effect.gen(function* () {
                for (let i = 0; i < 100; i++) {
                  const rows = yield* svc.list()
                  if (rows.length) return rows[0]!
                  yield* Effect.sleep("10 millis")
                }
                throw new Error("Shell never asked permission")
              })
              expect(row.permission).toBe("bash")
              expect(row.metadata.autoModeReview === true).toBe(active)
              // Emulate headless client's contract: auto-reply to ordinary asks, reject human-only asks.
              yield* svc.reply({ requestID: row.id, reply: active ? "reject" : "once" })
              yield* Fiber.await(fiber)
            }).pipe(Effect.scoped),
          ),
      })
      expect(await Bun.file(marker).exists()).toBe(active)
    } finally {
      keys.forEach((key, i) => {
        if (saved[i] === undefined) delete process.env[key]
        else process.env[key] = saved[i]
      })
    }
  })

  test("permission prompt shows raw command without tool name prefix", async () => {
    await using tmp = await tmpdir()
    await provideTestInstance({
      directory: tmp.path,
      fn: async () => {
        const bash = await runtime.runPromise(ShellTool.pipe(Effect.flatMap((info) => info.init())))
        const requests: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">> = []
        const command = "echo hello"
        await Effect.runPromise(bash.execute({ command, description: "Echo hello" }, capture(requests)))

        const bashReq = requests.find((r) => r.permission === "bash")
        expect(bashReq).toBeDefined()
        expect(bashReq!.metadata.command).toBe(command)
      },
    })
  })

  test.skipIf(process.platform === "win32").each([
    ["single quoted", "cat << 'EOF'\n$HOME\nEOF"],
    ["double quoted", 'cat << "EOF"\n$HOME\nEOF'],
    ["escaped", "cat << \\EOF\n$HOME\nEOF"],
    ["unquoted", "cat << EOF\n$HOME\nEOF"],
  ] as const)("marks %s heredocs", async (_, command) => {
    await using tmp = await tmpdir()
    await provideTestInstance({
      directory: tmp.path,
      fn: async () => {
        const bash = await runtime.runPromise(ShellTool.pipe(Effect.flatMap((info) => info.init())))
        const requests: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">> = []
        await Effect.runPromise(bash.execute({ command }, capture(requests)))

        const req = requests.find((item) => item.permission === "bash")
        expect(req?.metadata.heredoc).toBe(true)
        expect(req?.metadata.command).toBe(command)
        expect(req?.patterns).toEqual([command])
        expect(req?.always).toEqual(["cat *"])
      },
    })
  })

  test("omits heredoc metadata for ordinary commands", async () => {
    await using tmp = await tmpdir()
    await provideTestInstance({
      directory: tmp.path,
      fn: async () => {
        const bash = await runtime.runPromise(ShellTool.pipe(Effect.flatMap((info) => info.init())))
        const requests: Array<Omit<Permission.Request, "id" | "sessionID" | "tool">> = []
        await Effect.runPromise(bash.execute({ command: "echo hello" }, capture(requests)))

        const req = requests.find((item) => item.permission === "bash")
        expect(req?.metadata.heredoc).toBeUndefined()
      },
    })
  })
})
