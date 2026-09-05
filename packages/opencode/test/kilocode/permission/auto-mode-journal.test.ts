import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { evaluateWith } from "@/kilocode/permission/auto-mode/pipeline"
import { record } from "@/kilocode/permission/auto-mode/journal"

test("journal omits user text, commands and model prose", () => {
  const row = record(
    { permission: "bash", patterns: ["secret-token"], userMessage: "password", policies: ["private policy"] },
    "single",
    { decision: "ask", reason: "secret-token", summary: "password", layer: "classifier_stage_2", latencyMs: 2 },
    [],
  )
  const text = JSON.stringify(row)
  for (const secret of ["secret-token", "password", "private policy"]) expect(text).not.toContain(secret)
})

test("parallel checks write complete lines for allows and both cascade stages", async () => {
  const dir = await mkdtemp(join(tmpdir(), "auto-mode-journal-"))
  const prior = process.env.KILO_AUTO_MODE_LOG
  process.env.KILO_AUTO_MODE_LOG = join(dir, "decisions.jsonl")
  try {
    await Promise.all(
      Array.from({ length: 8 }, () =>
        evaluateWith({ permission: "bash", patterns: ["git status"] }, "cascade", {
          async classify(_input, stage) {
            return {
              decision: stage === 1 ? "ask" : "allow",
              risk: "low",
              reason: "ok",
              summary: "ok",
              model: "fixture",
              inputTokens: 5,
              outputTokens: 2,
            }
          },
        }),
      ),
    )
    const rows = (await readFile(process.env.KILO_AUTO_MODE_LOG, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(rows).toHaveLength(8)
    expect(new Set(rows.map((row) => row.id)).size).toBe(8)
    for (const row of rows) {
      expect(row.decision).toBe("allow")
      expect(row.stages.map((stage: { stage: number }) => stage.stage)).toEqual([1, 2])
      expect(row.stages[1].inputTokens).toBe(5)
    }
  } finally {
    if (prior === undefined) delete process.env.KILO_AUTO_MODE_LOG
    else process.env.KILO_AUTO_MODE_LOG = prior
    await rm(dir, { recursive: true, force: true })
  }
})
