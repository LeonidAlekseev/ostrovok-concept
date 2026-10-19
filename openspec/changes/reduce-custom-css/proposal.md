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
