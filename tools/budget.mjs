import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu'] });
for (const q of ['high', 'low']) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  await page.goto(`http://127.0.0.1:5236/?view=house&q=${q}`);
  await page.waitForFunction(() => window.__hp && window.__hp.ready, null, { timeout: 120000 });
  await page.waitForTimeout(1000);
  const r = await page.evaluate(() => {
    const R = window.__hp.renderer;
    R.info.autoReset = false; R.info.reset();
    window.__hp.render();
    const out = { calls: R.info.render.calls, tris: R.info.render.triangles, points: R.info.render.points, lines: R.info.render.lines, geometries: R.info.memory.geometries, textures: R.info.memory.textures };
    R.info.autoReset = true;
    return out;
  });
  console.log(q, JSON.stringify(r));
}
await browser.close();
