# Плагин MemPalace для OpenCode

Слой памяти для OpenCode: скрытый поиск по памяти и безопасное автосохранение.

[English version](./README.md)

## Зачем он нужен

Чтобы OpenCode отвечал с учётом прошлого контекста — без лишних подсказок и без шума в чате.

- **Сам ищет нужную память** перед обычным ответом
- **Тихо сохраняет важное** по ходу работы
- **Пишет безопасно** через один контролируемый инструмент
- **Учитывает приватность** перед сохранением

## Быстрый старт

Установи MemPalace:

```bash
pip install mempalace
mempalace init <dir>
mempalace mine <dir>
```

Добавь плагин в `opencode.json`:

```json
{
  "plugin": ["@rvboris/opencode-mempalace"]
}
```

Этого достаточно, чтобы включить поиск по памяти, автосохранение и `mempalace_memory`.

## Что ты получаешь

- скрытый поиск по памяти перед ответом
- автосохранение на событиях сессии
- раздельную память для пользователя и проекта
- один безопасный инструмент для работы с памятью
- локальную Python-прослойку для MemPalace

Самому плагину **не нужен** сервер MCP от MemPalace.

## Основной инструмент: `mempalace_memory`

Это единственный инструмент, который нужен модели.

### Режимы

- **`save`** — сохранить устойчивый факт, предпочтение или решение
- **`search`** — найти релевантную память по запросу
- **`kg_add`** — добавить структурированный факт в граф знаний
- **`diary_write`** — записать короткую рабочую заметку
- **`mine_messages`** — внутренний режим автосохранения, который использует сам плагин

### Примеры

Сохранить пользовательское предпочтение:

```text
mempalace_memory
  mode: save
  scope: user
  room: preferences
  content: Prefers concise responses and numbered steps.
```

Сохранить проектное решение:

```text
mempalace_memory
  mode: save
  scope: project
  room: decisions
  content: Use Bun for builds and tests.
```

Найти память:

```text
mempalace_memory
  mode: search
  scope: project
  room: workflow
  query: build command
  limit: 3
```

Добавить факт в граф знаний:

```text
mempalace_memory
  mode: kg_add
  subject: my-repo
  predicate: uses
  object: bun
```

## Области памяти

**Память пользователя**

- `preferences`
- `workflow`
- `communication`

Подходит для стабильных привычек и предпочтений, которые полезны в любом проекте.

**Память проекта**

- `architecture`
- `workflow`
- `decisions`
- `bugs`
- `setup`

Подходит для знаний, привязанных к конкретному репозиторию.

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

Полезные переменные окружения:

- `MEMPALACE_AUTOSAVE_ENABLED`
- `MEMPALACE_RETRIEVAL_ENABLED`
- `MEMPALACE_KEYWORD_SAVE_ENABLED`
- `MEMPALACE_PRIVACY_REDACTION_ENABLED`
- `MEMPALACE_AUTOSAVE_LOG_FILE`
- `MEMPALACE_ADAPTER_PYTHON`

## Приватность

- поддерживаются блоки `<private>...</private>`
- типовые секреты скрываются перед записью
- полностью приватное содержимое не сохраняется

## Документация проекта

- История изменений: [`CHANGELOG.md`](./CHANGELOG.md)
- Правила ведения changelog: [`CONTRIBUTING.md#changelog`](./CONTRIBUTING.md#changelog)

## Локальная разработка

Загрузка из исходников:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "file:///ABSOLUTE/PATH/TO/mempalace-autosave/plugin/index.ts"
  ]
}
```

Сборка:

```bash
npm run build
```

Журналы отладки:

```bash
opencode --log-level DEBUG
```

Файл журнала: `~/.mempalace/opencode_autosave.log`

## Ссылки

- OpenCode: https://opencode.ai
- MemPalace: https://github.com/milla-jovovich/mempalace
