import type { Config } from "tailwindcss"

const config: Config = {
  darkMode: [], // strict light theme — dark mode intentionally disabled
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1.5rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: "hsl(var(--surface))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        live: {
          DEFAULT: "hsl(var(--live))",
          foreground: "hsl(var(--live-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      boxShadow: {
        soft: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 4px 16px -4px rgb(15 23 42 / 0.08)",
        "soft-lg": "0 2px 4px 0 rgb(15 23 42 / 0.04), 0 12px 32px -8px rgb(15 23 42 / 0.12)",
        pill: "0 2px 12px -2px rgb(15 23 42 / 0.16)",
        /* colored brand glows — used sparingly on active/hovered focal elements */
        "glow-primary": "0 10px 32px -8px rgb(29 78 216 / 0.35), 0 2px 8px -2px rgb(29 78 216 / 0.18)",
        "glow-cyan": "0 10px 32px -8px rgb(6 182 212 / 0.35), 0 2px 8px -2px rgb(6 182 212 / 0.18)",
        "glow-success": "0 10px 32px -8px rgb(16 185 129 / 0.3), 0 2px 8px -2px rgb(16 185 129 / 0.16)",
        /* button depth — top-edge highlight + soft resting shadow, gradient buttons swap to a colored glow on hover */
        "inset-soft": "inset 0 1px 0 0 rgb(255 255 255 / 0.25), 0 1px 2px 0 rgb(15 23 42 / 0.04), 0 4px 16px -4px rgb(15 23 42 / 0.08)",
        "glow-btn-primary": "inset 0 1px 0 0 rgb(255 255 255 / 0.3), 0 12px 28px -6px rgb(29 78 216 / 0.45), 0 4px 14px -2px rgb(6 182 212 / 0.3)",
        "glow-btn-success": "inset 0 1px 0 0 rgb(255 255 255 / 0.3), 0 12px 28px -6px rgb(16 185 129 / 0.4)",
        "glow-btn-destructive": "inset 0 1px 0 0 rgb(255 255 255 / 0.3), 0 12px 28px -6px rgb(220 38 38 / 0.4)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "pulse-live": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.3s ease-out",
        "pulse-live": "pulse-live 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}

export default config
