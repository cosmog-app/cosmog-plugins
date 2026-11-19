import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// WebKit refuses font loads from the plugin scheme in a null-origin frame, so fonts ship as data:
// URIs. Xiaolai (CJK, 13 MB) stays a URL and falls back to a system font where it cannot load.
const FONT_REF = /"\.\/fonts\/((?!Xiaolai)[\w./-]+\.woff2)"/g;

function inlineExcalidrawFonts(): Plugin {
  const prod = new URL(".", import.meta.resolve("@excalidraw/excalidraw"));
  return {
    name: "inline-excalidraw-fonts",
    transform(code, id) {
      if (!id.includes("@excalidraw/excalidraw/dist/") || !code.includes("./fonts/")) return null;
      return code.replace(FONT_REF, (_m, rel: string) => {
        const b64 = readFileSync(fileURLToPath(new URL(`fonts/${rel}`, prod))).toString("base64");
        return JSON.stringify(`data:font/woff2;base64,${b64}`);
      });
    },
  };
}

// Served from cosmog-plugin://localhost/<id>/<version>/, so every URL must be relative.
// Vite emits `crossorigin` on script and link tags, which the null-origin frame needs.
export default defineConfig({
  base: "./",
  plugins: [react(), inlineExcalidrawFonts()],
  define: { "process.env.IS_PREACT": JSON.stringify("false") },
  build: {
    target: "es2022",
    assetsInlineLimit: (file) => (file.endsWith(".woff2") ? true : undefined),
    chunkSizeWarningLimit: 4096,
  },
});
