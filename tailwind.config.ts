import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

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
        // Layered, Apple-like elevation. Ambient + soft key shadow.
        hairline: "0 0 0 1px rgba(91, 70, 54, 0.06)",
        soft: "0 1px 2px rgba(91, 70, 54, 0.05), 0 8px 30px rgba(91, 70, 54, 0.10)",
        lift: "0 2px 6px rgba(91, 70, 54, 0.08), 0 14px 40px rgba(91, 70, 54, 0.16)",
        press: "0 1px 2px rgba(91, 70, 54, 0.10)",
      },
      transitionTimingFunction: {
        cozy: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      letterSpacing: {
        tightest: "-0.03em",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        shimmer: "shimmer 1.8s ease-in-out infinite",
        "pulse-soft": "pulse-soft 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [typography],
};

export default config;
