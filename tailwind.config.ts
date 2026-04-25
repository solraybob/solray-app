import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // All tokens point at theme-aware CSS variables defined in
        // app/globals.css. Each var is an "R G B" triplet so Tailwind's
        // <alpha-value> opacity syntax (bg-forest-deep/40, text-mist/60)
        // composes correctly under both dark (default) and light
        // (data-theme="light") themes.
        forest: {
          deep:   "rgb(var(--rgb-bg-deep) / <alpha-value>)",
          dark:   "rgb(var(--rgb-bg-dark) / <alpha-value>)",
          card:   "rgb(var(--rgb-card) / <alpha-value>)",
          border: "rgb(var(--rgb-border) / <alpha-value>)",
        },
        amber: {
          // Amber-sun is the hero accent. Slightly deeper under the
          // light theme so it holds against pearl.
          sun: "rgb(var(--rgb-amber) / <alpha-value>)",
        },
        // Aged-pigment palette. Used via Tailwind's /opacity syntax
        // (bg-ember/20, text-mist, border-indigo/30). All entries flip
        // with the active theme.
        ember:    "rgb(var(--rgb-ember) / <alpha-value>)",
        moss:     "rgb(var(--rgb-moss) / <alpha-value>)",
        mist:     "rgb(var(--rgb-mist) / <alpha-value>)",
        indigo:   "rgb(var(--rgb-indigo) / <alpha-value>)",
        wisteria: "rgb(var(--rgb-wisteria) / <alpha-value>)",
        pearl:    "rgb(var(--rgb-pearl) / <alpha-value>)",
        text: {
          primary:   "rgb(var(--rgb-text-primary) / <alpha-value>)",
          secondary: "rgb(var(--rgb-text-secondary) / <alpha-value>)",
          muted:     "rgb(var(--rgb-text-muted) / <alpha-value>)",
        },
      },
      fontFamily: {
        heading: ["Cormorant Garamond", "Georgia", "serif"],
        body: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-in-out",
        "slide-up": "slideUp 0.4s ease-out",
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
