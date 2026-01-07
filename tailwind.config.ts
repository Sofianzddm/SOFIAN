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
      },
    },
  },
  plugins: [],
};

export default config;
