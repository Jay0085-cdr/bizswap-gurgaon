// Generates every graphic asset from code (no design tools): app icon, adaptive icon layers, splash,
// favicon, Play Store feature graphic, Play-compliant framed screenshots, and the privacy-policy HTML.
// Run: npm run assets   (needs Google Chrome; run `node scripts/ui-check.mts all` first for raw screenshots)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

import { PRIVACY } from '../src/constants/privacy.ts';
import { root } from './env.mts';

const out = (...p: string[]) => join(root, ...p);
mkdirSync(out('store/screenshots/play'), { recursive: true });
mkdirSync(out('docs/privacy'), { recursive: true });

const INDIGO = '#4F46E5';
const VIOLET = '#7C3AED';
const TYPE_COLORS = ['#8B5CF6', '#F97316', '#0EA5E9', '#10B981', '#EAB308'];

// Brand mark: two swap arrows over a map pin — "swap a business, locally".
const mark = (stroke = '#fff') => `
<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="${stroke}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
  <path d="M24 38 H72 M60 26 L72 38 L60 50"/>
  <path d="M76 62 H28 M40 50 L28 62 L40 74"/>
</svg>`;

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const page = await browser.newPage();

async function render(html: string, w: number, h: number, file: string, transparent = false) {
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><html><head><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;${transparent ? 'background:transparent' : ''}}</style></head><body>${html}</body></html>`,
    { waitUntil: 'load' },
  );
  await page.screenshot({ path: file as `${string}.png`, omitBackground: transparent });
  console.log('  ✔', file.replace(root + '/', ''));
}

const bg = `background:linear-gradient(135deg, ${INDIGO} 0%, ${VIOLET} 100%)`;

// App icon (full-bleed square; Android/Play applies its own mask)
const icon = (size: number) =>
  `<div style="width:${size}px;height:${size}px;${bg};display:flex;align-items:center;justify-content:center">
     <div style="width:${size * 0.62}px;height:${size * 0.62}px">${mark()}</div></div>`;
await render(icon(1024), 1024, 1024, out('assets/images/icon.png'));
await render(icon(512), 512, 512, out('store/icon-512.png'));
await render(icon(48), 48, 48, out('assets/images/favicon.png'));

// Adaptive icon: foreground glyph inside the 66% safe zone, plain background, monochrome
await render(`<div style="width:1024px;height:1024px;display:flex;align-items:center;justify-content:center"><div style="width:440px;height:440px">${mark()}</div></div>`, 1024, 1024, out('assets/images/android-icon-foreground.png'), true);
await render(`<div style="width:1024px;height:1024px;${bg}"></div>`, 1024, 1024, out('assets/images/android-icon-background.png'));
await render(`<div style="width:1024px;height:1024px;display:flex;align-items:center;justify-content:center"><div style="width:440px;height:440px">${mark('#000')}</div></div>`, 1024, 1024, out('assets/images/android-icon-monochrome.png'), true);
await render(`<div style="width:400px;height:400px;display:flex;align-items:center;justify-content:center"><div style="width:300px;height:300px">${mark()}</div></div>`, 400, 400, out('assets/images/splash-icon.png'), true);

// Feature graphic 1024x500
const dots = Array.from({ length: 26 }, (_, i) => {
  const x = 560 + ((i * 97) % 420);
  const y = 60 + ((i * 53) % 380);
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:22px;height:22px;border-radius:50%;background:${TYPE_COLORS[i % 5]};border:4px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.25)"></div>`;
}).join('');
await render(
  `<div style="position:relative;width:1024px;height:500px;${bg};color:#fff;overflow:hidden">
     <div style="position:absolute;inset:0;opacity:.12;background-image:linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px);background-size:48px 48px"></div>
     ${dots}
     <div style="position:absolute;left:64px;top:110px;width:520px">
       <div style="width:84px;height:84px;border-radius:22px;background:rgba(255,255,255,.18);display:flex;align-items:center;justify-content:center;margin-bottom:28px"><div style="width:58px;height:58px">${mark()}</div></div>
       <div style="font-size:58px;font-weight:800;letter-spacing:-1px;line-height:1.05">BizSwap Gurgaon</div>
       <div style="font-size:26px;margin-top:18px;opacity:.92;line-height:1.35">Sell or buy a running business<br/>just by talking — AI does the rest.</div>
     </div>
   </div>`,
  1024,
  500,
  out('store/feature-graphic-1024x500.png'),
);

