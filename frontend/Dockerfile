FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
RUN npm install express http-proxy-middleware
COPY --from=builder /app/dist ./dist
COPY server.js .

EXPOSE 5173
CMD ["node", "server.js"]
