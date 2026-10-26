## 1. Таймаут

- [ ] 1.1 `lightning` — 3,5 с в `TEXT_CHAIN`; проверить, что `bolt` и `minimax` укладываются в остаток окна 8 с
- [ ] 1.2 Тесты цепочки и README

## 2. Проверка

- [ ] 2.1 Живой прогон набора фраз `src/lib/ai/understand.phrases.ts` (24 × 2) с ключом из `.env.local`: доля ответов `lightning` и полностью разобранных — до/после
- [ ] 2.2 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`
