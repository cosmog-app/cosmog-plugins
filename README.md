# cosmog-plugins

Plugins for [Cosmog](https://github.com/echosonusharma/cosmog). Design: `docs/PLUGINS.md` in the app repo.

- `sdk/`: `@cosmog/plugin-sdk`, plugin side of protocol v1.
- `plugins/excalidraw/`: Excalidraw document editor (desktop).

## Build and load

```sh
npm install
npm run build
```

In a Cosmog debug build: Plugins > Load unpacked > `plugins/<id>/dist`.

## Publish to the store

Cosmog lists what is in `index.json` (Plugins page) and installs signed zips from this repo's releases.

1. Bump `version` in `plugins/<id>/public/cosmog-plugin.json` and commit to `main`.
2. `git tag <id>-v<version> && git push origin <id>-v<version>`.
3. The `release` workflow builds, zips, signs (secret `COSMOG_SIGNING_KEY`, key id `cosmog-2026-1`),
   attaches the zip to a GitHub release and commits the new entry to `index.json` on `main`.

Store page fields come from the manifest: `summary`, `description`, `icon`, `author`, `license`,
`homepage`, `repository`, `upstream`.

Signing key: made once with `node scripts/keygen.mjs <out.pem> <key-id>`. The private key lives only in
the Actions secret and the owner's backup; the public half is compiled into Cosmog
(`src-tauri/src/plugins/store/keys.rs`). A new key needs a Cosmog release before it can sign.

## Rules for plugins (sandboxed, null origin)

- Vite with `base: "./"`; keep `crossorigin` on script/link tags.
- No network (`connect-src 'none'`). Ship every asset in the bundle.
- Fonts: inline as `data:` where WebKit refuses scheme URLs from a null origin.
- Workers: inline as `blob:` (`?worker&inline`); URL workers never start.
