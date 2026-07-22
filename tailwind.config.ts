import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // TriageOS "SOC console" palette
        panel: "#0d1117",
        panelalt: "#161b22",
        edge: "#30363d",
        term: "#0a0e14",
        accent: "#39d353",
        warn: "#f0883e",
        danger: "#f85149",
        info: "#58a6ff",
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
