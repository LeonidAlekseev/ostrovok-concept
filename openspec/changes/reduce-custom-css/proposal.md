# Proposal

## Why

В проекте 10 файлов `*.module.css` и `globals.css`. Часть стилей дублирует то, что выражают Tailwind-утилиты и классы примитивов `src/components/ui/*`. Цель — меньше CSS на клиенте и без дублей.

## What Changes

- Перевести стили виджетов на Tailwind-утилиты и классы примитивов, начиная с `SearchPanel`, `RandomSearch`, `Header`, `SearchForm`, `AssistantSearch`.
- Оставить модульный CSS только для раскладки, которую Tailwind не выражает.
- Убрать из `globals.css` всё, что не является токенами и базовыми стилями.
- Отклонения по пикселям допустимы; визуальная проверка — сравнение скриншотов.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

Нет. Поведение не меняется, меняется реализация стилей (`skip_specs: true`).

## Impact

- `src/components/**/*.module.css`, `src/app/globals.css` (путь уточнить при реализации).
- Компоненты, которые переходят на классы Tailwind.
- Пересекается с `migrate-composite-components` (задача 4.1) на тех же компонентах: выполнять после неё.

## Замеры

До изменений (`npm run build` от `9d6a547`): суммарный размер CSS сборки — **91 511 байт** (gzip −9: 18 883 байт). В Next.js 16 CSS лежит в `.next/static/chunks/*.css`, а не в `.next/static/css`: `09-az9in33rlu.css` — 53 799 байт, `3wnssp1fkdp5z.css` — 37 712 байт.
