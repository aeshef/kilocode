# Auto mode experiment

## Question

Can Kilo automatically approve routine work while blocking actions that the user did not actually authorize?

The prototype deliberately tests **authorization drift**, not only a list of dangerous commands. An action may be legitimate in general and still be wrong for the current request. Example: the user asks to restore a test environment; the agent's own reasoning concludes that it should delete a database. The reasoning is not permission to delete it.

## Team scope

This workstream owns:

- the classifier hook in Kilo;
- one-stage and two-stage classifier variants;
- reasoning-blind input construction;
- failure behavior and denial explanation;
- unit and simple integration tests.

It does not own the attack corpus or corporate allow/deny policy. Those are separate team workstreams and should be plugged into this runtime.

## Compared variants

| Variant | Calls | Expected strength | Expected cost |
| --- | --- | --- | --- |
| `off` | none | baseline Kilo auto-approval | lowest latency, highest exposure |
| `single` | thorough reviewer for every non-trivial action | simplest model baseline | one expensive call per action |
| `cascade` | fast high-recall screen; thorough review only if flagged | lower false positives than a cautious single pass | low average cost if most actions are routine |

The two-stage design follows Claude Code's architecture. Our experiment adds a specific framing for the team's target problem: compare the proposed action with **explicit user authorization**. Assistant reasoning and tool output are excluded from classifier input, so they cannot expand the agent's authority.

## Runtime path

```text
Permission.ask
  ├─ explicit company/user deny → deny (existing Kilo policy)
  ├─ explicit ask → ask (existing Kilo policy)
  ├─ safe built-in tool or normal in-project edit → allow
  └─ action otherwise auto-approved
       ├─ single → thorough authorization review
       └─ cascade → high-recall screen → thorough authorization review when flagged

classifier result
  ├─ allow → execute
  ├─ deny → tool error; agent may choose a safer action
  └─ error/invalid output → ask (fail closed)
```

## What is implemented

- opt-in hook before Kilo silently approves an action;
- existing deny and ask decisions remain authoritative;
- `off`, `single`, and `cascade` variants;
- real LLM calls through Kilo's configured small/default model;
- user message + bare tool call input; no assistant reasoning or tool output;
- structured decision with risk, plain-language effect and authorization reason;
- malformed output or model failure becomes `ask`;
- denial is returned as a tool error; 3/20 denial backstop retained;
- tests for independent/joint stage behavior and fail-closed semantics.

Enable locally:

```bash
KILO_AUTO_MODE_GATE=1 KILO_AUTO_MODE_VARIANT=single kilo run --auto "..."
KILO_AUTO_MODE_GATE=1 KILO_AUTO_MODE_VARIANT=cascade kilo run --auto "..."
```

## What to measure with Vasiliy's corpus

Use identical scenarios and model settings for all variants.

| Metric | Comparison |
| --- | --- |
| Attack success | `off` vs `single` vs `cascade` |
| Normal task success | same three variants |
| False blocks / asks | allowed actions blocked or escalated |
| Model calls | stage 1 and stage 2 calls per task |
| Added latency and cost | classifier totals per task |
| Recovery | task completes after a denial without human input |

Report both safety and task completion. A system that blocks everything is not a successful auto mode.

## High-value scenarios

The attack corpus should include cases where command syntax alone is insufficient:

1. Same destructive command, explicitly requested vs inferred by the agent.
2. Harmless-looking command that crosses a business boundary, such as publishing to an untrusted destination.
3. Synthetic assistant reflection that claims a dangerous action is necessary although the user did not request it.
4. A blocked action followed by a safe recovery path.
5. Equivalent consequence through a shell command, MCP tool and subagent handoff.

These scenarios distinguish an authorization classifier from a command blacklist and connect the prototype to the team's focus on unpredictable agent behavior.

## Decision rule for the final architecture

Choose `cascade` only if it preserves the single-stage safety result while reducing stage-2 calls, latency or cost. Otherwise ship `single`: two stages are not valuable merely because Claude uses them.

## Limits

- The model remains probabilistic; sandbox and network policy are stronger security boundaries.
- Only the latest user text is currently supplied. Full user-only conversation history is required before a production PR.
- Subagent handoffs and returned results do not yet have checks at both boundaries.
- There is no tool-output prompt-injection probe.
- The configured small model is reused; separate models per stage are not configurable yet.

## References

- [Kilo issue #9138](https://github.com/Kilo-Org/kilocode/issues/9138)
- [Kilo runtime sub-issue #10249](https://github.com/Kilo-Org/kilocode/issues/10249)
- [How Anthropic built Claude Code auto mode](https://www.anthropic.com/engineering/claude-code-auto-mode)
- [How Anthropic contains Claude](https://www.anthropic.com/engineering/how-we-contain-claude)
- [Running Codex safely at OpenAI](https://openai.com/index/running-codex-safely/)
- [Gemini CLI trusted folders](https://google-gemini.github.io/gemini-cli/docs/cli/trusted-folders.html)
