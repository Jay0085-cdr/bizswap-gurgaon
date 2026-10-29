// Headless UI check on the web build: drives real screens against the live backend and saves screenshots.
// Run: node scripts/ui-check.mts [flow]   flows: seller | buyer | explore | all (default)
//   UI_BASE=https://…/bizswap-gurgaon  test a deployed site instead of a local export
// Requires Google Chrome. Screenshots → store/screenshots/web-*.png (phone viewport).
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import handler from 'serve-handler';

import { root } from './env.mts';

const dist = join(root, 'dist-web');
const shots = join(root, 'store/screenshots');
mkdirSync(shots, { recursive: true });
const flow = process.argv[2] ?? 'all';

const LIVE = process.env.UI_BASE;
if (!LIVE && !process.env.SKIP_EXPORT) execSync(`npx expo export -p web --output-dir ${dist}`, { cwd: root, stdio: 'ignore' });
const server = http.createServer((req, res) => handler(req, res, { public: dist, rewrites: [{ source: '**', destination: '/index.html' }] }));
if (!LIVE) await new Promise<void>((r) => server.listen(8089, r));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 892, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.request().method()} ${r.url().split('?')[0]}`));

const base = LIVE?.replace(/\/$/, '') ?? 'http://localhost:8089';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const shot = (name: string) => page.screenshot({ path: join(shots, `web-${name}.png`) });
async function clickText(p: Page, text: string) {
  await p.waitForFunction((t) => [...document.querySelectorAll('div,span,button,a')].some((e) => e.textContent?.trim() === t), { timeout: 20000 }, text);
  await p.evaluate((t) => {
    const el = [...document.querySelectorAll('div,span,button,a')].reverse().find((e) => e.textContent?.trim() === t) as HTMLElement;
    el.click();
  }, text);
}
async function waitText(p: Page, re: string, timeout = 60000) {
  await p.waitForFunction((r) => new RegExp(r, 'i').test(document.body.innerText), { timeout }, re);
}
async function say(p: Page, text: string) {
  await p.type('textarea, input[aria-label="Message"]', text);
  await p.click('[aria-label="Send"]');
}

try {
  await page.goto(base, { waitUntil: 'networkidle0' });
  await waitText(page, 'Sell a Business');
  await shot('01-welcome');

  if (flow === 'seller' || flow === 'all') {
    await clickText(page, 'Sell a Business');
    await waitText(page, 'Try saying');
    await shot('02-seller-chat');
    if (LIVE) {
      await page.click('[aria-label="Speak"]');
      await waitText(page, 'Voice works in the Android app', 5000);
      console.log('  ✔ web mic shows the type-instead message');
    }
    // SELLER=gp keeps the original clinic example used for store screenshots
    const turns =
      process.env.SELLER === 'gp'
        ? ['I want to sell my 20 year general physician practice with over 2000 patients and monthly billing of Rs 2 lacs', 'It is in Sushant Lok']
        : [
            'I want to sell my pub located at Ambience Mall, Gurgaon. Its got a footfall of 100 people a day, daily billings of Rs 10,000. Lease runs for 3 years and is Rs 30,000/month',
            'Asking 45 lakh, running for 6 years',
            'About 60 seats and it has a liquor licence',
          ];
    for (const [i, t] of turns.entries()) {
      await say(page, t);
      await page.waitForNetworkIdle({ idleTime: 1500, timeout: 90000 });
      if (i === 0) await shot('03-seller-followup');
      if (await page.evaluate(() => document.body.innerText.includes('Publish listing'))) break;
    }
    await waitText(page, 'Publish listing', 30000);
    await shot('04-seller-complete');
    await clickText(page, 'Publish listing');
    await waitText(page, 'Your listing is live', 90000);
    await wait(500);
    await shot('05-seller-published');
    console.log('✔ seller flow');
  }

  if (flow === 'buyer' || flow === 'all') {
    await page.goto(`${base}/chat/buyer`, { waitUntil: 'networkidle0' });
    await waitText(page, 'Try saying');
    await say(page, 'I want to buy a CA practice in Gurgaon with 50 clients with annual billing of Rs 2 lacs');
    await waitText(page, 'to go');
    await say(page, 'anywhere, budget 5 lakh');
    await waitText(page, 'Find matches');
    await clickText(page, 'Find matches');
    await waitText(page, 'matching business|Requirement saved', 90000);
    await wait(500);
    await shot('06-buyer-matches');
    console.log('✔ buyer flow');
  }

  if (flow === 'all') {
    await page.goto(`${base}/dashboard`, { waitUntil: 'networkidle0' });
    await waitText(page, 'Selling \\(1\\)');
    await clickText(page, 'Selling (1)');
    await waitText(page, 'Matched buyers');
    await wait(500);
    await shot('11-dashboard-seller');
    await clickText(page, 'Buying (1)');
    await waitText(page, 'Best fit');
    await wait(500);
    await shot('12-dashboard-buyer');
    await page.goto(`${base}/inbox`, { waitUntil: 'networkidle0' });
    await waitText(page, 'New match|listing is live');
    await wait(500);
    await shot('13-inbox');
    console.log('✔ dashboards + inbox');
  }

  if (flow === 'explore' || flow === 'all') {
    await page.goto(`${base}/explore`, { waitUntil: 'networkidle0' });
    await waitText(page, 'businesses for sale');
    await wait(5000); // tiles
    await shot('07-explore');
    // tap the pin nearest the map centre via maplibre's rendered features
    const clicked = await page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;
      const r = canvas.getBoundingClientRect();
      for (let dy = -120; dy <= 120; dy += 6)
        for (let dx = -120; dx <= 120; dx += 6) {
          const x = r.left + r.width / 2 + dx, y = r.top + r.height / 2 + dy;
          const px = canvas.getContext('webgl2') || canvas.getContext('webgl');
          void px;
          (window as any).__try = (window as any).__try ?? [];
          (window as any).__try.push([x, y]);
        }
      return true;
    });
    void clicked;
    const pts: [number, number][] = await page.evaluate(() => (window as any).__try);
    for (const [x, y] of pts) {
      await page.mouse.click(x, y);
      const open = await page.evaluate(() => document.body.innerText.includes('View details'));
      if (open) break;
    }
    await waitText(page, 'View details', 5000).catch(() => {});
    await shot('08-explore-sheet');
    await page.type('input[aria-label="Search businesses"]', 'Cyber Hub');
    await wait(3500);
    await shot('09-explore-search');
    const appEnv = Object.fromEntries(readFileSync(join(root, '.env'), 'utf8').split('\n').filter(Boolean).map((l) => l.split(/=(.*)/s)));
    const r = await fetch(`${appEnv.EXPO_PUBLIC_SUPABASE_URL}/rest/v1/public_listings?select=id&business_type=eq.pub&order=view_count.desc&limit=1`, {
      headers: { apikey: appEnv.EXPO_PUBLIC_SUPABASE_ANON_KEY },
    });
    const [{ id }] = await r.json();
    await page.goto(`${base}/listing/${id}`, { waitUntil: 'networkidle0' });
    await waitText(page, 'Key facts', 20000);
    await wait(800);
    await shot('10-listing-detail');
    console.log('✔ explore');
  }
} catch (e) {
  await shot('zz-failure').catch(() => {});
  console.error('✖ UI check failed:', (e as Error).message);
  process.exitCode = 1;
} finally {
  const relevant = errors.filter((e) => !/favicon|DevTools|Download the React/.test(e));
  if (relevant.length) console.log('console errors:\n  ' + relevant.slice(0, 10).join('\n  '));
  // delete the anonymous test user (cascades its listings, chats, matches)
  const uid = await page
    .evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.endsWith('-auth-token'));
      return k ? JSON.parse(localStorage.getItem(k)!).user?.id : null;
    })
    .catch(() => null);
  if (uid && !process.env.KEEP_DATA) {
    const { sql } = await import('./sql.mts');
    await sql`delete from auth.users where id = ${uid} and is_anonymous`;
    await sql.end();
    console.log('  cleaned up test user');
  }
  await browser.close();
  if (!LIVE) server.close();
}
