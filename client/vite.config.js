import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

// react() lets Vite understand JSX.
// tailwindcss() is the Tailwind v4 plugin, so no tailwind.config.js is needed.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
