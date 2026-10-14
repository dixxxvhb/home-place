// Screenshot fixed viewpoints in a real Chromium with the GPU.
// npm run shot -- [views=lawn,east] [--phone] [--url=http://127.0.0.1:5236/] [--fps] [--walk]
import { chromium } from 'playwright';
import fs from 'node:fs';

const args = process.argv.slice(2);
const flag = (n) => args.includes('--' + n);
const opt = (n, d) => (args.find((a) => a.startsWith('--' + n + '=')) || '').split('=')[1] || d;
const views = (args.find((a) => !a.startsWith('--')) || 'lawn').split(',');
const base = opt('url', 'http://127.0.0.1:5236/');
const phone = flag('phone');
const extra = opt('q', '');
fs.mkdirSync('shots', { recursive: true });

const browser = await chromium.launch({
  headless: !flag('headed'),
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext(
  phone
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
);
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));

for (const v of views) {
  const url = `${base}?view=${v}${extra ? '&q=' + extra : ''}${flag('intro') ? '&intro' : ''}`;
  await page.goto(url);
  await page.waitForFunction(() => window.__hp && window.__hp.ready, null, { timeout: 120000 });
  await page.waitForTimeout(Number(opt('wait', '1500')));
  if (flag('fps')) {
    const fps = await page.evaluate(() => new Promise((res) => {
      let n = 0; const t0 = performance.now();
      const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); };
      requestAnimationFrame(f);
    }));
    console.log(`${v}: ${fps.toFixed(1)} fps`);
  }
  const file = `shots/${v}${phone ? '-390' : ''}.png`;
  await page.screenshot({ path: file });
  console.log('saved', file);
}
const info = await page.evaluate(() => {
  const gl = window.__hp.renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return { gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown', calls: window.__hp.renderer.info.render.calls, tris: window.__hp.renderer.info.render.triangles };
});
console.log(JSON.stringify(info));
if (logs.length) console.log(logs.slice(0, 20).join('\n'));
await browser.close();
