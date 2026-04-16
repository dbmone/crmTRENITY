FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/seed.js ./seed.js

EXPOSE 3000
# db push creates tables on a fresh DB, seed.js creates a bootstrap admin,
# and ensureSchema() in the app applies the extra idempotent SQL patches.
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node seed.js && node dist/index.js"]
