#!/usr/bin/env node
/**
 * Diagnoses why the Prize Projector card image isn't being attached to new
 * multiplayer bet notifications. Checks every layer independently and prints a
 * PASS/FAIL per layer plus a verdict.
 *
 * Run on the host that runs the admin server, with the server running:
 *   node scripts/diagnose-wager-card.js
 */
const path = require('path');
const fs   = require('fs');

const ROOT = path.join(__dirname, '..');
const results = [];
const pass = (name, detail) => { results.push({ ok: true,  name, detail }); console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`); };
const fail = (name, detail, fix) => { results.push({ ok: false, name, detail, fix }); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); };

(async () => {
  console.log('\nWager card diagnostics\n' + '='.repeat(60));

  // 1. playwright package -----------------------------------------------------
  let chromium = null;
  try {
    ({ chromium } = require(path.join(ROOT, 'node_modules', 'playwright')));
    const v = require(path.join(ROOT, 'node_modules', 'playwright', 'package.json')).version;
    pass('playwright installed', `v${v}`);
  } catch (err) {
    fail('playwright installed', err.message, 'npm install');
  }

  // 2. chromium binary --------------------------------------------------------
  if (chromium) {
    let browser;
    try {
      const executablePath = process.env.CHROMIUM_EXECUTABLE_PATH || undefined;
      browser = await chromium.launch({
        ...(executablePath ? { executablePath } : {}),
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
      pass('chromium launches', executablePath || 'playwright-managed build');
      await browser.close();
    } catch (err) {
      fail('chromium launches', String(err.message).split('\n')[0],
           'npx playwright install --with-deps chromium');
    }
  }

  // 3. built client contains the render route ---------------------------------
  const distDir = path.join(ROOT, 'client', 'dist', 'assets');
  try {
    const files = fs.readdirSync(distDir).filter((f) => f.endsWith('.js'));
    const hit = files.find((f) => fs.readFileSync(path.join(distDir, f), 'utf8').includes('wager-panel'));
    if (hit) pass('client build has /wager-card', hit);
    else fail('client build has /wager-card', 'no bundle mentions wager-panel',
              'cd client && npm run build   (the dist on disk predates this feature)');
  } catch (err) {
    fail('client build has /wager-card', err.message, 'cd client && npm run build');
  }

  // 4. feature toggle ---------------------------------------------------------
  let enabled = null;
  try {
    const { getDb } = require(path.join(ROOT, 'server', 'sqlite'));
    const row = getDb().prepare("SELECT value FROM admin_settings WHERE key = 'bet_card_image_enabled'").get();
    enabled = row ? row.value !== '0' : true;
    if (enabled) pass('feature enabled', row ? `bet_card_image_enabled='${row.value}'` : 'key absent (defaults on)');
    else fail('feature enabled', "bet_card_image_enabled='0'",
              'Notification Center -> Settings -> Alert Settings -> turn the toggle on');
  } catch (err) {
    fail('feature enabled', err.message);
  }

  // 5. server reachable at the URL the renderer uses --------------------------
  const port = process.env.PORT || 3001;
  const base = process.env.WAGER_CARD_BASE_URL || `http://127.0.0.1:${port}`;
  try {
    const res = await fetch(`${base}/wager-card`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) pass('server reachable', `${base} -> HTTP ${res.status}`);
    else fail('server reachable', `${base} -> HTTP ${res.status}`, 'is the admin server running on this port?');
  } catch (err) {
    fail('server reachable', `${base} -> ${err.message}`,
         'start the server, or set WAGER_CARD_BASE_URL / PORT to match it');
  }

  // 6. end-to-end render ------------------------------------------------------
  try {
    const { renderWagerCard, closeBrowser } = require(path.join(ROOT, 'server', 'wagerCard'));
    const contest = {
      id: 'diag', bookingCode: 'DIAG-1', amount: 35, capacity: 10, participantCount: 4,
      betType: 'WINNER', betMode: 'MULTI',
      match: { homeTeam: 'Home', awayTeam: 'Away', homeLogo: null, awayLogo: null, date: null },
      firstGame: null, lastGame: null,
    };
    const t = Date.now();
    const card = await renderWagerCard(contest, 'maximum');
    if (card) {
      const out = path.join(ROOT, 'wager-card-diagnostic.png');
      fs.writeFileSync(out, card.buffer);
      pass('end-to-end render', `${Date.now() - t}ms, ${card.buffer.length} bytes -> ${out}`);
    } else {
      fail('end-to-end render', 'renderWagerCard returned null (see [wagerCard] errors above)');
    }
    await closeBrowser();
  } catch (err) {
    fail('end-to-end render', err.message);
  }

  // Verdict -------------------------------------------------------------------
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + '='.repeat(60));
  if (!failed.length) {
    console.log('All layers OK — rendering works on this host.');
    console.log('If alerts still arrive without an image, check the bet itself:');
    console.log('  a card is attached only to multiplayer bets (capacity >= 3,');
    console.log('  or betMode other than SINGLE) with a stake above 0, and only');
    console.log('  at creation — not to milestone or settlement alerts.');
  } else {
    console.log(`${failed.length} check(s) failed. Fix in this order:\n`);
    failed.forEach((f, i) => console.log(`  ${i + 1}. ${f.name}${f.fix ? `\n     -> ${f.fix}` : ''}`));
  }
  console.log('');
  process.exit(failed.length ? 1 : 0);
})();
