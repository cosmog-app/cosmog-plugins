// Creates the store signing key. Private key: PKCS#8 PEM at the given path (mode 600), never printed.
// Prints the public half for TRUSTED_KEYS in cosmog (src-tauri/src/plugins/store/keys.rs) and scripts/trusted-keys.json.
// Usage: node scripts/keygen.mjs <out.pem> <key-id>
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [out, keyId] = process.argv.slice(2);
if (!out || !keyId) throw new Error("usage: node scripts/keygen.mjs <out.pem> <key-id>");
if (existsSync(out)) throw new Error(`${out} exists; refusing to overwrite a signing key`);

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
writeFileSync(out, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600, flag: "wx" });

// Raw 32-byte key is the tail of the SPKI DER.
const raw = publicKey.export({ type: "spki", format: "der" }).subarray(-32);
console.log(`key id:     ${keyId}`);
console.log(`public b64: ${raw.toString("base64")}`);
console.log(`rust:       TrustedKey { id: "${keyId}", public: [${[...raw].join(", ")}] },`);
