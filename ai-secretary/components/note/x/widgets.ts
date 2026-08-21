declare global {
  interface Window {
    twttr?: { widgets?: { load: (element?: HTMLElement) => void } };
  }
}

let scriptPromise: Promise<void> | null = null;

export function loadXWidgets(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.twttr?.widgets) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("x-widgets-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("X widget failed")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "x-widgets-js";
    script.src = "https://platform.twitter.com/widgets.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("X widget failed"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}
