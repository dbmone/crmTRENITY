# CRM Creators

CRM-система для управления заказами между маркетологами и креаторами.

## Быстрый старт

### Шаг 1: Установка Docker

Если нет Docker — установи: https://docs.docker.com/get-docker/

### Шаг 2: Настройка переменных окружения

```bash
cp .env.example .env
```

Отредактируй `.env` — обязательно смени пароли и добавь токен бота (получить у @BotFather в Telegram).

### Шаг 3: Запуск PostgreSQL и MinIO

```bash
docker-compose up -d
```

Проверить что работает:
```bash
docker-compose ps
```

MinIO консоль будет на http://localhost:9001 (логин/пароль из .env)

### Шаг 4: Backend

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

Сервер запустится на http://localhost:3000
Проверить: http://localhost:3000/api/health

### Шаг 5: Telegram-бот

```bash
cd bot
npm install
npm run dev
```

Бот заработает. Пиши ему /start в Telegram.

### Шаг 6: Frontend (будет позже)

```bash
cd frontend
npm install
npm run dev
```

## Тестовые аккаунты (после seed)

| Имя | Роль | PIN |
|-----|------|-----|
| Анна | Маркетолог | A1b2 |
| Сергей | Маркетолог | C3d4 |
| Дима | Лид-креатор | E5f6 |
| Катя | Креатор | G7h8 |
| Макс | Креатор | J9k0 |

## API

### Авторизация
```
POST /api/auth/login   { "pin": "A1b2" } → { token, user }
GET  /api/auth/me       (Bearer token)
```

### Заказы
```
GET    /api/orders
POST   /api/orders
GET    /api/orders/:id
PUT    /api/orders/:id
DELETE /api/orders/:id
PUT    /api/orders/:id/status
```

### Креаторы на заказе
```
POST   /api/orders/:id/creators
DELETE /api/orders/:id/creators/:creatorId
```

### Этапы
```
GET    /api/orders/:id/stages
PUT    /api/orders/:id/stages/:stageId
```

### Файлы
```
GET    /api/orders/:id/files
POST   /api/orders/:id/files    (multipart)
GET    /api/files/:id/download
DELETE /api/files/:id
```

### Отчёты
```
GET    /api/orders/:id/reports
POST   /api/orders/:id/reports
```
