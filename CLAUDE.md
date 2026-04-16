# TRENITY CRM — Архитектура проекта

> Этот файл — главный источник правды для любого AI-агента (Codex, Claude и др.),
> работающего с этим репозиторием. Читай его полностью перед любыми изменениями.

---

## Стек и сервисы

| Слой | Технология | Деплой |
|---|---|---|
| **Frontend** | React 18 + Vite + TypeScript + Tailwind CSS | Render (Static Site) |
| **Backend** | Fastify 4 + Prisma 5 + TypeScript | Render (Web Service) |
| **Bot** | grammy (Telegram Bot API) + Prisma 5 | Render (Web Service) |
| **База данных** | PostgreSQL (Render) | Render |
| **Файлы** | Telegram Storage Channel (основное) / Supabase S3 (резервное) | — |

---

## Структура монорепозитория

```
crm-creators/
├── backend/          # Fastify API
│   ├── prisma/
│   │   ├── schema.prisma          # Единственный источник правды для схемы БД
│   │   └── migrations/            # SQL-файлы (применяются через ensureSchema() при старте)
│   └── src/
│       ├── index.ts               # Точка входа: ensureSchema() → initBucket() → listen()
│       ├── config.ts              # Все env-переменные
│       ├── routes/                # Fastify-роуты
│       ├── services/              # Бизнес-логика
│       └── middleware/            # auth, roles
├── bot/              # Telegram-бот (grammy)
│   ├── prisma/
│   │   └── schema.prisma          # КОПИЯ схемы backend/prisma/schema.prisma — держать синхронно!
│   └── src/
│       └── index.ts               # Весь код бота в одном файле
├── frontend/         # React SPA
│   └── src/
│       ├── api/client.ts          # Все HTTP-вызовы к backend
│       ├── components/
│       │   ├── kanban/
│       │   │   ├── KanbanBoard.tsx        # DnD (PointerSensor + TouchSensor)
│       │   │   ├── OrderDetailModal.tsx   # Главная модалка: табы Этапы/ТЗ/Файлы/Отчёты/Чат
│       │   │   └── OrderCard.tsx
│       │   ├── order/StageProgress.tsx    # Прогресс-бар стейджей (только последний раунд)
│       │   └── UserProfileCard.tsx        # Попап профиля (createPortal + position:fixed)
│       ├── pages/                 # BoardPage, ArchivePage, AdminPage, ...
│       ├── store/                 # Zustand stores
│       └── types/index.ts         # Все TypeScript-типы (синхронизированы со schema.prisma)
└── CLAUDE.md         # Этот файл
```

---

## База данных — ключевые модели

### User
- `telegramId` (BigInt), `chatId` (BigInt) — для отправки уведомлений в TG
- `pinCode` — 4-символьный код для входа на сайт
- `status`: PENDING | APPROVED | REJECTED | BLOCKED
- `role`: CREATOR | LEAD_CREATOR | HEAD_CREATOR | MARKETER | HEAD_MARKETER | ADMIN

### Order
- `status`: NEW | IN_PROGRESS | ON_REVIEW | DONE | ARCHIVED
- `marketerId` → User (создатель/маркетолог)
- → `stages[]`, `files[]`, `creators[]`, `reports[]`

### OrderStage
- `name`: STORYBOARD | ANIMATION | EDITING | REVIEW | COMPLETED
- `revisionRound` (Int, default 0) — **важно**: уникальный индекс `(orderId, name, revisionRound)`
- `awaitingClientApproval`, `clientApprovalSkipped`, `clientApprovedAt` — подэтап апрува клиента
- Логика раундов: `syncOrderStatus()` смотрит только на **последний** revisionRound

### OrderFile
- `fileType`: TZ | CONTRACT | STORYBOARD | VIDEO_DRAFT | VIDEO_FINAL | OTHER
- `mimeType`: для текстовых ТЗ-заметок = `"text/plain"` (отображаются как текст, не как файл)
- `storagePath`: путь в S3 (пустая строка для TG-файлов)
- `telegramFileId`, `telegramChatId`, `telegramMsgId` — хранение в TG-канале

### OrderFile — соглашение о хранении текстовых заметок ТЗ
```
mimeType = "text/plain"
fileType  = TZ
fileName  = текст заметки (до 500 символов из бота, unlimited с сайта)
storagePath = ""
telegramMsgId = message_id в storage-канале (если загружено через бот)
             = null (если добавлено с сайта через /tz-note)
```

---

## API Backend (Fastify, prefix `/api`)

