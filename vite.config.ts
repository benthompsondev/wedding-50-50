import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/wedding-50-50/",
  plugins: [react()],
});
