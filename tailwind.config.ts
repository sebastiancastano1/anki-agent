import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#faf6f0",
        sand: "#f3ece1",
        clay: "#e9ddcb",
        cocoa: "#5b4636",
        espresso: "#3a2c22",
        terracotta: "#c97b5a",
        sage: "#8a9a7b",
        honey: "#e0a458",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        cozy: "1.5rem",
      },
      boxShadow: {
        soft: "0 8px 30px rgba(91, 70, 54, 0.12)",
        lift: "0 14px 40px rgba(91, 70, 54, 0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
