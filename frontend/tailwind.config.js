/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#161B22",
          soft: "#232A35",
          muted: "#3A4250",
        },
        paper: "#F6F4EF",
        surface: "#FFFFFF",
        border: "#E3DFD3",
        text: {
          DEFAULT: "#1C2127",
          muted: "#6E6A5F",
        },
        accent: {
          DEFAULT: "#DB8B2B",
          soft: "#F4E3C6",
          dark: "#B96F1A",
        },
        success: {
          DEFAULT: "#3F7D5C",
          soft: "#DEEBE3",
        },
        danger: {
          DEFAULT: "#B8453C",
          soft: "#F5DFDC",
        },
        info: {
          DEFAULT: "#3B6E91",
          soft: "#DCE8EE",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      boxShadow: {
        card: "0 1px 2px rgba(22, 27, 34, 0.06), 0 1px 1px rgba(22, 27, 34, 0.04)",
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
      },
    },
  },
  plugins: [],
};
