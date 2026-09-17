const { getDb: getSQLite } = require('./sqlite');

// Screenshots the real Prize Projector card (client/src/components/
// WagerDetailsModal.jsx, `capture` mode) with headless Chromium, so notification
// images always match what users see in the app.
//
// The browser is launched lazily, reused across renders, and closed again after
// an idle period — a 30s poller shouldn't hold ~200MB of Chromium open forever.
//
// Every failure path returns null. Callers fall back to a plain-text
// notification: a rendering problem must never cost us the notification itself.

const IDLE_SHUTDOWN_MS = 5 * 60 * 1000;
const RENDER_TIMEOUT_MS = 20 * 1000;
const ASSET_WAIT_MS = 3 * 1000;   // cap on waiting for third-party fonts/crests
const DEVICE_SCALE = 2;

let browserPromise = null;
let idleTimer      = null;

function isEnabled() {
  try {
    const row = getSQLite()
      .prepare("SELECT value FROM admin_settings WHERE key = 'bet_card_image_enabled'")
      .get();
    return row ? row.value !== '0' : true; // default on
  } catch {
    return true;
  }
}

function baseUrl() {
  const port = process.env.PORT || 3001;
  return process.env.WAGER_CARD_BASE_URL || `http://127.0.0.1:${port}`;
}

async function getBrowser() {
  if (!browserPromise) {
    const { chromium } = require('playwright');
    // CHROMIUM_EXECUTABLE_PATH lets the host point at an already-installed
    // Chromium instead of Playwright's own download.
    const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH || undefined;
    browserPromise = chromium.launch({
      ...(executablePath ? { executablePath } : {}),
      // --no-sandbox is required when running as root (the usual VPS/Docker case).
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    }).catch((err) => {
      browserPromise = null;           // let the next call retry a fresh launch
      throw err;
    });
  }
  return browserPromise;
}

function touchIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { closeBrowser().catch(() => {}); }, IDLE_SHUTDOWN_MS);
  if (idleTimer.unref) idleTimer.unref();   // never hold the process open
}

async function closeBrowser() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  const p = browserPromise;
  browserPromise = null;
  if (!p) return;
  try {
    const browser = await p;
    await browser.close();
  } catch {
    // already gone
  }
}

function encodeContest(contest) {
  return Buffer.from(JSON.stringify(contest), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');   // base64url
}

/**
 * Render the wager card to a PNG.
 * @returns {Promise<{buffer: Buffer, mimetype: string, filename: string}|null>}
 */
async function renderWagerCard(contest, mode = 'maximum') {
  if (!contest) return null;
  if (!isEnabled()) return null;

  let context;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({ deviceScaleFactor: DEVICE_SCALE });
    const page = await context.newPage();
    page.setDefaultTimeout(RENDER_TIMEOUT_MS);

    // Bound every third-party asset (Google Fonts stylesheet, team crests).
    // A render-blocking stylesheet from an unreachable CDN otherwise stalls
    // painting until the socket gives up — ~13s per render. Same-origin
    // requests (our own SPA bundle) pass through untouched.
    const origin = new URL(baseUrl()).origin;
    await page.route('**', async (route, request) => {
      if (request.url().startsWith(origin)) return route.continue();
      try {
        const response = await route.fetch({ timeout: ASSET_WAIT_MS });
        await route.fulfill({ response });
      } catch {
        await route.abort().catch(() => {});   // degrade: fallback font / initial-circle crest
      }
    });

    const url = `${baseUrl()}/wager-card?mode=${encodeURIComponent(mode)}&d=${encodeContest(contest)}`;
    // 'commit' rather than 'load'/'domcontentloaded': the app's <link> to Google
    // Fonts blocks DOMContentLoaded, so an unreachable font CDN would otherwise
    // add ~10s to every render. Readiness is established by the panel selector
    // and the bounded asset wait below instead.
    await page.goto(url, { waitUntil: 'commit', timeout: RENDER_TIMEOUT_MS });

    const panel = page.locator('#wager-panel');
    await panel.waitFor({ state: 'visible', timeout: RENDER_TIMEOUT_MS });

    // Wait for webfonts (DM Sans) and the team crests, but never block on them:
    // both come from third-party CDNs, and a slow or unreachable one must not
    // stall the poller. The card degrades gracefully — fallback font, and the
    // modal's own initial-circle fallback for crests.
    await page.evaluate(async (assetMs) => {
      const settled = (p) => Promise.race([p, new Promise((r) => setTimeout(r, assetMs))]);
      await settled(document.fonts.ready);
      const imgs = [...document.querySelectorAll('#wager-panel img')].filter((i) => !i.complete);
      await settled(Promise.all(imgs.map((i) => new Promise((r) => {
        i.addEventListener('load', r, { once: true });
        i.addEventListener('error', r, { once: true });
      }))));
    }, ASSET_WAIT_MS).catch(() => {});

    const buffer = await panel.screenshot({ type: 'png' });

    touchIdleTimer();
    return { buffer, mimetype: 'image/png', filename: 'wager-card.png' };
  } catch (err) {
    console.error('[wagerCard] render failed:', err.message);
    return null;
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

module.exports = { renderWagerCard, closeBrowser, isEnabled };
