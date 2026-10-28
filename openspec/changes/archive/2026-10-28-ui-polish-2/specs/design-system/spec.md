## ADDED Requirements

### Requirement: Наведение на серые чипы
Серый чип на фоне `--muted` SHALL при наведении темнеть заметнее разницы `#e8ecf2` и `#dfe5ee`: фон — `color-mix` от `--muted` и `--foreground`. Вторичный текст на светлом SHALL быть `--muted-foreground-strong` без отдельной копии.

#### Scenario: Наведение
- **WHEN** курсор над готовым вопросом Эвала
- **THEN** фон чипа темнее обычного, текст читается (4.5:1)
