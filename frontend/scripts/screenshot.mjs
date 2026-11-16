#!/usr/bin/env node
/**
 * Local visual review screenshots — not a CI gate, and not stored in git.
 *
 * Uses the system Chrome over the DevTools protocol, so it has no package dependency.
 * Output defaults to <repo>/tmp/visual/, which .gitignore already excludes (`**​/tmp`).
 *
 * Log in in a normal browser first, then copy the `openkms_session` cookie:
 *
 *   npm run screenshot -- --cookie "openkms_session=..." --path / --path /datasets
 *
 * Or set OPENKMS_SESSION_COOKIE. Without a cookie the public/login pages still render.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false },
  mobile: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true },
};

function usage() {
  console.log(`Usage: npm run screenshot -- [options]

Options:
  --base-url <url>       App origin (default: http://localhost:5173)
  --path <path>          Route to capture; repeatable (default: /)
  --name <name>          File-name prefix for the following --path (optional)
  --cookie <header>      Cookie header, e.g. "openkms_session=..." (or OPENKMS_SESSION_COOKIE)
  --viewport <name>      desktop | mobile | all (default: all)
  --out <dir>            Output directory (default: <repo>/tmp/visual)
  --wait <ms>            Extra settle time after load (default: 1500)
  --full-page            Capture the whole scrollable page
  --check-overflow       Warn when the page is wider than the viewport
  --eval <expression>    Evaluate JS after settling and print the result (debugging)
  --chrome <path>        Chrome/Chromium executable (or CHROME_PATH)
  --keep-profile         Keep the temporary Chrome profile for debugging
  -h, --help             Show this help

Examples:
  npm run screenshot -- --cookie "$OPENKMS_SESSION_COOKIE" --path / --path /datasets
  npm run screenshot -- --base-url http://localhost:5173 --path /settings --viewport desktop
`);
}

function parseArgs(argv) {
  const out = {
    baseUrl: 'http://localhost:5173',
    paths: [],
    pendingName: null,
    cookie: process.env.OPENKMS_SESSION_COOKIE || '',
    viewports: ['desktop', 'mobile'],
    out: join(REPO_ROOT, 'tmp', 'visual'),
    wait: 1500,
    fullPage: false,
    checkOverflow: false,
    evalExpression: '',
    chrome: process.env.CHROME_PATH || '',
    keepProfile: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
      i += 1;
      return argv[i];
    };
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    } else if (arg === '--base-url') out.baseUrl = next();
    else if (arg === '--path') {
      const value = next();
      out.paths.push({ path: value, name: out.pendingName });
      out.pendingName = null;
    } else if (arg === '--name') out.pendingName = next();
    else if (arg === '--cookie') out.cookie = next();
    else if (arg === '--out') out.out = next();
    else if (arg === '--wait') out.wait = Number(next());
    else if (arg === '--full-page') out.fullPage = true;
    else if (arg === '--check-overflow') out.checkOverflow = true;
    else if (arg === '--eval') out.evalExpression = next();
    else if (arg === '--chrome') out.chrome = next();
    else if (arg === '--keep-profile') out.keepProfile = true;
    else if (arg === '--viewport') {
      const value = next();
      out.viewports = value === 'all' ? ['desktop', 'mobile'] : [value];
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (out.paths.length === 0) out.paths.push({ path: '/', name: out.pendingName });
  else if (out.pendingName) throw new Error('--name must come before its --path');
  const bad = out.viewports.filter((v) => !VIEWPORTS[v]);
  if (bad.length) throw new Error(`Unknown viewport: ${bad.join(', ')}`);
  if (!Number.isFinite(out.wait) || out.wait < 0) throw new Error('--wait must be a non-negative number');
  out.baseUrl = out.baseUrl.replace(/\/+$/, '');
  return out;
}

function chromePath(explicit) {
  const candidates = [
    explicit,
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error('Chrome not found. Pass --chrome or set CHROME_PATH.');
  return found;
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitForFile(path, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (existsSync(path)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${path}`);
}

function connect(url) {
  return new Promise((resolvePromise, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    const events = new Map();
    let nextId = 1;

    ws.addEventListener('open', () => {
      resolvePromise({
        send(method, params = {}) {
          const id = nextId;
          nextId += 1;
          return new Promise((resolveRequest, rejectRequest) => {
            pending.set(id, { resolve: resolveRequest, reject: rejectRequest, method });
            ws.send(JSON.stringify({ id, method, params }));
          });
        },
        on(method, handler) {
          const handlers = events.get(method) || [];
          handlers.push(handler);
          events.set(method, handlers);
        },
        close() {
          ws.close();
        },
      });
    });
    ws.addEventListener('error', () => reject(new Error(`Could not connect to Chrome at ${url}`)));
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
        else request.resolve(message.result);
        return;
      }
      for (const handler of events.get(message.method) || []) handler(message.params);
    });
  });
}

function slugFor(path, name) {
  if (name) return name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  const withoutQuery = path.split('?')[0].replace(/^\/+|\/+$/g, '');
  return (withoutQuery || 'home').replace(/[^\w.-]+/g, '-');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const executable = chromePath(args.chrome);
  const profile = mkdtempSync(join(tmpdir(), 'openkms-screenshot-'));
  mkdirSync(args.out, { recursive: true });

  const chrome = spawn(executable, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let chromeError = '';
  chrome.stderr.on('data', (chunk) => {
    chromeError += chunk.toString();
  });

  try {
    const portFile = join(profile, 'DevToolsActivePort');
    await waitForFile(portFile);
    const [port] = readFileSync(portFile, 'utf8').trim().split('\n');
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    const page = targets.find((target) => target.type === 'page');
    if (!page) throw new Error('Chrome did not expose a page target');

    const cdp = await connect(page.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Runtime.enable');

    if (args.cookie) {
      for (const pair of args.cookie.split(';')) {
        const trimmed = pair.trim();
        if (!trimmed) continue;
        const index = trimmed.indexOf('=');
        if (index <= 0) continue;
        await cdp.send('Network.setCookie', {
          name: trimmed.slice(0, index),
          value: trimmed.slice(index + 1),
          url: args.baseUrl,
          path: '/',
        });
      }
    }

    for (const viewportName of args.viewports) {
      const viewport = VIEWPORTS[viewportName];
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor,
        mobile: viewport.mobile,
      });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: viewport.mobile });

      for (const item of args.paths) {
        const url = `${args.baseUrl}${item.path.startsWith('/') ? '' : '/'}${item.path}`;
        await cdp.send('Page.navigate', { url });
        // The SPA mounts after load; let fonts and the first data round-trip settle.
        await sleep(300);
        await cdp.send('Runtime.evaluate', {
          expression: 'document.fonts ? document.fonts.ready.then(() => true) : true',
          awaitPromise: true,
          returnByValue: true,
        }).catch(() => {});
        await sleep(args.wait);

        if (args.evalExpression) {
          const result = await cdp.send('Runtime.evaluate', {
            expression: args.evalExpression,
            returnByValue: true,
            awaitPromise: true,
          });
          console.log(JSON.stringify(result.result.value, null, 2));
        }

        if (args.checkOverflow) {
          const result = await cdp.send('Runtime.evaluate', {
            expression: `({
              scrollWidth: document.documentElement.scrollWidth,
              clientWidth: document.documentElement.clientWidth,
              bodyScrollWidth: document.body.scrollWidth,
            })`,
            returnByValue: true,
          });
          const size = result.result.value;
          if (size && size.scrollWidth > size.clientWidth + 1) {
            console.warn(
              `overflow: ${url} is ${size.scrollWidth}px wide in a ${size.clientWidth}px viewport`,
            );
          }
        }

        let clip;
        if (args.fullPage) {
          const metrics = await cdp.send('Page.getLayoutMetrics');
          const size = metrics.cssContentSize || metrics.contentSize;
          clip = { x: 0, y: 0, width: size.width, height: size.height, scale: 1 };
          await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: Math.ceil(size.width),
            height: Math.ceil(size.height),
            deviceScaleFactor: viewport.deviceScaleFactor,
            mobile: viewport.mobile,
          });
        }
        const shot = await cdp.send('Page.captureScreenshot', {
          format: 'png',
          captureBeyondViewport: Boolean(args.fullPage),
          ...(clip ? { clip } : {}),
        });
        const file = join(args.out, `${slugFor(item.path, item.name)}-${viewportName}.png`);
        writeFileSync(file, Buffer.from(shot.data, 'base64'));
        console.log(file);
        if (args.fullPage) {
          await cdp.send('Emulation.setDeviceMetricsOverride', {
            width: viewport.width,
            height: viewport.height,
            deviceScaleFactor: viewport.deviceScaleFactor,
            mobile: viewport.mobile,
          });
        }
      }
    }
    cdp.close();
  } finally {
    chrome.kill('SIGTERM');
    await new Promise((resolveExit) => {
      if (chrome.exitCode !== null) {
        resolveExit();
        return;
      }
      const timer = setTimeout(resolveExit, 3000);
      chrome.once('exit', () => {
        clearTimeout(timer);
        resolveExit();
      });
    });
    if (!args.keepProfile) rmSync(profile, { recursive: true, force: true });
    else console.log(`Chrome profile kept at ${profile}`);
  }

  if (chromeError) {
    const noise = /CVDisplayLink|gpu_memory_buffer|Fontconfig|dbus|Crashpad|RLZ|ssl_client_socket_impl/i;
    const lines = chromeError.split('\n').filter((line) => /error/i.test(line) && !noise.test(line));
    if (lines.length) console.error(lines.slice(0, 5).join('\n'));
  }
}

main().catch((error) => {
  console.error(`screenshot: ${error.message}`);
  process.exit(1);
});
