// Minimal Chrome DevTools Protocol client (Node's built-in WebSocket, no dependency): launches a
// headless Chrome with a throwaway profile and drives one page, including cross-origin iframes.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  const profile = mkdtempSync(join(tmpdir(), "deck-qa-"));
  const port = 9400 + Math.floor(Math.random() * 500);
  const chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--window-size=1400,1000",
    "--site-per-process=false", "--disable-features=IsolateOrigins,site-per-process", "about:blank",
  ], { stdio: "ignore" });
  let targets;
  for (let i = 0; i < 50 && !targets; i++) {
    await sleep(200);
    targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json()).catch(() => null);
  }
  const page = targets?.find((t) => t.type === "page");
  if (!page) throw new Error("chrome did not start");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      const { resolve, reject } = pending.get(d.id);
      pending.delete(d.id);
      d.error ? reject(new Error(`${d.error.message} ${d.error.data ?? ""}`)) : resolve(d.result);
    }
  };
  const cdp = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  await cdp("Page.enable");
  await cdp("Runtime.enable");

  // Evaluate in the top page, or in the first frame whose URL contains `frameUrl`.
  const evaluate = async (expression, frameUrl) => {
    let contextId;
    if (frameUrl) {
      const { frameTree } = await cdp("Page.getFrameTree");
      const all = [];
      const walk = (t) => { all.push(t.frame); (t.childFrames ?? []).forEach(walk); };
      walk(frameTree);
      const f = all.find((x) => x.url.includes(frameUrl));
      if (!f) return undefined;
      ({ executionContextId: contextId } = await cdp("Page.createIsolatedWorld", { frameId: f.id, worldName: "qa" }));
    }
    const r = await cdp("Runtime.evaluate", { expression, contextId, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  };
  const waitFor = async (expression, frameUrl, ms = 30000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = await evaluate(expression, frameUrl).catch(() => undefined);
      if (v) return v;
      await sleep(500);
    }
    throw new Error(`timed out waiting for: ${expression.slice(0, 120)}${frameUrl ? ` (in ${frameUrl})` : ""}`);
  };
  const type = (text) => cdp("Input.insertText", { text });
  const screenshot = async () => Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64");
  const close = () => { try { ws.close(); } catch {} chrome.kill("SIGKILL"); rmSync(profile, { recursive: true, force: true }); };
  return { cdp, evaluate, waitFor, type, screenshot, close };
}
