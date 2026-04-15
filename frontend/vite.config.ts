import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev
export default defineConfig({
  plugins: [react()],
  server: {
    // Разрешаем доступ извне контейнера
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Настройка для работы через прокси Railway
    allowedHosts: true, 
    // Запасной вариант для старых версий Vite
    hmr: {
      clientPort: 443
    },
    // Прокси для запросов к бэкенду
    proxy: {
      '/api': {
        target: 'http://backend:3000',
        changeOrigin: true,
      },
    },
  },
})