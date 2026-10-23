# Proposal

## Why

Решение пользователя 2026-10-21 (45): подобрать фото вайба получше — `budget-left` сжато до q35, у всех 15 фото кадрирование по центру, «Завтрак в номер» и «Без лишних трат» не по смыслу.

## What Changes

- Заменить неудачные фото (как минимум «Завтрак в номер», «Без лишних трат») на более подходящие свободные фото Wikimedia Commons; менее детальные кадры, чтобы при ≤ 60 КБ качество было не ниже q55.
- Задать кадрирование `(cx, cy, zoom)` в `scripts/build-images.py` для каждого из 15 фото по композиции.
- Обновить `CREDITS.md`.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `vibe-search`: качество фото.

## Impact

- `public/images/vibe/*.webp`, `scripts/build-images.py`, `public/images/CREDITS.md`.
