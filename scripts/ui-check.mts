// Headless UI check on the web build: drives real screens against the live backend and saves screenshots.
// Run: node scripts/ui-check.mts [flow]   flows: seller | buyer | explore | all (default)
// Requires Google Chrome. Screenshots → store/screenshots/web-*.png (phone viewport).
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import puppeteer, { type Page } from 'puppeteer-core';
import handler from 'serve-handler';

import { root } from './env.mts';

const dist = join(root, 'dist-web');
const shots = join(root, 'store/screenshots');
mkdirSync(shots, { recursive: true });
const flow = process.argv[2] ?? 'all';

if (!process.env.SKIP_EXPORT) execSync(`npx expo export -p web --output-dir ${dist}`, { cwd: root, stdio: 'ignore' });
const server = http.createServer((req, res) => handler(req, res, { public: dist, rewrites: [{ source: '**', destination: '/index.html' }] }));
await new Promise<void>((r) => server.listen(8089, r));

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 412, height: 892, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.request().method()} ${r.url().split('?')[0]}`));

const base = 'http://localhost:8089';
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
    await say(page, 'I want to sell my 20 year general physician practice with over 2000 patients and monthly billing of Rs 2 lacs');
    await waitText(page, 'needed');
    await shot('03-seller-followup');
    await say(page, 'It is in Sushant Lok');
    await waitText(page, 'Publish listing');
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

  if (flow === 'explore' || flow === 'all') {
    await page.goto(`${base}/explore`, { waitUntil: 'networkidle0' });
    await wait(4000);
    await shot('07-explore');
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
  server.close();
}
