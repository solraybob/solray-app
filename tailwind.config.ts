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
        forest: {
          deep: "#050f08",
          dark: "#071510",
          card: "#0a1f12",
          border: "#1a3020",
        },
        amber: {
          // Amber-sun remains the hero accent — logo, primary CTAs,
          // focus rings, the Sun planet. Everything else pulls from the
          // aged-pigment palette below.
          sun: "#e8821a",
        },
        // Aged-pigment palette — desaturated earth tones meant to
        // harmonize with the forest background and the amber-sun hero.
        // Each tone is a single value (not a scale) used via Tailwind's
        // /opacity syntax: bg-ember/20, text-mist, border-indigo/30, etc.
        ember:    "#c4623a",  // warm secondary, errors, action heat
        moss:     "#6b7d4a",  // growth, physical, abundance
        mist:     "#7a8a9a",  // air, intellect, silvery coolness
        indigo:   "#4a6670",  // deep water, structure, the field
        wisteria: "#7d6680",  // soft purple, intuition, higher self
        pearl:    "#d8d0bc",  // luminous neutral, moon highlights
        text: {
          primary: "#e8e0cc",
          secondary: "#8a9e8d",
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
