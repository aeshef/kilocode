# Auto-mode classifier prototype

Prototype for issue #9138. It tests whether an action is explicitly authorized by the user, rather than merely checking whether a command looks dangerous.

## Compared architectures

```
existing policy would allow OR built-in/default bash ask
  → built-in read (only without prose policies)? → allow
  → single: thorough reviewer
  → cascade: high-recall screen → thorough reviewer only when flagged
  → allow | deny as tool error | ask on classifier failure
```

## Environment

| Variable | Default | Meaning |
|----------|---------|---------|
| `KILO_AUTO_MODE_GATE` | off | Set `1` to enable |
| `KILO_AUTO_MODE_VARIANT` | `cascade` | `off`, `single`, `cascade` |

## Deny-and-continue

- **Deny** → `AutoModeGateDeniedError` (`PermissionDeniedError`) → tool error, agent continues.
- **Block counter** per session: warns in message from 3 blocks; at 20 blocks → `RejectedError` (session stops).
- **Classifier error** → `ask` (fail-closed), not silent allow.

## Hook point

`packages/opencode/src/permission/index.ts` — after rules resolve, before automatic approval or client handling of a default ask. Explicit asks remain human-only while the gate is active.

`session/tools.ts` supplies the last user message. Assistant reasoning and tool outputs are excluded. Therefore a synthetic or poisoned agent reflection cannot authorize its own action.

## Limits (document in defense)

- Uses Kilo's configured small model; model quality still needs measurement on the team's benchmark.
- Deterministic corporate policy is a separate upstream layer owned by the product/policy workstream.
- Sandbox, tool-output probe and complete multi-step defense are out of scope.
