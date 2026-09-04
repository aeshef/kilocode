# Kilo auto mode prototype

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

Typecheck и 8 unit-тестов проходят. Живой прогон `single` против `cascade` должен выполняться на сценариях командного бенчмарка с одинаковой моделью и настройками.
