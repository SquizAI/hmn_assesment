import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

function getServerPort(): number {
  const portFile = join(__dirname, ".server-port");
  if (existsSync(portFile)) {
    return parseInt(readFileSync(portFile, "utf-8").trim(), 10);
  }
  return 3001; // fallback
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // port 0 = auto-pick next available
    port: 0,
    strictPort: false,
    proxy: {
      "/api": {
        target: `http://localhost:${getServerPort()}`,
        changeOrigin: true,
      },
    },
  },
});
