import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#1F3864", 600: "#1a2f54", 50: "#eef2f9" },
        brand: { DEFAULT: "#2E75B6", 600: "#265f94", 50: "#eaf2fa" },
      },
      fontFamily: { sans: ["Calibri", "Segoe UI", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
};
export default config;
