# Деплой на Vercel

Vercel определяет проект как Next.js без дополнительной настройки (нативная сборка, не Docker):
импортируйте репозиторий (Framework Preset — Next.js, команды по умолчанию)
или выполните `npx vercel --prod` из корня. Нужен Node.js ≥ 22.
В настройках проекта Vercel (Settings → Environment Variables) нужна одна переменная — `AGE_SECRET_KEY`: в Value —
содержимое файла ключа приложения (или только строка `AGE-SECRET-KEY-1…`), для Production, Preview и Development.
Старую `GIT_SECRET_PRIVATE_KEY` удалить. Затем — Redeploy. Продакшен: https://ostrovok-concept.vercel.app.

Вне production (`npm run dev` и preview-деплои Vercel, по `VERCEL_ENV`) в левом нижнем углу
показываются технические параметры глобуса: fps, время кадра, разрешение рендера,
объём геометрии. Проверить production-сборку с ними локально: `VERCEL_ENV=preview npm run build`.
