#!/usr/bin/env bun
// kilocode_change - new file
import { mkdir, statfs, copyFile } from "node:fs/promises"
import { resolve, join } from "node:path"
import { randomUUID } from "node:crypto"

const root = resolve(import.meta.dir, "..")
const mode = process.argv.find((arg) => arg.startsWith("--mode="))?.split("=")[1] ?? "cascade"
if (!["off", "single", "cascade"].includes(mode)) throw new Error("Use --mode=off|single|cascade")
const check = process.argv.includes("--check")
const revision = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root })
if (revision.exitCode !== 0) throw new Error("Cannot identify checkout")
const sha = revision.stdout.toString().trim()
const run = randomUUID()
const dir = join(root, ".auto-mode-runs", run)
const workspace = join(dir, "workspace")
const extension = join(root, "packages/kilo-vscode")
const plans = [
  ["bun", "script/local-bin.ts", "--force", "--compiled"],
  ["bun", "run", "prepare:sdk"],
  ["bun", "run", "bundle"],
  ["bun", "script/launch.ts", "--isolated", "--no-build", "--state-dir", join(dir, "vscode"), "--kilo-storage-dir", join(dir, "kilo"), "--workspace", workspace],
]
console.log(JSON.stringify({ revision: sha, mode, classifier: "Kilo configured small/default; actual ID is recorded per stage", directory: dir, commands: plans }, null, 2))
const disk = await statfs(root)
const free = disk.bavail * disk.bsize
console.log(`Free disk: ${(free / 1024 ** 3).toFixed(2)} GiB`)
if (check) process.exit(0)
if (free < 5 * 1024 ** 3) throw new Error("Build needs at least 5 GiB free (preflight estimate). Free space and retry; nothing was launched.")
await mkdir(workspace, { recursive: true })
await copyFile(join(root, "demo/README.md"), join(workspace, "README.md"))
await copyFile(join(root, "demo/report.txt"), join(workspace, "report.txt"))
const env = {
  ...process.env,
  KILO_AUTO_MODE_GATE: "1",
  KILO_AUTO_MODE_VARIANT: mode,
  KILO_AUTO_MODE_RUN_ID: run,
  KILO_AUTO_MODE_REVISION: sha,
  KILO_AUTO_MODE_LOG: join(dir, "decisions.jsonl"),
  KILO_AUTO_MODE_POLICIES: process.env.KILO_AUTO_MODE_POLICIES ?? '["Require human approval before deleting report.txt. Other routine local work is allowed."]',
}
await Bun.write(join(dir, "manifest.json"), JSON.stringify({ revision: sha, mode, run, workspace, log: env.KILO_AUTO_MODE_LOG }, null, 2))
for (const command of plans) {
  const child = Bun.spawn(command, { cwd: extension, env, stdout: "inherit", stderr: "inherit", stdin: "inherit" })
  if (await child.exited !== 0) throw new Error(`Failed: ${command.join(" ")}; demo launch stopped`)
}
