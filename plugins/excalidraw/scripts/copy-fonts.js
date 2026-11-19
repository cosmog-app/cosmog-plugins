// Only Xiaolai (CJK) is loaded by URL; the other fonts are inlined by vite.config.ts.
import { cpSync } from "node:fs";
import { fileURLToPath } from "node:url";

const prod = new URL(".", import.meta.resolve("@excalidraw/excalidraw"));
cpSync(fileURLToPath(new URL("fonts/Xiaolai", prod)), fileURLToPath(new URL("../dist/fonts/Xiaolai", import.meta.url)), { recursive: true });
console.log("Xiaolai fonts copied");
