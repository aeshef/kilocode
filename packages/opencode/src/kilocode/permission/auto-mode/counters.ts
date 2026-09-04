const WARN_AT = 3
const MAX_BLOCKS = 20

const counts = new Map<string, number>()

export namespace AutoModeCounters {
  export function record(sessionID: string) {
    const next = (counts.get(sessionID) ?? 0) + 1
    counts.set(sessionID, next)
    return { count: next, warn: next >= WARN_AT, exhausted: next >= MAX_BLOCKS }
  }

  export function get(sessionID: string) {
    return counts.get(sessionID) ?? 0
  }

  /** Test-only */
  export function reset(sessionID?: string) {
    if (sessionID) counts.delete(sessionID)
    else counts.clear()
  }
}
