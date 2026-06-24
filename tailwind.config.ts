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
        background: "hsl(var(--background))",
        surface: "hsl(var(--surface))",
        muted: "hsl(var(--surface-muted))",
        foreground: "hsl(var(--foreground))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        subtle: "hsl(var(--subtle-foreground))",
        border: "hsl(var(--border))",
        "border-strong": "hsl(var(--border-strong))",
        ring: "hsl(var(--ring))",
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          hover: "hsl(var(--accent-hover))",
        },
        ink: {
          DEFAULT: "hsl(var(--ink))",
          hover: "hsl(var(--ink-hover))",
        },
        positive: "hsl(var(--positive))",
        negative: "hsl(var(--negative))",
        warning: "hsl(var(--warning))",
        rail: "hsl(var(--ink))",
        revpar: {
          high: "hsl(var(--revpar-high))",
          mid: "hsl(var(--revpar-mid))",
          low: "hsl(var(--revpar-low))",
          "high-soft": "hsl(var(--revpar-high-soft))",
          "mid-soft": "hsl(var(--revpar-mid-soft))",
          "low-soft": "hsl(var(--revpar-low-soft))",
          // Legacy aliases — downstream items migrate off these; keep compiling.
          red: "hsl(var(--revpar-high))",
          yellow: "hsl(var(--revpar-mid))",
          gray: "hsl(var(--revpar-low))",
        },
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        pop: "var(--shadow-pop)",
        // Back-compat alias.
        card: "var(--shadow-md)",
      },
      borderRadius: {
        panel: "14px",
        lg: "10px",
        md: "8px",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        rise: {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s ease-in-out infinite",
        rise: "rise 200ms ease-out",
      },
    },
  },
  plugins: [],
};

export default config;
