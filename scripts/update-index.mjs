// Puts a release entry into index.json (the store catalog the app reads), replacing that plugin's older one.
// Usage: node scripts/update-index.mjs release/<id>.entry.json
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const [entryPath] = process.argv.slice(2);
if (!entryPath) throw new Error("usage: node scripts/update-index.mjs <entry.json>");
const entry = JSON.parse(readFileSync(entryPath, "utf8"));
const index = existsSync("index.json") ? JSON.parse(readFileSync("index.json", "utf8")) : { schema: 1, plugins: [] };
if (index.schema !== 1) throw new Error(`index.json schema ${index.schema} is not 1`);

const semver = (v) => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  if (!m) throw new Error(`version ${v} is not x.y.z`);
  return m.slice(1).map(Number);
};
const newer = (a, b) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
// The catalog only moves forward: re-tagging an old version must not roll new installs back.
const current = index.plugins.find((p) => p.id === entry.id);
// A re-run of the same release (same bytes) is a no-op, so a failed workflow can simply be re-run.
if (current?.version === entry.version && current.download?.sha256 === entry.download.sha256) {
  console.log(`index.json: ${entry.id} ${entry.version} already listed`);
  process.exit(0);
}
if (current && !newer(entry.version, current.version)) {
  throw new Error(`${entry.id} ${entry.version} is not newer than the listed ${current.version}`);
}
index.plugins = [...index.plugins.filter((p) => p.id !== entry.id), entry].sort((a, b) => a.id.localeCompare(b.id));
writeFileSync("index.json", JSON.stringify(index, null, 2) + "\n");
console.log(`index.json: ${entry.id} ${entry.version}`);
