import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        panel: "#1a1a1a",
        panelHover: "#242424",
        border: "#2a2a2a",
        accent: {
          DEFAULT: "#4f46e5",
          hover: "#4338ca",
          foreground: "#eef2ff",
        },
        track: {
          blue: "#3b82f6",
          green: "#22c55e",
          purple: "#a855f7",
          orange: "#f97316",
          pink: "#ec4899",
          teal: "#14b8a6",
          yellow: "#eab308",
          red: "#ef4444",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
