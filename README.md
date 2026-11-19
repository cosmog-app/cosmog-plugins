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

## Rules for plugins (sandboxed, null origin)

- Vite with `base: "./"`; keep `crossorigin` on script/link tags.
- No network (`connect-src 'none'`). Ship every asset in the bundle.
- Fonts: inline as `data:` where WebKit refuses scheme URLs from a null origin.
- Workers: inline as `blob:` (`?worker&inline`); URL workers never start.
