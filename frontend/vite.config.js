import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // The Express API (Phase 2) will run on :4000.
      // This lets the frontend call /api/* with no CORS setup needed in dev.
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
});
