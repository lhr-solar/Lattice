/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        tesla: {
          bg: "#0a0a0a",
          surface: "#141414",
          border: "#2a2a2a",
          muted: "#6b6b6b",
          text: "#e8e8e8",
          accent: "#3b82f6",
          success: "#12bb6a",
          warning: "#f5a623",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        logo: [
          "Orbitron",
          "Rajdhani",
          "Eurostile",
          "Bank Gothic",
          "Inter Tight",
          "Sora",
          "system-ui",
          "sans-serif",
        ],
      },
      transitionDuration: {
        DEFAULT: "200ms",
      },
    },
  },
  plugins: [],
};
