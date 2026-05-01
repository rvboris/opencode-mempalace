# @rvboris/opencode-mempalace

**Персистентная память для OpenCode — нулевая конфигурация, видимый результат.**

Твой ИИ-ассистент забывает всё между сессиями. Этот плагин это исправляет. Он незаметно сохраняет важное и находит его, когда нужно — без лишних подсказок и ручной работы.

[English version](./README.md)

---

## Что он делает

Перед каждым ответом плагин ищет в памяти релевантный контекст. После каждой сессии — тихо сохраняет устойчивые знания. Тебе не нужно говорить «запомни это» — но если скажешь, плагин услышит.

```
Ты: "Какую систему сборки мы используем?"
ИИ:  [ищет в памяти] → "Bun. Это решение приняли 10 апреля."
```

### Результат

- Ответы, опирающиеся на прошлые решения, предпочтения и историю проекта
- Не нужно повторять объяснения от сессии к сессии
- Приватность: секреты и приватные блоки никогда не сохраняются
- Работает полностью локально — без облака, API-ключей и MCP-сервера

## Быстрый старт

**Требования:** [OpenCode](https://opencode.ai) и Python 3.10+ с pip.

```bash
pip install mempalace
mempalace init ~/.mempalace/palace
```

Добавь в `opencode.json`:

```json
{
  "plugin": ["@rvboris/opencode-mempalace"]
}
```

Готово. Поиск по памяти, автосохранение и оба инструмента активны сразу.

## Возможности

### Скрытый поиск

Перед каждым ответом плагин подставляет инструкцию «сначала проверь память». Модель видит релевантный контекст без лишнего шума в чате.

### Фоновое автосохранение

При простое сессии, компактизации или завершении — плагин анализирует транскрипт, извлекает устойчивые факты и сохраняет их в нужную область памяти.

### `mempalace_memory` — единый инструмент

Четыре режима, один интерфейс:

| Режим | Назначение |
|---|---|
| `save` | Сохранить предпочтение, факт или решение |
| `search` | Найти релевантную память по запросу |
| `kg_add` | Добавить структурированный факт в граф знаний |
| `diary_write` | Записать короткую рабочую заметку |

Примеры:

```text
mempalace_memory  mode: save  scope: user  room: preferences  content: Предпочитает краткие ответы.
```

```text
mempalace_memory  mode: search  scope: project  room: decisions  query: система сборки
```

```text
mempalace_memory  mode: kg_add  subject: my-repo  predicate: uses  object: bun
```

### `mempalace_status` — видимое доказательство

Проверь, реально ли плагин помогает:

```text
mempalace_status
```

Показывает процент попаданий при поиске, последний результат автосохранения, превью памяти и накопительные счётчики. Для полного отчёта — `verbose: true`.

### TUI HUD — статистика памяти в строке промпта

Компактная строка статистики текущей сессии в области ввода OpenCode:

```
MEM hits 3 · saved 2 · failed 0 · writes 1
```

Цветовые индикаторы для `SKIPPED` и `FAILED`. Требует записи в `tui.json` (см. ниже).

## Области памяти

**Память пользователя** — кросс-проектные предпочтения и привычки:

- `preferences` — стиль кода, предпочтения общения
- `workflow` — рабочие паттерны, выбор инструментов
- `communication` — язык, формат ответов

**Память проекта** — знания, привязанные к репозиторию:

- `architecture` — архитектурные решения, паттерны
- `workflow` — команды сборки, CI-конфиг
- `decisions` — ADR, компромиссы
- `bugs` — известные баги, обходные пути
- `setup` — настройка окружения, зависимости

## Приватность

- Блоки `<private>...</private>` уважаются и никогда не сохраняются
- Типовые секреты (API-ключи, токены, пароли) скрываются перед записью
- Полностью приватное содержимое пропускается целиком

## Настройка

Необязательный файл конфигурации: `~/.config/opencode/mempalace.jsonc`

```jsonc
{
  "autosaveEnabled": true,
  "retrievalEnabled": true,
  "keywordSaveEnabled": true,
  "maxInjectedItems": 6,
  "retrievalQueryLimit": 5,
  "privacyRedactionEnabled": true
}
```

Переменные окружения:

| Переменная | Назначение |
|---|---|
| `MEMPALACE_AUTOSAVE_ENABLED` | Включить/выключить фоновое автосохранение |
| `MEMPALACE_RETRIEVAL_ENABLED` | Включить/выключить скрытый поиск |
| `MEMPALACE_KEYWORD_SAVE_ENABLED` | Включить/выключить сохранение по ключевым словам |
| `MEMPALACE_PRIVACY_REDACTION_ENABLED` | Включить/выключить скрытие секретов |
| `MEMPALACE_ADAPTER_PYTHON` | Путь к бинарнику Python |
| `MEMPALACE_ADAPTER_TIMEOUT_MS` | Таймаут адаптера (по умолчанию 15000) |

## Настройка TUI HUD

Чтобы включить отображение статистики в строке промпта, добавь `tui.json` в каталог конфигурации OpenCode:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [
    "file:///путь/до/mempalace-autosave/plugin/tui/index.tsx"
  ]
}
```

Или при установке из npm — используй пакетный вход:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["@rvboris/opencode-mempalace/tui"]
}
```

## Как это работает

```
Сообщение пользователя
  → системный хук подставляет «сначала проверь память»
  → модель вызывает mempalace_memory [search]
  → результаты влияют на ответ

Сессия завершается / простаивает
  → хук событий анализирует транскрипт
  → Python-адаптер сохраняет устойчивые факты через MemPalace
```

Плагин использует локальную Python-прослойку (`bridge/mempalace_adapter.py`) для работы с MemPalace. Ему **не нужен** MCP-сервер MemPalace.

## Совместимость

| Требование | Версия |
|---|---|
| OpenCode | latest |
| Python | 3.10+ |
| MemPalace | 3.3+ |
| ОС | macOS, Linux, Windows |

## Документация проекта

- [Changelog](./CHANGELOG.md) — история изменений
- [Contributing](./CONTRIBUTING.md) — правила ведения changelog

## Локальная разработка

```bash
git clone https://github.com/rvboris/opencode-mempalace.git
cd opencode-mempalace/mempalace-autosave
npm install
npm run build
```

Загрузка из исходников в `opencode.json`:

```jsonc
{
  "plugin": ["file:///ABSOLUTE/PATH/TO/mempalace-autosave/plugin/index.ts"]
}
```

Отладка: `opencode --log-level DEBUG` или файл `~/.mempalace/opencode_autosave.log`.

## Ссылки

- OpenCode: https://opencode.ai
- MemPalace: https://github.com/milla-jovovich/mempalace
- npm: https://www.npmjs.com/package/@rvboris/opencode-mempalace

## Лицензия

MIT
