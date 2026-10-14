import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng } from './geo.js';
import { patternMaterial } from './materials.js';

// The rest of the valley, seen from a distance: farmsteads with their windbreaks,
// rows of Lombardy poplars along the section lines, willows down along the river.
// Cheap crossed-card trees; they only ever stand hundreds of meters off.
function cardAtlas() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  const R = rng(4);
  const blob = (ox, w, h, cols, n, narrow) => {
    for (let i = 0; i < n; i++) {
      const t = R();
      const y = 8 + t * (h - 12);
      const half = narrow ? (w * 0.22) * Math.sin(Math.PI * (0.15 + t * 0.85)) + 3 : (w * 0.46) * Math.sqrt(Math.sin(Math.PI * t)) + 2;
      const x = ox + w / 2 + (R() * 2 - 1) * half;
      const col = cols[(R() * cols.length) | 0];
      g.fillStyle = `rgb(${col.join(',')})`;
      g.beginPath();
      g.arc(x, y, 1.6 + R() * 2.6, 0, Math.PI * 2);
      g.fill();
    }
  };
  // a round broadleaf, a poplar column, a willow
  blob(0, 128, 128, [[44, 70, 30], [58, 88, 36], [36, 58, 26], [72, 100, 44]], 1600, false);
  blob(128, 64, 128, [[50, 76, 34], [62, 92, 40], [40, 62, 28]], 900, true);
  blob(192, 64, 128, [[92, 108, 66], [104, 120, 76], [80, 96, 60]], 900, false);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildValley(T) {
  const R = rng(321);
  // anything inside the near pass's 3 km ground square has to be drawn in the near pass
  const inNear = (x, z) => Math.max(Math.abs(x - 18.5), Math.abs(z - 15.7)) < 1470;
  const buckets = [{ pos: [], uv: [], nrm: [], idx: [], parts: [] }, { pos: [], uv: [], nrm: [], idx: [], parts: [] }];
  const tree = (x, z, h, w, kind) => {
    const { pos, uv, nrm, idx } = buckets[inNear(x, z) ? 0 : 1];
    const y = T.raw(x, z) - 0.5;
    const u0 = kind === 0 ? 0 : kind === 1 ? 0.5 : 0.75, u1 = kind === 0 ? 0.5 : kind === 1 ? 0.75 : 1;
    for (const a of [0, Math.PI / 2]) {
      const dx = Math.cos(a + x) * w / 2, dz = Math.sin(a + x) * w / 2;
      const b = pos.length / 3;
      pos.push(x - dx, y, z - dz, x + dx, y, z + dz, x + dx, y + h, z + dz, x - dx, y + h, z - dz);
      uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
      for (let k = 0; k < 4; k++) nrm.push(0, 1, 0);
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  };
  const houses = [];
  const valley = (x, z) => T.raw(x, z) < 60;
  // farmsteads scattered over the valley floor
  let made = 0;
  for (let i = 0; i < 2600 && made < 140; i++) {
    const r = 700 + Math.pow(R(), 0.8) * 9000;
    const a = R() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!valley(x, z)) continue;
    made++;
    const n = 4 + ((R() * 9) | 0);
    for (let k = 0; k < n; k++) tree(x + (R() - 0.5) * 60, z + (R() - 0.5) * 60, 9 + R() * 9, 7 + R() * 6, 0);
    // a windbreak of poplars along one side
    if (R() < 0.6) {
      const ang = R() < 0.5 ? 0 : Math.PI / 2;
      const len = 40 + R() * 90;
      for (let d = -len / 2; d < len / 2; d += 4.5) tree(x + Math.cos(ang) * d + Math.sin(ang) * 35, z + Math.sin(ang) * d - Math.cos(ang) * 35, 15 + R() * 6, 3.5, 1);
    }
    houses.push([x + (R() - 0.5) * 20, z + (R() - 0.5) * 20, R()]);
  }
  // poplar rows on a few section lines nearer in
  for (let i = 0; i < 14; i++) {
    const vertical = R() < 0.5;
    const c = Math.round((R() * 2 - 1) * 4) * 402 + 186;
    const from = (R() * 2 - 1) * 2500, len = 150 + R() * 400;
    for (let d = 0; d < len; d += 5) {
      const x = vertical ? c : from + d, z = vertical ? from + d : c;
      if (Math.hypot(x, z) < 420 || !valley(x, z)) continue;
      tree(x, z, 16 + R() * 5, 3.6, 1);
    }
  }
  // willows and cottonwoods along the river bottom to the west
  for (let i = 0; i < 1400; i++) {
    const x = -300 - R() * 1500, z = (R() * 2 - 1) * 1600;
    if (T.raw(x, z) > -18) continue;
    if (R() < 0.5) tree(x, z, 6 + R() * 8, 6 + R() * 6, R() < 0.6 ? 2 : 0);
  }

  const mat = new THREE.MeshLambertMaterial({ map: cardAtlas(), alphaTest: 0.45, side: THREE.DoubleSide });
  const farmMat = patternMaterial({ color: [214, 210, 198], rough: 0.8 });

  // the houses and barns: small pale boxes with roofs
  for (const [x, z, r] of houses) {
    const y = T.raw(x, z);
    const w = 9 + r * 8, d = 7 + r * 4, h = 3 + r;
    const body = new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
    const roof = new THREE.CylinderGeometry(0.01, d * 0.62, w, 4, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 4);
    roof.scale(1, 0.45, 1);
    roof.translate(x, y + h + d * 0.2, z);
    const parts = buckets[inNear(x, z) ? 0 : 1].parts;
    parts.push(body.toNonIndexed(), roof.toNonIndexed());
    if (r > 0.5) {
      const bw = 16 + r * 14;
      parts.push(new THREE.BoxGeometry(bw, 6, 12).translate(x + 30, y + 3, z + 18).toNonIndexed());
    }
  }
  const groups = buckets.map((b) => {
    const group = new THREE.Group();
    if (b.idx.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      g.setIndex(b.idx);
      g.computeBoundingSphere();
      group.add(new THREE.Mesh(g, mat));
    }
    if (b.parts.length) group.add(new THREE.Mesh(mergeGeometries(b.parts), farmMat));
    return group;
  });
  return { near: groups[0], far: groups[1] };
}
