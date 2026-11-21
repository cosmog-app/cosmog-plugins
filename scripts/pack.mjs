// Packs a built plugin for the store: zip, SHA-256, ed25519 signature, and its index.json entry.
// Usage: COSMOG_SIGNING_KEY=<pem> COSMOG_KEY_ID=<id> node scripts/pack.mjs <plugin-dir> <tag>
// Writes release/<id>-<version>.zip and release/<id>.entry.json. Needs the `zip` CLI.
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const [pluginDir, tag] = process.argv.slice(2);
const { COSMOG_SIGNING_KEY: pem, COSMOG_KEY_ID: keyId, GITHUB_REPOSITORY: repo = "cosmog-app/cosmog-plugins" } = process.env;
if (!pluginDir || !tag) throw new Error("usage: node scripts/pack.mjs <plugin-dir> <tag>");
if (!pem || !keyId) throw new Error("COSMOG_SIGNING_KEY and COSMOG_KEY_ID must be set");

const dist = resolve(pluginDir, "dist");
const m = JSON.parse(readFileSync(join(dist, "cosmog-plugin.json"), "utf8"));
if (tag !== `${m.id}-v${m.version}`) throw new Error(`tag ${tag} does not match manifest ${m.id}-v${m.version}`);

const outDir = resolve("release");
mkdirSync(outDir, { recursive: true });
const zipName = `${m.id}-${m.version}.zip`;
const zipPath = join(outDir, zipName);
rmSync(zipPath, { force: true });
// -X: no extra file attributes; -y would store symlinks, which the app refuses anyway.
execFileSync("zip", ["-q", "-r", "-X", "-9", zipPath, "."], { cwd: dist, stdio: "inherit" });

const data = readFileSync(zipPath);
const sha256 = createHash("sha256").update(data).digest("hex");
// Must match keys::statement in the app.
const statement = Buffer.from(`cosmog-plugin-v1\n${m.id}\n${m.version}\n${sha256}\n`);
const key = createPrivateKey(pem);
const signature = sign(null, statement, key);
if (!verify(null, statement, createPublicKey(key), signature)) throw new Error("self-check of the signature failed");

let icon;
if (m.icon) {
  const mime = m.icon.endsWith(".svg") ? "image/svg+xml" : "image/png";
  icon = `data:${mime};base64,${readFileSync(join(dist, m.icon)).toString("base64")}`;
}

const entry = {
  id: m.id,
  name: m.name,
  version: m.version,
  summary: m.summary,
  description: m.description,
  icon,
  author: m.author,
  license: m.license,
  homepage: m.homepage,
  repository: m.repository,
  upstream: m.upstream,
  platforms: m.platforms,
  minAppVersion: m.minAppVersion,
  fileTypes: (m.fileTypes ?? []).map((f) => ({ ext: f.ext, label: f.label })),
  releasedAt: new Date().toISOString(),
  download: {
    url: `https://github.com/${repo}/releases/download/${tag}/${zipName}`,
    size: data.length,
    sha256,
    keyId,
    signature: signature.toString("base64"),
  },
};
writeFileSync(join(outDir, `${m.id}.entry.json`), JSON.stringify(entry, null, 2) + "\n");
console.log(`${zipName}: ${data.length} bytes, sha256 ${sha256}`);
