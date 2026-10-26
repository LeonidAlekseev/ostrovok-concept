## ADDED Requirements

### Requirement: Экран тестов задаётся общим помощником
Тесты, зависящие от ширины экрана или от `prefers-reduced-motion`, SHALL задавать их через `setScreen` из `src/test/screen.ts` в `beforeEach`; вручную `window.matchMedia` SHALL не подменяться. Помощник SHALL понимать `(min-width)` в px и rem и `(prefers-reduced-motion: reduce)`. Узкая раскладка страницы Эвала SHALL быть покрыта тестом.

#### Scenario: Движение
- **WHEN** тест проверяет поведение при `prefers-reduced-motion: reduce`
- **THEN** он вызывает `setScreen(WIDE, { reducedMotion: true })` и не подменяет `window.matchMedia` сам

#### Scenario: Узкая раскладка Эвала
- **WHEN** тест проверяет страницу Эвала на 390 px
- **THEN** он задаёт `setScreen(NARROW)`, видит список на `/assistant` без открытия свежего чата и получает адрес собственного чата при «Новом чате»
