/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EEEDFE",
          100: "#CECBF6",
          200: "#AFA9EC",
          400: "#7F77DD",
          600: "#534AB7",
          800: "#3C3489",
        },
        surface: {
          primary: "#FFFFFF",
          secondary: "#F8F7F4",
          tertiary: "#F1EFE8",
        },
        ink: {
          primary: "#1A1A1A",
          secondary: "#6B6B6B",
          tertiary: "#9B9B9B",
        },
        stage: {
          pending: "#D3D1C7",
          progress: "#FAC775",
          done: "#5DCAA5",
          review: "#85B7EB",
        },
        status: {
          new: "#EEEDFE",
          "new-text": "#3C3489",
          progress: "#E6F1FB",
          "progress-text": "#0C447C",
          review: "#FAEEDA",
          "review-text": "#633806",
          done: "#E1F5EE",
          "done-text": "#085041",
          urgent: "#FCEBEB",
          "urgent-text": "#791F1F",
        },
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