// Play screenshots: 1080x1920 (9:16), caption + raw web screenshot. Play rejects >2:1 aspect, so raw phone captures are framed.
const captions: Record<string, [string, string]> = {
  'web-01-welcome.png': ['Sell or buy a business', 'No sign-up. No forms.'],
  'web-03-seller-followup.png': ['Just say it', 'AI extracts details and asks only what’s missing'],
  'web-05-seller-published.png': ['Listed in seconds', 'Anonymised listing + AI valuation'],
  'web-06-buyer-matches.png': ['Matches, ranked by AI', 'Fit score with reasons'],
  'web-08-explore-sheet.png': ['Every business on the map', 'Pubs, restaurants, clinics, CA & CS practices'],
  'web-10-listing-detail.png': ['All the key numbers', 'Footfall, billing, lease, clients — in ₹ lakh/crore'],
  'web-11-dashboard-seller.png': ['Track every deal', 'Listed → Matched → Contacted → Closed'],
  'web-13-inbox.png': ['Never miss a match', 'Watch agent alerts you to new fits'],
};
const raw = out('store/screenshots');
let n = 0;
for (const f of readdirSync(raw).filter((x) => captions[x]).sort()) {
  const [title, sub] = captions[f];
  const b64 = readFileSync(join(raw, f)).toString('base64');
  n++;
  await render(
    `<div style="width:1080px;height:1920px;${bg};color:#fff;display:flex;flex-direction:column;align-items:center;padding-top:90px">
       <div style="font-size:64px;font-weight:800;letter-spacing:-1px">${title}</div>
       <div style="font-size:34px;opacity:.9;margin-top:14px">${sub}</div>
       <div style="margin-top:70px;width:700px;height:1515px;border-radius:56px;border:14px solid #0B0F17;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.35);background:#0B0F17">
         <img src="data:image/png;base64,${b64}" style="width:100%;display:block"/>
       </div>
     </div>`,
    1080,
    1920,
    out(`store/screenshots/play/${String(n).padStart(2, '0')}-${f.replace('web-', '').replace(/^\d+-/, '')}`),
  );
}
if (!n) console.log('  ! no raw screenshots found — run `node scripts/ui-check.mts all` first');

await browser.close();

// Privacy policy HTML (same text as the in-app screen)
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${PRIVACY.app} — Privacy Policy</title>
<style>
  :root{--bg:#fff;--fg:#0F172A;--muted:#5B6474;--accent:${INDIGO}}
  @media (prefers-color-scheme:dark){:root{--bg:#0B0F17;--fg:#F1F5F9;--muted:#9AA4B5;--accent:#818CF8}}
  body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 -apple-system,'Segoe UI',Roboto,sans-serif}
  main{max-width:720px;margin:0 auto;padding:40px 16px 80px}
  h1{font-size:28px;line-height:1.2;margin:0 0 4px} h2{font-size:19px;margin:32px 0 8px}
  p{margin:0 0 12px;color:var(--muted)} a{color:var(--accent)} .eff{color:var(--muted);font-size:14px}
</style></head><body><main>
<h1>${PRIVACY.app} — Privacy Policy</h1>
<p class="eff">Effective ${PRIVACY.effective}</p>
${PRIVACY.sections.map((s) => `<h2>${esc(s.h)}</h2>\n${s.p.map((p) => `<p>${esc(p)}</p>`).join('\n')}`).join('\n')}
<h2>Contact</h2><p><a href="mailto:${PRIVACY.contact}">${PRIVACY.contact}</a></p>
</main></body></html>
`;
writeFileSync(out('docs/privacy/index.html'), html);
writeFileSync(out('store/privacy-policy.html'), html);
if (!existsSync(out('docs/index.html'))) writeFileSync(out('docs/index.html'), '<meta http-equiv="refresh" content="0; url=privacy/">');
console.log('  ✔ docs/privacy/index.html, store/privacy-policy.html');
