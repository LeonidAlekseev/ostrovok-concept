## 1. Цепочка фото

- [ ] 1.1 Убрать `llama-3.2-11b-vision-instruct` из `VISION_CHAIN` и её особый случай без `reasoning_effort`, если он больше не нужен
- [ ] 1.2 Пересмотреть таймауты двух моделей фото в прежнем окне; записать в отчёт
- [ ] 1.3 Тесты цепочки и упоминания модели в README

## 2. Проверка

- [ ] 2.1 Живой прогон фото на API NVIDIA с ключом из `.env.local`: время ответа — в отчёте
- [ ] 2.2 `npm run lint`, `npm run typecheck`, `npm test`, `npm run format:check`
