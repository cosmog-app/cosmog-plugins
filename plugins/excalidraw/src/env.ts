// Globals Excalidraw reads while its modules load, so this must be imported before it.

declare global {
  interface Window {
    EXCALIDRAW_ASSET_PATH?: string | string[];
    EXCALIDRAW_EXPORT_SOURCE?: string;
  }
}

// Absolute plugin dir: the frame's origin is opaque, so origin-relative paths would not resolve.
window.EXCALIDRAW_ASSET_PATH = new URL("./", window.location.href).href;
// Saved files name their source; the sandbox origin would write "null".
window.EXCALIDRAW_EXPORT_SOURCE = "https://github.com/cosmog-app/cosmog-plugins";

export {};
