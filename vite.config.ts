import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import roundtableVizPlugin from "./scripts/roundtable-viz-plugin.cjs";

export default defineConfig({
  plugins: [react(), roundtableVizPlugin()],
  build: {
    rollupOptions: {
      input: "index.html",
    },
  },
});
