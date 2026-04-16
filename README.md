# crmTRENITY

CRM for marketers, creators, website workflow, and Telegram automation.

## What Is Implemented

- Website and Telegram bot share orders, files, comments, stages, reports, tasks, and AI voice flows.
- Each order can now be linked to a dedicated Telegram group.
- Backend creates and remembers the order group through a personal Telegram user account (`gramjs` / MTProto userbot).
- The Telegram bot works inside that group:
  - regular text messages from the group are saved to CRM comments
  - files from the group are saved to CRM order files
  - comments and files added from CRM or the bot DM flow are mirrored back to the order group
  - natural-language requests like `бот, скинь ТЗ`, `бот, покажи дедлайны`, `бот, покажи статус`, `бот, тегни всех` are parsed through the existing LLM flow

## Environment

Set these in `.env`:

```env
DB_PASSWORD=...
JWT_SECRET=...
FRONTEND_URL=https://your-domain

BOT_TOKEN=...
BOT_USERNAME=your_bot_username_without_@
TELEGRAM_STORAGE_CHAT_ID=-100...
USE_TELEGRAM_STORAGE=true
TELEGRAM_PROXY_URL=
TELEGRAM_BOT_API_BASE_URL=https://api.telegram.org
ADMIN_TG_USERNAME=your_username

TELEGRAM_USERBOT_API_ID=
TELEGRAM_USERBOT_API_HASH=
TELEGRAM_USERBOT_SESSION=
TELEGRAM_USERBOT_PHONE=
```

## Telegram Setup

### 1. BotFather

Create or reuse your bot and save:

- `BOT_TOKEN`
- bot username into `BOT_USERNAME` without `@`

Disable privacy mode for the bot:

1. Open `@BotFather`
2. `/mybots`
3. Select your bot
4. `Bot Settings`
5. `Group Privacy`
6. `Turn off`

Without this, the bot will not see normal messages/files inside order groups.

If you want to upload very large files from the CRM website directly into Telegram storage, you will eventually hit the public Bot API upload ceiling. In that case point `TELEGRAM_BOT_API_BASE_URL` to your own local Telegram Bot API server instead of `https://api.telegram.org`.

### 2. Storage Chat

Create a private Telegram group or channel for file storage.

- Add the bot as admin
- Put its id into `TELEGRAM_STORAGE_CHAT_ID`

### 3. Userbot API ID / Hash

Open `https://my.telegram.org` and create an API application.

You will get:

- `api_id`
- `api_hash`

Put them into:

- `TELEGRAM_USERBOT_API_ID`
- `TELEGRAM_USERBOT_API_HASH`

### 4. Generate String Session For Userbot

Use your personal Telegram account that should create CRM order groups.

From `backend/` run:

```powershell
npx tsx -e "const {TelegramClient}=require('telegram'); const {StringSession}=require('telegram/sessions'); const input=require('input'); (async()=>{ const client=new TelegramClient(new StringSession(''), Number(process.env.TELEGRAM_USERBOT_API_ID), process.env.TELEGRAM_USERBOT_API_HASH, { connectionRetries: 5 }); await client.start({ phoneNumber: async()=>await input.text('Phone: '), password: async()=>await input.text('2FA password: '), phoneCode: async()=>await input.text('Code: '), onError: console.log }); console.log(client.session.save()); process.exit(0); })();"
```

Copy the printed string into:

- `TELEGRAM_USERBOT_SESSION`

Optional:

- `TELEGRAM_USERBOT_PHONE`

### 5. Telegram Privacy / Invite Rules

For automatic group creation to work reliably, Telegram must allow your personal userbot account to add participants.

Recommended:

- users should have usernames in CRM
- users should have started the bot at least once
- users should allow being invited to groups by your account, or have your account in contacts

If Telegram blocks a direct add, the system falls back to sending the invite link to the user in DM when possible.

## Running

```powershell
docker compose build
docker compose up -d
```

Or redeploy through Portainer after updating `.env`.

## Build Checks

```powershell
cd backend
npm run build

cd ../bot
npm run build
```

## Telegram Group Flow

When an order appears without a Telegram group:

1. backend sync loop creates the group
2. marketer and known creators are invited
3. the bot is added to the group
4. CRM summary / recent context is posted into the group

After that:

- text from the group becomes CRM comments
- files from the group become CRM files
- comments/files from CRM are mirrored back into the same group

## Notes

- Bot API cannot create groups. That is why the backend uses a userbot via `gramjs`.
- The userbot is only used for group creation and participant invites.
- Live message/file sync is handled by the existing Telegram bot.

## Guide Tab

The web app now has a dedicated `📖 Гайд` page with an interactive onboarding flow.

What it does:

- every user sees role-specific onboarding steps
- after the first successful login, users with `guideSeenAt = null` are automatically redirected to `/guide`
- finishing or skipping the guide marks it as seen through `POST /api/users/guide-seen`
- the top navigation shows a dot indicator near `Гайд` until the guide is completed

Roles covered:

- `CREATOR`, `LEAD_CREATOR`, `HEAD_CREATOR`
- `MARKETER`, `HEAD_MARKETER`
- `ADMIN`

Implementation notes:

- guide state is stored in `users.guide_seen_at`
- backend keeps the column in sync through `ensureSchema()`
- frontend guide content lives in `frontend/src/data/guideSteps.ts`
- the interactive slide component lives in `frontend/src/components/guide/GuideTour.tsx`
