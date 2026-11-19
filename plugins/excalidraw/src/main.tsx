import { createRoot } from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import "./app.css";
import { App } from "./App";

declare global {
  interface Window { EXCALIDRAW_ASSET_PATH?: string | string[] }
}

// Absolute plugin dir: the frame's origin is opaque, so origin-relative paths would not resolve.
window.EXCALIDRAW_ASSET_PATH = new URL("./", window.location.href).href;

createRoot(document.getElementById("root")!).render(<App />);
