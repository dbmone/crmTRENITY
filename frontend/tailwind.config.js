/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // TRENITY dark theme
        bg: {
          base:    "#0A0A0A",  // самый тёмный фон
          surface: "#111111",  // карточки, модалки
          raised:  "#1A1A1A",  // элементы поверх surface
          hover:   "#222222",  // hover-состояния
          border:  "#2A2A2A",  // разделители
        },
        green: {
          50:  "#E8FFF3",
          100: "#C3FFE0",
          300: "#6EE7A8",
          400: "#22D46A",
          500: "#00C853",  // основной акцент
          600: "#00A844",
          700: "#007A30",
          900: "#003816",
        },
        ink: {
          primary:   "#F0F0F0",
          secondary: "#A0A0A0",
          tertiary:  "#5A5A5A",
          muted:     "#3A3A3A",
        },
        // Колонки канбана
        col: {
          new:        "#0D1A2E",
          "new-b":    "#1D4ED8",
          progress:   "#1A140A",
          "prog-b":   "#D97706",
          review:     "#1A0D2E",
          "review-b": "#7C3AED",
          done:       "#0A1A10",
          "done-b":   "#00C853",
        },
        // Этапы
        stage: {
          pending:  "#2A2A2A",
          progress: "#D97706",
          done:     "#00C853",
          review:   "#7C3AED",
        },
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      boxShadow: {
        card:  "0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3)",
        modal: "0 20px 60px rgba(0,0,0,0.8)",
        glow:  "0 0 20px rgba(0,200,83,0.15)",
      },
      borderRadius: {
        card: "12px",
        modal: "16px",
      },
    },
  },
  plugins: [],
};
