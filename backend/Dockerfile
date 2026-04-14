FROM node:20-alpine
# Добавляем OpenSSL 1.1 и другие нужные библиотеки
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npm", "run", "dev"]
