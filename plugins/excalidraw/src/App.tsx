import { useEffect, useMemo, useRef, useState } from "react";
import {
  CaptureUpdateAction, Excalidraw, exportToBlob, FONT_FAMILY, hashElementsVersion, restore, serializeAsJSON,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { connect, type Client, type Theme } from "@cosmog/plugin-sdk";

const PREVIEW_PX = 480;

type Api = ExcalidrawImperativeAPI;
type State = ReturnType<Api["getAppState"]>;
type Files = ReturnType<Api["getFiles"]>;

// What a save would change: elements, the appState fields serializeAsJSON keeps, embedded files.
function signature(elements: Parameters<typeof hashElementsVersion>[0], s: State, files: Files): string {
  return `${hashElementsVersion(elements)}|${s.viewBackgroundColor}|${s.gridModeEnabled}|${s.gridSize}|${s.gridStep}|${Object.keys(files).length}`;
}

const FONT_NAME = new Map(Object.entries(FONT_FAMILY).map(([name, id]) => [id, name]));

// updateScene, unlike initialData, never loads the scene's fonts, and canvas text doesn't trigger a
// load, so text would stay in a fallback font. Excalidraw redraws text on document "loadingdone".
function loadSceneFonts(elements: ReturnType<typeof restore>["elements"]) {
  const chars = new Map<string, Set<string>>();
  for (const el of elements) {
    if (el.type !== "text" || el.isDeleted) continue;
    const name = FONT_NAME.get(el.fontFamily);
    if (!name) continue;
    const set = chars.get(name) ?? new Set<string>();
    for (const c of el.text) set.add(c);
    chars.set(name, set);
  }
  for (const [name, set] of chars) {
    // The text picks the unicode-range segments actually needed (CJK is split into many).
    void document.fonts.load(`20px "${name}"`, [...set].join("")).catch(() => {});
  }
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

export function App() {
  const [theme, setTheme] = useState<Theme>("light");
  const [readOnly, setReadOnly] = useState(false);
  const apiReady = useMemo(() => deferred<Api>(), []);
  // Excalidraw sets up its (empty) scene after the API exists; a document applied before that is
  // wiped, and saving would then store an empty drawing. Loads wait for this.
  const initialized = useMemo(() => deferred<void>(), []);
  // Resolved by the next onChange: updateScene's appState lands with React's next render.
  const changeWaiters = useRef<(() => void)[]>([]);
  const nextChange = () => new Promise<void>((r) => {
    changeWaiters.current.push(r);
    window.setTimeout(r, 1000);
  });
  const baseline = useRef<string | null>(null);
  const initDone = useRef(false);
  // Signature of what the host last serialized; becomes the baseline once the host saves it.
  const serialized = useRef<string | null>(null);
  const client = useRef<Client | null>(null);
  // The file's saved theme must never override the host's.
  const themeRef = useRef<Theme>("light");
  themeRef.current = theme;

  useEffect(() => {
    client.current = connect({
      async onLoad(doc) {
        const api = await apiReady.promise;
        await initialized.promise;
        let data = null;
        if (doc.bytes.byteLength > 0) {
          try {
            data = JSON.parse(new TextDecoder().decode(doc.bytes));
          } catch {
            throw Object.assign(new Error("not valid JSON"), { code: "invalid_document" });
          }
          if (data?.type !== "excalidraw") {
            throw Object.assign(new Error("not an Excalidraw file"), { code: "invalid_document" });
          }
        }
        const r = restore(data, null, null, { repairBindings: true });
        // No dirty reports while the scene is being replaced.
        baseline.current = null;
        setReadOnly(doc.readOnly);
        api.updateScene({ elements: r.elements, appState: { ...r.appState, theme: themeRef.current }, captureUpdate: CaptureUpdateAction.NEVER });
        api.addFiles(Object.values(r.files));
        loadSceneFonts(r.elements);
        api.history.clear();
        api.scrollToContent(undefined, { fitToContent: true, animate: false });
        await nextChange();
        baseline.current = signature(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles());
        client.current?.setDirty(false);
      },
      async onSerialize() {
        const api = await apiReady.promise;
        serialized.current = signature(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles());
        const json = serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), "local");
        return new TextEncoder().encode(json);
      },
      async onExportPreview() {
        const api = await apiReady.promise;
        return exportToBlob({
          elements: api.getSceneElements(),
          appState: { ...api.getAppState(), exportBackground: true },
          files: api.getFiles(),
          mimeType: "image/png",
          maxWidthOrHeight: PREVIEW_PX,
        });
      },
      onTheme: setTheme,
      async onSaved() {
        const api = await apiReady.promise;
        if (serialized.current === null) return;
        baseline.current = serialized.current;
        // Edits made while the save was in flight stay dirty.
        const now = signature(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles());
        client.current?.setDirty(now !== baseline.current);
      },
    });
  }, [apiReady]);

  return (
    <Excalidraw
      excalidrawAPI={(api) => apiReady.resolve(api)}
      theme={theme}
      viewModeEnabled={readOnly}
      onChange={(elements, appState, files) => {
        for (const r of changeWaiters.current.splice(0)) r();
        if (!appState.isLoading && !initDone.current) {
          initDone.current = true;
          // The blank canvas counts as clean until the host loads a document.
          baseline.current = signature(elements, appState, files);
          initialized.resolve();
          return;
        }
        if (baseline.current === null) return;
        client.current?.setDirty(signature(elements, appState, files) !== baseline.current);
      }}
      UIOptions={{
        canvasActions: {
          // Files come from and go to the host shell; downloads and popups are blocked in the sandbox.
          loadScene: false,
          saveToActiveFile: false,
          export: false,
          saveAsImage: false,
          toggleTheme: false,
        },
      }}
    />
  );
}
