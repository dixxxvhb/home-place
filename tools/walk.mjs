// Real-browser walk-through: open the page like a visitor, walk in, cross several surfaces,
// record footsteps, audio state, fps and errors, and screenshot along the way.
// node tools/walk.mjs [--phone] [--url=...]
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const phone = args.includes('--phone');
const base = (args.find((a) => a.startsWith('--url=')) || '').split('=')[1] || 'http://127.0.0.1:5236/';
fs.mkdirSync('shots', { recursive: true });
const tag = phone ? '-390' : '';

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext(
  phone
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }
    : { viewport: { width: 1440, height: 900 } },
);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const t0 = Date.now();
await page.goto(base);
await page.waitForFunction(() => window.__hp && window.__hp.ready, null, { timeout: 120000 });
console.log(`ready in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await page.waitForTimeout(2600);
await page.screenshot({ path: `shots/walk-0-intro${tag}.png` });

// log every footstep surface
await page.evaluate(() => {
  window.__steps = [];
  const s = window.__hp.sound;
  const orig = s.step.bind(s);
  s.step = (cls, speed) => { window.__steps.push(cls); orig(cls, speed); };
});

if (phone) await page.tap('#enter');
else await page.click('#enter');
await page.waitForTimeout(2300);
const audio = await page.evaluate(() => ({ state: window.__hp.sound.ctx && window.__hp.sound.ctx.state, mode: window.__hp.mode }));
console.log('after enter:', JSON.stringify(audio));
await page.screenshot({ path: `shots/walk-1-entered${tag}.png` });

const pos = () => page.evaluate(() => { const p = window.__hp.player.pos; return [+p.x.toFixed(2), +p.z.toFixed(2)]; });
const walk = async (ms, yaw, hurry) => {
  await page.evaluate((y) => { if (y !== null) window.__hp.player.yaw = y; }, yaw);
  if (phone) {
    // drive the on-screen stick with a real touch drag
    const cdp = await ctx.newCDPSession(page);
    const pt = (x, y) => [{ x, y, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(90, 700) });
    for (let i = 1; i <= 5; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(90, 700 - i * 8) });
    await page.waitForTimeout(ms);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } else {
    if (hurry) await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(ms);
    await page.keyboard.up('KeyW');
    if (hurry) await page.keyboard.up('ShiftLeft');
  }
  await page.waitForTimeout(250);
};

console.log('start', await pos());
// across the front lawn toward the drive
await walk(3500, Math.PI / 2 + 0.25, false);
console.log('lawn walk ->', await pos());
await page.screenshot({ path: `shots/walk-2-lawn${tag}.png` });
// north along the drive to the shop gravel
await page.evaluate(() => { const p = window.__hp.player; p.pos.x = 6; p.pos.z = 4; });
await walk(4000, 0.15, false);
console.log('drive walk ->', await pos());
await page.screenshot({ path: `shots/walk-3-drive${tag}.png` });
// into the arena sand
await page.evaluate(() => { const p = window.__hp.player; p.pos.x = -12; p.pos.z = 27; });
await walk(3000, Math.PI * 0.6, true);
console.log('arena walk ->', await pos());
// tall grass in the west pasture
await page.evaluate(() => { const p = window.__hp.player; p.pos.x = -60; p.pos.z = 10; });
await walk(3000, Math.PI / 2, false);
console.log('pasture walk ->', await pos());
await page.screenshot({ path: `shots/walk-4-pasture${tag}.png` });
// try to walk through the house: should stop at the wall
await page.evaluate(() => { const p = window.__hp.player; p.pos.x = 8; p.pos.z = 8; });
await walk(5000, Math.PI / 2, true);
const wall = await pos();
console.log('into the house wall ->', wall, wall[0] > 0.2 ? 'blocked (good)' : 'WENT THROUGH');

const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0; const t = performance.now();
  const f = () => { n++; if (performance.now() - t < 3000) requestAnimationFrame(f); else res(n / ((performance.now() - t) / 1000)); };
  requestAnimationFrame(f);
}));
const steps = await page.evaluate(() => window.__steps);
const counts = {};
for (const s of steps) counts[s] = (counts[s] || 0) + 1;
console.log('fps', fps.toFixed(1));
console.log('footsteps by surface class', JSON.stringify(counts));
console.log(errors.length ? errors.slice(0, 15).join('\n') : 'no errors');
await browser.close();
