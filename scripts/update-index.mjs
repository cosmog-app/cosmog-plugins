// Puts a release entry into index.json (the store catalog the app reads), replacing that plugin's old one.
// Usage: node scripts/update-index.mjs release/<id>.entry.json
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [entryPath] = process.argv.slice(2);
if (!entryPath) throw new Error("usage: node scripts/update-index.mjs <entry.json>");
const entry = JSON.parse(readFileSync(entryPath, "utf8"));
const index = existsSync("index.json") ? JSON.parse(readFileSync("index.json", "utf8")) : { schema: 1, plugins: [] };
if (index.schema !== 1) throw new Error(`index.json schema ${index.schema} is not 1`);
index.plugins = [...index.plugins.filter((p) => p.id !== entry.id), entry].sort((a, b) => a.id.localeCompare(b.id));
writeFileSync("index.json", JSON.stringify(index, null, 2) + "\n");
console.log(`index.json: ${entry.id} ${entry.version}`);