```
POST /auth/login          { pin } → { token, user }
GET  /auth/me             → User

GET  /orders              → Order[]  (params: status, search, includeArchived)
POST /orders              { title, description?, deadline?, reminderDays? }
GET  /orders/:id          → Order (full, with stages/files/creators)
PUT  /orders/:id          { title?, description?, deadline?, reminderDays? }
PUT  /orders/:id/status   { status }

POST /orders/:id/creators         { creatorId, isLead }
DELETE /orders/:id/creators/:cId

PUT  /orders/:id/stages/:sId      { status }
POST /orders/:id/stages/revisions  → создать новый раунд правок
POST /orders/:id/stages/:sId/client-approval  { action: "request"|"approve"|"skip" }
POST /orders/:id/stages/:sId/rollback

GET  /orders/:id/files            → OrderFile[]
POST /orders/:id/files            multipart { file, fileType }
POST /orders/:id/files/tz-note    { text } → добавить текстовую заметку к ТЗ
POST /orders/:id/files/tz-transcribe  multipart { audio } → STT (501 пока не настроен)

GET  /files/:id/download  → { url } (S3 presigned) | 400 TG_FILE
POST /files/:id/send-to-tg → переслать из TG-хранилища в чат пользователя
DELETE /files/:id

GET/POST /orders/:id/reports
GET/POST /orders/:id/comments
GET/PUT  /notifications
GET/POST/DELETE /permissions
GET/PUT  /users/:id (профиль, роль, teamlead, block/restore)
```

---

## Telegram File Storage

**Как работает:**
1. Файл загружается → бот пересылает его в приватный канал (`TELEGRAM_STORAGE_CHAT_ID`)
2. В БД сохраняется `telegramChatId` + `telegramMsgId` (message_id в канале)
3. Пользователь нажимает "получить файл" → бэкенд вызывает `copyMessage` из канала в чат пользователя

**Env-переменные:**
```
BOT_TOKEN=...                        # токен бота (нужен и backend, и bot сервисам)
TELEGRAM_STORAGE_CHAT_ID=-100...     # ID приватного канала (бот должен быть admin)
USE_TELEGRAM_STORAGE=true            # включить TG-хранилище вместо S3
```

**Файлы реализации:**
- `backend/src/services/telegram.service.ts` — HTTP-вызовы к TG API из бэкенда
- `backend/src/services/file.service.ts` — `uploadFile()`, `sendFileToUserTelegram()`
- `bot/src/index.ts` — `saveBotFile()`, `handleFileMessage()`, batch-сбор в `collectingState`

---

## Telegram Bot — архитектура состояний

Бот работает на **state machine** через Map'ы:

```typescript
waitingForReport:     Map<userId, orderId>    // ждём текст отчёта
waitingForName:       Set<userId>             // ждём новое имя
waitingForOrderTitle: Map<userId, true>       // ждём название заказа

collectingState: Map<userId, CollectingState> // батч-сбор ТЗ/файлов
// mode: "create_order" | "attach_files"
// items: CollectedItem[]  (текст/файл/фото/видео/голос/кружочек)
```

**Батч-загрузка ТЗ:**
1. Пользователь нажимает "➕ Создать заказ" → вводит название → входит в collecting mode
2. Отправляет любое количество сообщений (текст/файл/фото/видео/🎙 голос/кружочек)
3. Каждое сообщение форвардится в storage-канал, добавляется в `state.items`
4. Нажимает "✅ Готово" → создаётся заказ + все items сохраняются как OrderFile

---

## Revision Rounds (раунды правок)

**Проблема которую решает:** клиент даёт правки → нужно переделать стейджи заново

**Схема:**
- Каждый заказ начинается с `revisionRound = 0`
- При нажатии "Клиент дал правки" создаётся новый набор стейджей с `revisionRound = 1`, 2, ...
- На сайте: старые раунды показываются с opacity 30%, текущий — полностью

**Важный constraint:** `UNIQUE(orderId, name, revisionRound)` — был изменён с `UNIQUE(orderId, name)` в миграции. `ensureSchema()` применяет это при каждом старте.

---

## Frontend — ключевые паттерны

### OrderDetailModal
- **Баг предотвращён:** при открытии нового заказа сразу `setFullOrder(null)` → показывается shallow order из пропса пока грузится full
- `const o = fullOrder || order` — используем полные данные когда готовы
- Табы: `stages | tz | files | reports | comments`
- **ТЗ таб:** текстовые заметки (mimeType=text/plain), файлы TZ-типа, кнопка "🎙 Голос" (заглушка)

### UserProfileCard
- Использует `createPortal(popup, document.body)` + `position: fixed` — иначе выходит за границы колонки

### KanbanBoard
- `PointerSensor` (distance: 8px) + `TouchSensor` (delay: 200ms) — для десктопа и мобайла

---

## LLM/STT интеграция — архитектура (TODO)

### STT (Speech-to-Text) для голосовых сообщений

**Рекомендации по провайдерам (русский язык):**

| Провайдер | Качество RU | Цена | Как подключить |
|---|---|---|---|
| **OpenAI Whisper API** | ★★★★★ | ~$0.006/мин | `WHISPER_API_KEY` → POST /v1/audio/transcriptions |
| **Yandex SpeechKit** | ★★★★★ | Платно | `YANDEX_API_KEY` → REST API |
| **faster-whisper** (self-hosted) | ★★★★☆ | Бесплатно | Нужен сервер с GPU |
| **Vosk** (offline) | ★★★☆☆ | Бесплатно | npm vosk-lib, модель `vosk-model-ru-0.42` |

