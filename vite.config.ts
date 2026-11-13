import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig(({ mode }) => ({
  plugins: [
    tailwindcss(),
    react(),
    cloudflare({
      persistState: {
        path: mode === "test" ? ".cloudflare/test-state" : ".cloudflare/state",
      },
    }),
  ],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
}));
