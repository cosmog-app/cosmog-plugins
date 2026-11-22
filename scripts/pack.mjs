// Packs a built plugin for the store: zip, SHA-256, ed25519 signature, and its index.json entry.
// Usage: COSMOG_SIGNING_KEY=<pem> COSMOG_KEY_ID=<id> node scripts/pack.mjs <plugin-dir> <tag>
// Writes release/<id>-<version>.zip and release/<id>.entry.json. Needs the `zip` CLI and git (zip timestamps).
import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

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
// Same input, same zip: fixed times and modes, sorted names, no extra attributes (-X) or
// directory entries (-D). Anyone can rebuild a release and compare the sha256.
const epoch = Number(process.env.SOURCE_DATE_EPOCH ?? execFileSync("git", ["log", "-1", "--format=%ct"]).toString().trim());
if (!Number.isInteger(epoch) || epoch <= 0) throw new Error("SOURCE_DATE_EPOCH or a git commit time is required");
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else files.push(relative(dist, p).split("\\").join("/"));
    chmodSync(p, st.isDirectory() ? 0o755 : 0o644);
    utimesSync(p, epoch, epoch);
  }
})(dist);
files.sort();
// DOS timestamps in a zip are local time: pin the zone. -y is not passed, so symlinks are never stored.
execFileSync("zip", ["-q", "-X", "-D", "-9", zipPath, "-@"], {
  cwd: dist, input: files.join("\n") + "\n", stdio: ["pipe", "inherit", "inherit"], env: { ...process.env, TZ: "UTC" },
});

const data = readFileSync(zipPath);
const sha256 = createHash("sha256").update(data).digest("hex");
// Must match keys::statement in the app.
const statement = Buffer.from(`cosmog-plugin-v1\n${m.id}\n${m.version}\n${sha256}\n`);
const key = createPrivateKey(pem);
const signature = sign(null, statement, key);
// Check against the key the app trusts, not the one derived from the secret: a wrong or rotated
// secret must fail here, not on every user's install.
const trusted = JSON.parse(readFileSync(new URL("./trusted-keys.json", import.meta.url), "utf8"))[keyId];
if (!trusted) throw new Error(`key id ${keyId} is not in scripts/trusted-keys.json`);
const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(trusted, "base64")]);
const appKey = createPublicKey({ key: spki, format: "der", type: "spki" });
if (!verify(null, statement, appKey, signature)) throw new Error(`COSMOG_SIGNING_KEY does not match the trusted ${keyId} public key`);

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
