import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Palette Glow Up
        glowup: {
          licorice: "#220101",
          rose: "#B06F70",
          "rose-dark": "#9A5F60",
          "rose-light": "#C48B8C",
          green: "#E5F2B5",
          lace: "#F5EDE0",
          "lace-dark": "#E8DED0",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "glow": "0 0 20px rgba(176, 111, 112, 0.3)",
        "card": "0 4px 6px -1px rgba(34, 1, 1, 0.1), 0 2px 4px -2px rgba(34, 1, 1, 0.1)",
        "card-hover": "0 10px 15px -3px rgba(34, 1, 1, 0.1), 0 4px 6px -4px rgba(34, 1, 1, 0.1)",
      },
      backgroundImage: {
        "gradient-login": "linear-gradient(180deg, #220101 0%, #3D1515 50%, rgba(176, 111, 112, 0.25) 100%)",
        "villa-tv-depth":
          "radial-gradient(ellipse 95% 60% at 50% -15%, rgba(245, 237, 224, 0.09), transparent 52%), radial-gradient(ellipse 80% 45% at 100% 30%, rgba(176, 111, 112, 0.08), transparent 50%), radial-gradient(ellipse 70% 50% at 0% 70%, rgba(34, 1, 1, 0.45), transparent 55%)",
        "villa-tv-vignette": "radial-gradient(ellipse 75% 65% at 50% 50%, transparent 40%, rgba(0, 0, 0, 0.42) 100%)",
      },
      keyframes: {
        "bubble-drift-1": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "25%": { transform: "translate(5vw, -4vh) scale(1.04)" },
          "50%": { transform: "translate(2vw, 2.5vh) scale(0.97)" },
          "75%": { transform: "translate(-4.5vw, -3vh) scale(1.03)" },
        },
        "bubble-drift-2": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "33%": { transform: "translate(-5vw, 3.5vh) scale(1.05)" },
          "66%": { transform: "translate(4vw, -4vh) scale(0.96)" },
        },
        "bubble-drift-3": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "50%": { transform: "translate(-3.5vw, -5vh) scale(1.06)" },
        },
        "bubble-drift-4": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "40%": { transform: "translate(6vw, 2vh) scale(1.04)" },
          "80%": { transform: "translate(-2vw, -3.5vh) scale(0.97)" },
        },
      },
      animation: {
        "bubble-drift-1": "bubble-drift-1 32s ease-in-out infinite",
        "bubble-drift-2": "bubble-drift-2 36s ease-in-out infinite",
        "bubble-drift-3": "bubble-drift-3 40s ease-in-out infinite",
        "bubble-drift-4": "bubble-drift-4 34s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
