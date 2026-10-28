## 1. База

- [x] 1.1 Миграция `20261028140000_hotelier_knowledge.sql`: `hotelier` в `evidence.type`, `hotelier_answer` в `documents.kind`, `is_demo`, `content_hash`, `knowledge_revoked_at`, `hotel_chunks_hybrid`, `create_hotelier_request`, `answer_hotelier_request`, Realtime `tool_runs` и `assistant_messages`
- [x] 1.2 Тест `supabase/tests/hotelier_requests.sql`: свой чат и запуск, дедупликация, лимиты, право отельера, завершение запуска и шага, RRF
- [x] 1.3 `db:push`, `db:types`, `docs:supabase`

## 2. Инструмент и посредник

- [x] 2.1 `ToolResult`: статус `pending`, источник `hotelier`, `demo`; `recordRun`: `waiting`/`resume`, id запуска для инструмента
- [x] 2.2 `ask_hotelier` в ответе об отеле: поле модели, правила, шаг `hotelier`
- [x] 2.3 Сведения отельера в фактах Эвала; запрет подтверждать наличие, цены, вид, условия
- [x] 2.4 AI-помощник в чате с отельером (`after()`): ответ с источниками или передача отельеру

## 3. Знания

- [x] 3.1 Извлечение характеристик (`hotelierExtract`), запись утверждений `reported` 0,75, закрытие старых, документ и векторы
- [x] 3.2 Завершение ждущих запусков фактами; `npm run db:hotelier-knowledge`
- [x] 3.3 Отзыв сведений; фильтр закрытых утверждений у читателей
- [x] 3.4 Гибридный поиск `searchHotelKnowledge` и `GET /api/hotels/{id}/documents/search`

## 4. Интерфейс

- [x] 4.1 Блок «Запрос отельеру», `useLiveRun`, Realtime в `useChats`, сообщения отельера в ленте и компактной карточке
- [x] 4.2 «Источники» у ответов AI-помощника; «Отозвать сведения» и состояние характеристик в панели; пометка «демо»

## 5. Проверка

- [x] 5.1 Тесты: словарь, блок, утверждения, извлечение, инструмент, `recordRun`, слияние сообщений, посредник, маршруты, поиск
- [x] 5.2 Живой прогон в headless Chromium: вопрос в Эвале → `pending` → ответ в панели → блок обновился, факты извлечены → поиск находит ответ → блок после перезагрузки; посредник; отзыв
