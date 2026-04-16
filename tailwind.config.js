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
        background: "var(--background)",
        foreground: "var(--foreground)",
        shire: {
          green: {
            light: '#7cb342',
            DEFAULT: '#689f38',
            dark: '#558b2f',
          },
          gold: {
            light: '#ffca28',
            DEFAULT: '#ffc107',
            dark: '#ffb300',
          },
          brown: {
            light: '#8d6e63',
            DEFAULT: '#6d4c41',
            dark: '#5d4037',
          },
          cream: '#fef5e7',
          leaf: '#33691e',
          earth: '#3e2723',
        }
      },
      fontFamily: {
        'shire': ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
};
export default config;