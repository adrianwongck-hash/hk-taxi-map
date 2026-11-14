import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // Project Pages URL: https://<user>.github.io/hk-taxi-map/
  base: mode === "pages" ? "/hk-taxi-map/" : "/",
}));
