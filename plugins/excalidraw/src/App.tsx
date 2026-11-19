import { useEffect, useMemo, useRef, useState } from "react";
import {
  CaptureUpdateAction, Excalidraw, exportToBlob, hashElementsVersion, restore, serializeAsJSON,
} from "@excalidraw/excalidraw";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { connect, type Client, type Theme } from "@cosmog/plugin-sdk";

const PREVIEW_PX = 480;

type Api = ExcalidrawImperativeAPI;
type State = ReturnType<Api["getAppState"]>;
type Files = ReturnType<Api["getFiles"]>;

// What a save would change: elements, saved appState fields, embedded files.
function signature(elements: Parameters<typeof hashElementsVersion>[0], s: State, files: Files): string {
  return `${hashElementsVersion(elements)}|${s.viewBackgroundColor}|${s.gridModeEnabled}|${s.gridSize}|${Object.keys(files).length}`;
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
  const baseline = useRef<string | null>(null);
  const client = useRef<Client | null>(null);

  useEffect(() => {
    client.current = connect({
      async onLoad(doc) {
        const api = await apiReady.promise;
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
        setReadOnly(doc.readOnly);
        api.updateScene({ elements: r.elements, appState: r.appState, captureUpdate: CaptureUpdateAction.NEVER });
        api.addFiles(Object.values(r.files));
        api.history.clear();
        api.scrollToContent(undefined, { fitToContent: true, animate: false });
        baseline.current = signature(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles());
      },
      async onSerialize() {
        const api = await apiReady.promise;
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
    });
  }, [apiReady]);

  return (
    <Excalidraw
      excalidrawAPI={(api) => {
        apiReady.resolve(api);
        // The blank canvas counts as clean until the host loads a document.
        baseline.current ??= signature(api.getSceneElementsIncludingDeleted(), api.getAppState(), api.getFiles());
      }}
      theme={theme}
      viewModeEnabled={readOnly}
      onChange={(elements, appState, files) => {
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
