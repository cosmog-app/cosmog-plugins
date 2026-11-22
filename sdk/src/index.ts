// Plugin side of the Cosmog plugin protocol v1 (cosmog docs/PLUGINS.md).
// The app keeps its own copy of these types; apiVersion keeps both sides honest.

export const API_VERSION = 1;
const DIRTY_RESEND_MS = 1_000;

export type Theme = "light" | "dark";
export type ToastKind = "info" | "success" | "error";

export interface DocLoad {
  name: string;
  mime: string;
  bytes: ArrayBuffer;
  readOnly: boolean;
}

type Bytes = ArrayBuffer | Uint8Array;

export interface Handlers {
  /** Show this document. Empty bytes mean a new, blank document. */
  onLoad(doc: DocLoad): void | Promise<void>;
  /** Return the current content. */
  onSerialize(): Bytes | Promise<Bytes>;
  /** Optional small PNG thumbnail. */
  onExportPreview?(): Bytes | Blob | Promise<Bytes | Blob>;
  onTheme?(mode: Theme): void;
  /** The host stored what the last onSerialize returned. Move the dirty baseline there and call setDirty. */
  onSaved?(): void;
}

export interface Options {
  /** Turn Ctrl/Cmd+S into a host save. Default true. */
  saveShortcut?: boolean;
}

export interface Client {
  setDirty(dirty: boolean): void;
  requestSave(): void;
  toast(kind: ToastKind, text: string): void;
}

type Msg = { cosmog: 1; id?: string; method?: string; params?: Record<string, unknown> };

const send = (msg: Record<string, unknown>, transfer: Transferable[] = []) =>
  window.parent.postMessage({ cosmog: 1, ...msg }, "*", transfer);

// Copy into a fresh buffer we can transfer without detaching memory the editor still uses.
function toBuffer(b: Bytes): ArrayBuffer {
  const u = b instanceof Uint8Array ? b : new Uint8Array(b);
  return u.slice().buffer as ArrayBuffer;
}

export function connect(h: Handlers, opts: Options = {}): Client {
  let dirty: boolean | null = null;
  let lastDirtySent = 0;

  const reply = (id: string | undefined, result: unknown, transfer: Transferable[] = []) => {
    if (id) send({ id, result }, transfer);
  };

  const methods: Record<string, (p: Record<string, unknown>, id?: string) => Promise<void>> = {
    "doc.load": async (p, id) => {
      // A blank document here would be saved over the real file.
      if (!(p.bytes instanceof ArrayBuffer)) throw Object.assign(new Error("doc.load without bytes"), { code: "bad_request" });
      const bytes = p.bytes;
      await h.onLoad({ name: String(p.name ?? ""), mime: String(p.mime ?? ""), bytes, readOnly: p.readOnly === true });
      dirty = false;
      reply(id, null);
    },
    "doc.serialize": async (_p, id) => {
      const buf = toBuffer(await h.onSerialize());
      reply(id, { bytes: buf }, [buf]);
    },
    "doc.exportPreview": async (_p, id) => {
      if (!h.onExportPreview) throw Object.assign(new Error("not supported"), { code: "unsupported" });
      const out = await h.onExportPreview();
      const buf = out instanceof Blob ? await out.arrayBuffer() : toBuffer(out);
      reply(id, { png: buf }, [buf]);
    },
    "doc.saved": async () => {
      // Forget the cached flag so the next setDirty always reaches the host.
      dirty = null;
      h.onSaved?.();
    },
    "ui.theme": async (p) => {
      if (p.mode === "light" || p.mode === "dark") h.onTheme?.(p.mode);
    },
    // Pinch the host caught before the webview zoomed the page (Linux). Replayed as Ctrl+wheel,
    // which is what browsers send for a trackpad pinch and what canvas editors zoom on.
    "ui.pinch": async (p) => {
      const x = Number(p.x), y = Number(p.y), deltaY = Number(p.deltaY);
      if (![x, y, deltaY].every(Number.isFinite)) return;
      const target = document.elementFromPoint(x, y) ?? document.body;
      target.dispatchEvent(new WheelEvent("wheel", {
        ctrlKey: true, deltaY, deltaMode: 0, clientX: x, clientY: y, bubbles: true, cancelable: true,
      }));
    },
  };

  window.addEventListener("message", async (e: MessageEvent) => {
    if (e.source !== window.parent) return;
    const m = e.data as Msg;
    if (!m || m.cosmog !== 1 || typeof m.method !== "string") return;
    const fn = methods[m.method];
    if (!fn) {
      if (m.id) send({ id: m.id, error: { code: "unknown_method", message: m.method } });
      return;
    }
    try {
      await fn(m.params ?? {}, m.id);
    } catch (err) {
      const code = (err as { code?: string }).code ?? "plugin_error";
      if (m.id) send({ id: m.id, error: { code, message: String((err as Error)?.message ?? err) } });
    }
  });

  if (opts.saveShortcut !== false) {
    // Capture phase so the editor never sees it; keys inside the iframe never reach the host.
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === "KeyS") {
        e.preventDefault();
        e.stopImmediatePropagation();
        send({ method: "shell.save" });
      }
    }, true);
  }

  send({ method: "ready", params: { apiVersion: API_VERSION } });

  return {
    setDirty(d) {
      // Repeat the current state at most once a second, so a host that lost track
      // (missed event, reload) is corrected by the next edit instead of never.
      const now = Date.now();
      if (d === dirty && now - lastDirtySent < DIRTY_RESEND_MS) return;
      dirty = d;
      lastDirtySent = now;
      send({ method: "doc.dirty", params: { dirty: d } });
    },
    requestSave() {
      send({ method: "shell.save" });
    },
    toast(kind, text) {
      send({ method: "ui.toast", params: { kind, text } });
    },
  };
}
