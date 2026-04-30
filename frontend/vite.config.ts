import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5170,
    host: "0.0.0.0",
    allowedHosts: ["127.0.0.1", "localhost", "q4os", "q4os.leopard-canopus.ts.net"],
    proxy: {
      "/api": {
        target: "http://localhost:8001",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8001",
        ws: true,
      },
    },
  },
});
