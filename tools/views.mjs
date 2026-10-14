// Render the views for the markup page, plus label positions on the top-down map.
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2];
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu'] });
const labels = {
  House: [-5, 0], Garage: [-15, -8.2], Patio: [-12.7, 5], Shop: [-7, -23.1], 'Lean-to': [-19.6, -24],
  Arena: [-14, 36], 'Horse shed': [-34.4, 30.4], 'West pasture': [-70, 18], 'North pasture': [-58, -30],
  'Front lawn': [12, 2], Drive: [5.6, -6], Road: [27.5, -30], 'Field across the road': [55, 20],
  'Wheel line': [78, -35], Spruce: [12.4, -4.8], Birches: [3, 11.5], Mailbox: [19.6, 23.4],
  'North neighbor': [7, -58], 'South neighbor': [-34, 67], 'Big ash': [10.6, -18.6], Maple: [-3, 18.8],
  Gate: [-45, 6.8], Trough: [-49.5, 11.5],
};
const views = [
  ['top', 1600, 1100], ['front', 1600, 1000], ['house', 1600, 1000], ['garage', 1600, 1000], ['back', 1600, 1000],
  ['shop', 1600, 1000], ['arena', 1600, 1000], ['pasture', 1600, 1000], ['east', 1600, 1000],
];
const meta = {};
for (const [v, w, h] of views) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  await page.goto(`http://127.0.0.1:5236/?view=${v}`);
  await page.waitForFunction(() => window.__hp && window.__hp.ready, null, { timeout: 120000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/views/${v}.jpg`, type: 'jpeg', quality: 84 });
  if (v === 'top') {
    meta.labels = await page.evaluate((labels) => {
      const { THREE, camera, world } = window.__hp;
      const res = {};
      for (const [k, [x, z]] of Object.entries(labels)) {
        const p = new THREE.Vector3(x, world.T.heightAt(x, z), z).project(camera);
        res[k] = [+((p.x + 1) / 2).toFixed(4), +((1 - p.y) / 2).toFixed(4)];
      }
      return res;
    }, labels);
  }
  console.log('rendered', v);
  await page.close();
}
fs.writeFileSync(`${out}/views/labels.json`, JSON.stringify(meta.labels, null, 1));
await browser.close();
