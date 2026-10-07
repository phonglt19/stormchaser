// Dev smoke test: loads the game in headless Chrome over CDP, drives it for N
// simulation frames, reports console errors and writes a screenshot.
//
//   node tools/smoke.mjs <url> <out.png> [frames] [setupJs]
//
// setupJs runs in the page with `k` bound to window.__keysota, e.g.
//   "k.input.down.add('KeyW')"
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME =
  process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const [url, out, framesArg, setupJs, postJs] = process.argv.slice(2);
if (!url || !out) {
  console.error('usage: node tools/smoke.mjs <url> <out.png> [frames] [setupJs] [postJs]');
  process.exit(2);
}
const frames = Number(framesArg || 900);
const PORT = 9000 + Math.floor(Math.random() * 900);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = [];
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => {
      ws.onopen = res;
      ws.onerror = () => rej(new Error('ws connect failed'));
    });
    const c = new Cdp(ws);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && c.pending.has(msg.id)) {
        const { resolve, reject } = c.pending.get(msg.id);
        c.pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        for (const h of c.handlers) h(msg);
      }
    };
    return c;
  }

  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(fn) {
    this.handlers.push(fn);
  }
}

const profile = path.join(process.env.TEMP || '/tmp', `ccprobe-${Date.now()}`);
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--enable-unsafe-swiftshader',
    '--hide-scrollbars',
    '--no-first-run',
    '--mute-audio',
    '--force-color-profile=srgb',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    '--window-size=1280,720',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

const errors = [];
const logs = [];
let cdp;

function cleanup(code) {
  try {
    cdp && cdp.close();
  } catch {
    /* ignore */
  }
  if (process.platform === 'win32' && chrome.pid) {
    spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    chrome.kill('SIGKILL');
  }
  try {
    fs.rmSync(profile, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  process.exit(code);
}

async function main() {
  let version = null;
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      version = await r.json();
      break;
    } catch {
      await sleep(250);
    }
  }
  if (!version) throw new Error('chrome devtools endpoint never came up');

  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target');

  cdp = await Cdp.connect(page.webSocketDebuggerUrl);
  cdp.on((msg) => {
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(`EXCEPTION: ${d.exception?.description || d.text}`);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || [])
        .map((a) => a.value ?? a.description ?? a.type)
        .join(' ');
      if (msg.params.type === 'error') errors.push(`CONSOLE.ERROR: ${text}`);
      else if (msg.params.type === 'warning') logs.push(`WARN: ${text}`);
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error') errors.push(`LOG.ERROR: ${e.text} ${e.url || ''}`);
    }
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.navigate', { url });

  const evaluate = async (expression, awaitPromise = false) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
    if (r.exceptionDetails) {
      throw new Error(`eval failed: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    }
    return r.result.value;
  };

  let ready = false;
  for (let i = 0; i < 160; i++) {
    try {
      ready = await evaluate(
        '!!window.__keysota && document.getElementById("loading").classList.contains("hidden")'
      );
      if (ready) break;
    } catch {
      /* page may still be navigating */
    }
    await sleep(250);
  }
  if (!ready) throw new Error('game never finished booting');

  if (setupJs) {
    await evaluate(`(function(){ const k = window.__keysota; return (${setupJs}) })()`, true);
  }

  await evaluate(`window.__keysota.step(${frames})`, true);
  if (postJs) {
    await evaluate(
      `(function(){ const k = window.__keysota; ${postJs}; k.renderer.render(k.scene, k.camera); })()`
    );
  }
  const info = await evaluate('JSON.stringify(window.__keysota.info())');

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(path.resolve(out), Buffer.from(shot.data, 'base64'));

  console.log('INFO: ' + info);
  if (logs.length) console.log('--- warnings ---\n' + logs.slice(0, 12).join('\n'));
  if (errors.length) {
    console.log('--- ERRORS ---\n' + [...new Set(errors)].slice(0, 25).join('\n'));
  } else {
    console.log('NO CONSOLE ERRORS');
  }
  cleanup(0);
}

const guard = setTimeout(() => {
  console.error('TIMEOUT');
  cleanup(1);
}, 240000);

main()
  .then(() => clearTimeout(guard))
  .catch((e) => {
    console.error('FAILED: ' + e.message);
    if (errors.length) console.error([...new Set(errors)].slice(0, 25).join('\n'));
    clearTimeout(guard);
    cleanup(1);
  });
