import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, /api is proxied to the local backend. In Docker, nginx does the same (BACKEND_URL).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: { "/api": process.env.VITE_DEV_BACKEND ?? "http://localhost:8000" },
  },
  build: { chunkSizeWarningLimit: 2000 },
  test: { environment: "node", include: ["src/**/*.test.js"] },
});
