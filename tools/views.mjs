// Render the views for the markup page, plus label positions on the top-down map.
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2];
const sub = process.argv[3] || 'views';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=d3d11', '--enable-gpu'] });
const labels = {
  House: [-5, 0], Garage: [-15, -8.2], 'Deck and pit': [-12.8, 4.7], Shop: [-7, -23.1], 'Lean-to': [-19.6, -24],
  Arena: [-12, 38], 'Utility shed': [-34.4, 30.4], 'Horse shed': [-31.7, -31.7], 'West pasture': [-70, 18], 'North pasture': [-60, -30],
  'Front lawn': [9, 2], Road: [27.5, -30], Canal: [33.5, 22], Garden: [-28.8, 9.5], Hoop: [-25.6, -14],
  'Rock wall': [13.2, 6], Sign: [19.4, -10.6], 'Concrete pull-in': [14, -23], Rocks: [14, -33],
  Spruce: [12.4, -4.8], Birches: [3, 11.5], Mailbox: [19.6, 23.4], Sidewalk: [-7.4, -15.5],
  'North neighbor': [7, -51], Gate: [-45, 6.8], Trough: [-49.5, 11.5],
};
const only = (process.argv[4] || '').split(',').filter(Boolean);
const allViews = [
  ['top', 1600, 1100], ['front', 1600, 1000], ['island', 1600, 1000], ['sign', 1600, 1000], ['house', 1600, 1000],
  ['garage', 1600, 1000], ['hoop', 1600, 1000], ['back', 1600, 1000], ['deck', 1600, 1000], ['garden', 1600, 1000],
  ['shop', 1600, 1000], ['horseshed', 1600, 1000], ['utility', 1600, 1000], ['arena', 1600, 1000], ['pasture', 1600, 1000],
  ['canal', 1600, 1000], ['east', 1600, 1000],
];
const views = only.length ? allViews.filter(([v]) => only.includes(v)) : allViews;
const meta = {};
for (const [v, w, h] of views) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  await page.goto(`http://127.0.0.1:5236/?view=${v}`);
  await page.waitForFunction(() => window.__hp && window.__hp.ready, null, { timeout: 120000 });
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${out}/${sub}/${v}.jpg`, type: 'jpeg', quality: 82 });
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
if (meta.labels) fs.writeFileSync(`${out}/${sub}/labels.json`, JSON.stringify(meta.labels, null, 1));
await browser.close();
