# Kilo auto mode prototype

## Demo launcher and JSONL journal

Run from the repository root after installing dependencies:

```bash
bun script/auto-mode-demo.ts --check
bun script/auto-mode-demo.ts --mode=cascade
```

Modes: off, single, cascade. The launcher forces compilation of the local backend, bundles the extension and opens isolated VS Code with a fresh fictional project. It never uses the global kilo binary. Each run has its own workspace/profile in ignored `.auto-mode-runs/<run-id>/`. Configure a model/provider in the isolated instance first. Actual classifier model IDs are recorded on completed stage calls.

The manifest records commit, mode and log path. The launcher requires at least 5 GiB free (a preflight estimate). Full build/UI launch has not been verified on this machine because available space is below this threshold.

For another backend launch, set `KILO_AUTO_MODE_LOG=/absolute/path/decisions.jsonl`.

Each completed pipeline evaluation, including allow, tier and off, writes one JSONL line: run/scenario IDs, input/correlation hashes, policy/prompt hashes, revision when supplied by the launcher, final decision, total latency and ordered stage decisions with duration, actual model and input/output tokens. Unavailable fields are null; dollar cost is not estimated without pricing.

Commands, paths, user messages, policy text and model prose are omitted. Hashes help correlate records but do not anonymize guessable inputs. Upstream Kilo logs are separate and may still contain sensitive data. Use synthetic fixtures.

Explicit Kilo policy decisions before our hook are not covered. These records do not prove task completion, damage or human confirmation; the benchmark collects those separately. Stage 2 is logged only if called.

Journal failures warn without changing authorization. Writes are serialized within one backend; use a separate file per backend process, as the demo launcher does.

Прототип для проверки гипотезы: действие агента должно автоматически выполняться только тогда, когда его последствия явно разрешены запросом пользователя.

Содержательный отчёт о заимствованных решениях, экспериментах и незакрытых пунктах: [`RESULTS.md`](RESULTS.md).

## Варианты

```text
off      обычное автоматическое подтверждение Kilo
single   одна подробная модельная проверка
cascade  быстрая проверка → подробная проверка сомнительных действий
```

Классификатор получает только сообщение пользователя и параметры инструмента. Рассуждения агента и результаты инструментов исключены из входа.

## Запуск тестов

```bash
cd packages/opencode
bun install
bun run typecheck
bun test test/kilocode/permission/auto-mode.test.ts
```

## Включение прототипа

```bash
KILO_AUTO_MODE_GATE=1 KILO_AUTO_MODE_VARIANT=single kilo run --auto "проверь состояние проекта"
KILO_AUTO_MODE_GATE=1 KILO_AUTO_MODE_VARIANT=cascade kilo run --auto "проверь состояние проекта"
```

Используется small/default model из текущей конфигурации Kilo.

## Где код

- `packages/opencode/src/permission/index.ts` — точка включения;
- `packages/opencode/src/kilocode/permission/auto-mode/pipeline.ts` — варианты архитектуры;
- `packages/opencode/src/kilocode/permission/auto-mode/llm-classifier.ts` — вызов модели;
- `packages/opencode/src/kilocode/permission/auto-mode/prompt.ts` — проверка явного разрешения;
- `packages/opencode/test/kilocode/permission/auto-mode.test.ts` — тесты;
- `docs/auto-mode-experiment.md` — гипотеза, метрики и ограничения.

## Статус

### Политики и объяснение в подтверждении

Политики администратора передаются обоим уровням через JSON-массив в окружении **процесса backend**:

```bash
export KILO_AUTO_MODE_POLICIES='["Не публиковать данные вне внутренних сервисов","Диагностика допустима только без секретов"]'
export KILO_AUTO_MODE_GATE=1
```

Это модельные инструкции, а не гарантированные запреты: обязательные ограничения по-прежнему задаются детерминированными правилами Kilo. При наличии prose-политик отключён fast-path чтений/редактирований, чтобы он не обходил правила администратора.

Когда классификатор запрашивает человека, VS Code PermissionDock и CLI footer показывают краткое последствие, причину запроса и оригинальный вызов. Отказ агенту содержит причину и запрошенную у модели безопасную альтернативу. Объяснение — оценка модели, не доказательство реального эффекта.

Сервер отклоняет автоматическое и постоянное подтверждение таких запросов. VS Code не забирает их в auto-approve; headless CLI отклоняет их, поскольку человека нет. Старые клиенты без поддержки метаданных могут оставлять запрос ожидающим. Защита опирается на контракт интерактивного клиента, а не на криптографическое доказательство присутствия человека.

Для проверки UI нужен backend из этой ветки; установленный глобально `kilo` или старый бинарник расширения не содержит изменений. Визуальная проверка в запущенном VS Code ещё не выполнена.

Typecheck и 8 unit-тестов проходят. Живой прогон `single` против `cascade` должен выполняться на сценариях командного бенчмарка с одинаковой моделью и настройками.
