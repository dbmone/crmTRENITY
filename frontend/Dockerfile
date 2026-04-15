FROM node:20-alpine
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# В Docker backend доступен по имени сервиса; локально (без Docker) fallback → localhost:3000
ENV BACKEND_URL=http://backend:3000
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host"]
