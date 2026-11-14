import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Project Pages URL: https://<user>.github.io/hk-taxi-map/
  base: process.env.GITHUB_ACTIONS ? "/hk-taxi-map/" : "/",
});