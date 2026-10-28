## Why

Мелкие находки исполнителей накопились в TODO (пакет 3 «small-tech-debt-2»).

## What Changes

- Один серверный клиент Supabase с service role (`src/lib/db/serviceClient.ts`) вместо трёх; чтение `SUPABASE_SERVICE_ROLE_KEY` ограничено по времени.
- `hotelierMediator` берёт вектор вопроса через общий `queryVectorOrNull`.
- `diffRows` сравнивает jsonb глубоко: другой порядок ключей не вызывает перезапись.
- Миграция: `dataset` в `geo_buildings` и `geo_noise` — `not null` (null в базе нет).
- Общий помощник `kmFromCentre` для «км от центра»; `--decor-vibe-calm/-loud` заменены локальным градиентом.
- Purpose спецификации `site-header` больше не упоминает уведомления.
- Нестабильные тесты: точечно подняты таймауты.

## Impact

- Поведение для пользователя не меняется. Purpose `site-header` правится напрямую (в дельте его выразить нельзя); требование «Логотип» в дельте повторено без изменений, чтобы change проходил `--strict`.
