// tailwind.config.js
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  "#F3FBF6",
          100: "#E6F7ED",
          200: "#CFF1DE",
          300: "#A7E4C4",
          400: "#7BD9AC",
          500: "#4CCF93",  // primary
          600: "#2FB67B",
          700: "#209666",
          800: "#187652",
          900: "#0F573D",
        },
      },
      boxShadow: {
        card: "0 10px 24px -8px rgba(16,24,40,.12), 0 2px 6px rgba(16,24,40,.04)",
        soft: "0 1px 2px rgba(16,24,40,.06), 0 1px 1px rgba(16,24,40,.04)",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
      },
    },
  },
  plugins: [],
};
