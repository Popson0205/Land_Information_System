import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // LIS brand palette
        primary: {
          DEFAULT: "#1B4F72",
          light: "#2E86C1",
          dark: "#154360",
        },
        accent: {
          DEFAULT: "#27AE60",
          light: "#2ECC71",
        },
        warning: "#E67E22",
        danger: "#C0392B",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
