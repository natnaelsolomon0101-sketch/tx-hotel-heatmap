import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // RevPAR buckets
        revpar: {
          red: "#ee2233",
          yellow: "#f5b301",
          gray: "#9aa0a6",
        },
        rail: "#1f2937",
      },
      boxShadow: {
        card: "0 8px 30px rgba(0,0,0,0.18)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
