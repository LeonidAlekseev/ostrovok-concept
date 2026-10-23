# Proposal

## Why

Решение пользователя 2026-10-21 (36а): на `/search` с 1920 px расширять страницу, чтобы карточки в двух колонках не были узкими (~216 px при ширине страницы 1240 px).

## What Changes

- На `/search` с `3xl` (1920 px) ширина страницы больше `--page-max`: новый токен `--page-max-wide` (около 1760 px). Остальные страницы не меняются.
- В двух колонках карточка не уже 300 px; кадры 1920 и 2560 px.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `search-results-page`: ширина страницы на широком экране.

## Impact

- `src/app/globals.css` (`--page-max-wide`), `src/components/SearchResultsPage/SearchResultsPage.tsx` (`pageClass`, сетка колонок).
