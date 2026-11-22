// Writes dist/THIRD_PARTY_NOTICES.txt: name, version, license and license text of every runtime
// package this plugin bundles. MIT and friends require the notice to travel with the copy.
// A package whose npm tarball has no license file gets one from notices/<name, / as __>.txt or
// notices/<@scope>.txt, copied from the upstream repo.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL("..", import.meta.url));
const repo = join(here, "..", "..");
// Our own packages are covered by this repo's LICENSE.
const OWN = /^(@cosmog\/|@cosmog-plugin\/|cosmog-plugins$)/;

const out = execFileSync("npm", ["ls", "-w", "plugins/excalidraw", "--omit=dev", "--all", "--parseable", "--long"], { cwd: repo, encoding: "utf8" });
const seen = new Map();
for (const line of out.split("\n")) {
  const [dir, spec, extra] = line.split(":");
  if (!dir || !spec || extra === "EXTRANEOUS") continue;
  const at = spec.lastIndexOf("@");
  const name = spec.slice(0, at);
  if (!name || OWN.test(name) || seen.has(spec)) continue;
  seen.set(spec, { name, version: spec.slice(at + 1), dir });
}

function licenseText(name, dir) {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(f));
  if (file) return readFileSync(join(dir, file), "utf8").trim();
  // Exact package first, then its scope (one upstream LICENSE covers e.g. every @radix-ui/* package).
  const candidates = [name.replaceAll("/", "__"), name.startsWith("@") ? name.split("/")[0] : null].filter(Boolean);
  const local = candidates.map((c) => join(here, "notices", `${c}.txt`)).find(existsSync);
  return local ? readFileSync(local, "utf8").trim() : null;
}

const parts = [];
const missing = [];
for (const { name, version, dir } of [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const license = typeof pkg.license === "string" ? pkg.license : pkg.license?.type ?? "UNKNOWN";
  const text = licenseText(name, dir);
  if (!text) missing.push(`${name}@${version}`);
  parts.push(`${name} ${version} (${license})\n${"-".repeat(60)}\n${text ?? `License: ${license}. No license file is shipped in the package.`}\n`);
}

const header = `Third-party software bundled in this plugin.

The editor is Excalidraw (https://github.com/excalidraw/excalidraw), free and open source under the
MIT License, by Excalidraw and its contributors. Its fonts ship as part of @excalidraw/excalidraw and
are listed after the packages, under their own licenses.
`;
// Fonts carry their own licenses (mostly OFL, which must travel with the font), not Excalidraw's MIT.
const fonts = readFileSync(join(here, "notices", "fonts.txt"), "utf8").trim();
writeFileSync(join(here, "dist", "THIRD_PARTY_NOTICES.txt"), `${header}\n${parts.join("\n")}\n${fonts}\n`);
console.log(`notices: ${parts.length} packages${missing.length ? `, no license text for ${missing.join(", ")}` : ""}`);
