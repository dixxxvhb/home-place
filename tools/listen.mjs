// Measure what the soundscape actually puts out, standing still and walking.
import { chromium } from 'playwright';
const base = process.argv[2] || 'http://127.0.0.1:5236/';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base);
await page.waitForFunction(() => window.__hp && window.__hp.ready, null, { timeout: 120000 });
await page.click('#enter');
await page.waitForTimeout(3000);
const sample = async (label, ms) => {
  const r = await page.evaluate((ms) => new Promise((res) => {
    const out = [];
    const id = setInterval(() => out.push(window.__hp.sound.level()), 50);
    setTimeout(() => { clearInterval(id); res(out); }, ms);
  }), ms);
  const rms = r.map((x) => x.rms), pk = r.map((x) => x.peak);
  const avg = 10 * Math.log10(rms.reduce((s, v) => s + 10 ** (v / 10), 0) / rms.length);
  console.log(`${label}: avg ${avg.toFixed(1)} dBFS, loudest block ${Math.max(...rms).toFixed(1)}, peak ${Math.max(...pk).toFixed(1)} dBFS`);
};
await sample('standing on the front lawn by the sprinkler', 6000);
await page.keyboard.down('KeyW');
await sample('walking the lawn', 3000);
await page.keyboard.up('KeyW');
await page.evaluate(() => { const p = window.__hp.player; p.pos.x = 6; p.pos.z = 0; p.yaw = 0; });
await page.keyboard.down('KeyW');
await sample('walking the asphalt drive', 2500);
await page.keyboard.up('KeyW');
await page.evaluate(() => { const p = window.__hp.player; p.pos.x = -10; p.pos.z = -22; p.yaw = Math.PI / 2; });
await page.keyboard.down('KeyW');
await sample('walking the shop gravel', 2500);
await page.keyboard.up('KeyW');
await page.evaluate(() => { const p = window.__hp.player; p.pos.x = -57; p.pos.z = 6; });
await sample('standing by the horses', 5000);
const voices = await page.evaluate(() => window.__hp.sound.emitters.length);
console.log('emitters', voices, errors.length ? errors.join('\n') : 'no errors');
await browser.close();