**Точка подключения в коде:**
```
backend/src/routes/files.routes.ts
  POST /orders/:id/files/tz-transcribe   ← заглушка, 501 ответ
  // TODO: Buffer → STT API → { text: string }
```

**Переменные окружения для будущего:**
```
WHISPER_API_KEY=sk-...          # OpenAI Whisper
YANDEX_SPEECHKIT_KEY=...        # Yandex SpeechKit (альтернатива)
STT_PROVIDER=whisper|yandex|vosk
```

### LLM для редактирования ТЗ и отчётов

**Задача:** принять набор сырых заметок/голосовых/файлов → вернуть структурированное ТЗ

**Рекомендуемая архитектура:**
```
POST /orders/:id/tz/format    { items: OrderFile[] } → { formattedTz: string }
POST /orders/:id/reports/summarize → { summary: string }
```

**Провайдеры:**

| Провайдер | Качество RU | Как |
|---|---|---|
| **Claude API** (Anthropic) | ★★★★★ | `ANTHROPIC_API_KEY` + SDK |
| **GPT-4o** | ★★★★★ | `OPENAI_API_KEY` |
| **GigaChat** (Sber) | ★★★★☆ | Русская LLM, REST API |
| **Saiga-Mistral** (open-source) | ★★★☆☆ | Self-hosted, HuggingFace |

**Для начала рекомендуем Claude API** — лучший русский + уже знаком с архитектурой проекта.

---

## Переменные окружения

### Backend
```
DATABASE_URL=postgresql://...
BOT_TOKEN=...
TELEGRAM_STORAGE_CHAT_ID=-100...
USE_TELEGRAM_STORAGE=true
MINIO_ENDPOINT=...          # Supabase S3 endpoint (если USE_TELEGRAM_STORAGE=false)
MINIO_ACCESS_KEY=...
MINIO_SECRET_KEY=...
MINIO_BUCKET=...
JWT_SECRET=...
FRONTEND_URL=https://...
PORT=4000
```

### Bot
```
DATABASE_URL=postgresql://...   # та же БД что и у backend
BOT_TOKEN=...
TELEGRAM_STORAGE_CHAT_ID=-100...
ADMIN_TG_USERNAME=Dbm0ne        # мастер-admin TG username
PORT=3001
```

---

## Критические правила для Codex/Claude

### ❌ НИКОГДА не делать

1. **Не менять unique constraint на OrderStage** — `(orderId, name, revisionRound)` — это сломает revision rounds
2. **Не удалять `ensureSchema()` из `backend/src/index.ts`** — это единственный способ применить миграции на проде
3. **Не использовать `prisma migrate dev`** — только `prisma db push` или `ensureSchema()` через `$executeRawUnsafe`
4. **Не забывать синхронизировать** `bot/prisma/schema.prisma` с `backend/prisma/schema.prisma` при изменении схемы
5. **Не менять структуру storage** файлов — `telegramChatId` + `telegramMsgId` = ключи для `copyMessage`

### ✅ ВСЕГДА делать

1. После изменения схемы — обновить `ensureSchema()` в `backend/src/index.ts` с `ADD COLUMN IF NOT EXISTS`
2. После изменения схемы — обновить `bot/prisma/schema.prisma` и запустить `prisma generate` в папке `bot/`
3. После добавления API-эндпоинта — добавить функцию в `frontend/src/api/client.ts`
4. После изменения типов в Prisma — обновить `frontend/src/types/index.ts`
5. Проверять TypeScript: `cd backend && npx tsc --noEmit` и `cd bot && npx tsc --noEmit`

---

## Как запустить локально

```bash
# 1. Установить зависимости
cd backend && npm install
cd ../bot && npm install
cd ../frontend && npm install

# 2. Создать .env в корне (см. раздел переменных окружения)

# 3. Сгенерировать Prisma clients
cd backend && npx prisma generate
cd ../bot && npx prisma generate

# 4. Запустить
cd backend && npm run dev    # :4000
cd ../bot && npm run dev     # :3001
cd ../frontend && npm run dev # :5173
```

---

## История ключевых решений

| Решение | Почему |
|---|---|
| TG как файлохранилище | S3/Supabase имел проблемы с endpoint; TG бесплатен, надёжен, не требует CDN |
| `ensureSchema()` вместо `prisma migrate deploy` | На Render нет возможности запустить CLI; `db push` не всегда отрабатывает корректно при старте контейнера |
| `createPortal` для UserProfileCard | Карточка выходила за пределы колонки канбана из-за `overflow: hidden` |
| `revisionRound` как часть unique key | Позволяет иметь несколько наборов стейджей (раундов) на один заказ |
| `mimeType=text/plain` для текстовых ТЗ | Позволяет хранить текстовые заметки как OrderFile без отдельной таблицы |
| Батч-режим в боте (`collectingState`) | Пользователи хотят отправлять несколько сообщений/файлов сразу как ТЗ |
