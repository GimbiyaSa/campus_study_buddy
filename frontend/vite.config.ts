import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Use relative path directly; no URL needed
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": "/src", // relative to project root
    },
  },
});
