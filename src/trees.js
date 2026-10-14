import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TREES, GROVE_LINE } from './layout.js';
import { rng, samplePolyline } from './geo.js';
import { patternMaterial } from './materials.js';
import { foliageMaterial, foliageDepthMaterial } from './foliage.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// ---------- leaf atlas, drawn in code ----------
// cells: 0 ash/cottonwood, 1 maple, 2 birch, 3 spruce
function leafAtlas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const R = rng(11);
  const cell = size / 2;
  const leaf = (x, y, len, wid, ang, col) => {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.beginPath();
    g.moveTo(-len / 2, 0);
    g.quadraticCurveTo(0, -wid, len / 2, 0);
    g.quadraticCurveTo(0, wid, -len / 2, 0);
    g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`;
    g.fill();
    g.strokeStyle = `rgba(${col[0] * 0.7 | 0},${col[1] * 0.75 | 0},${col[2] * 0.6 | 0},0.7)`;
    g.lineWidth = Math.max(0.6, wid * 0.12);
    g.beginPath(); g.moveTo(-len / 2, 0); g.lineTo(len / 2, 0); g.stroke();
    g.restore();
  };
  const twig = (x0, y0, x1, y1, w) => {
    g.strokeStyle = 'rgb(78,64,48)';
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + (R() - 0.5) * 20, (y0 + y1) / 2 + (R() - 0.5) * 20, x1, y1); g.stroke();
  };
  const jitter = (p, a) => p.map((v) => Math.max(0, Math.min(255, v + (R() - 0.5) * a)) | 0);
  const broad = (ox, oy, { count, len, wid, palette, spread = 0.36, droop = 0 }) => {
    const cx = ox + cell / 2, cy = oy + cell / 2;
    for (let i = 0; i < 7; i++) {
      const a = R() * Math.PI * 2;
      twig(cx + Math.cos(a) * cell * 0.45, cy + Math.sin(a) * cell * 0.45, cx + (R() - 0.5) * cell * 0.1, cy + (R() - 0.5) * cell * 0.1, cell * 0.012);
    }
    for (let i = 0; i < count; i++) {
      const a = R() * Math.PI * 2;
      const rr = Math.sqrt(R()) * cell * spread;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * (1 - droop * 0.3) + droop * rr * 0.3;
      const L = cell * (len[0] + R() * (len[1] - len[0]));
      const col = jitter(palette[(R() * palette.length) | 0], 26);
      leaf(x, y, L, L * wid, a + (R() - 0.5) * 1.6 + droop * 1.2, col);
    }
  };
  broad(0, 0, { count: 560, len: [0.05, 0.085], wid: 0.34, spread: 0.41, palette: [[54, 86, 30], [70, 104, 38], [88, 118, 44], [44, 70, 26], [100, 128, 50]] });
  broad(cell, 0, { count: 300, len: [0.08, 0.12], wid: 0.55, spread: 0.41, palette: [[48, 80, 30], [62, 96, 36], [78, 108, 40], [40, 64, 24]] });
  broad(0, cell, { count: 300, len: [0.04, 0.06], wid: 0.42, palette: [[98, 128, 46], [114, 140, 54], [82, 112, 40], [126, 150, 62]], spread: 0.4, droop: 1 });
  // spruce spray: a stem from left (trunk side) to right (tip), needles all along it
  {
    const ox = cell, oy = cell, cy = oy + cell / 2;
    const pal = [[50, 76, 64], [64, 90, 76], [40, 60, 50], [78, 102, 86], [58, 84, 74]];
    const stem = (x0, y0, x1, y1, n, nl) => {
      for (let i = 0; i < n; i++) {
        const t = i / n;
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        const L = nl * (0.7 + R() * 0.5) * (1 - t * 0.4);
        for (const s of [-1, 1]) {
          const a = Math.atan2(y1 - y0, x1 - x0) + s * (0.9 + R() * 0.5);
          g.strokeStyle = `rgb(${jitter(pal[(R() * pal.length) | 0], 20).join(',')})`;
          g.lineWidth = cell * 0.008;
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
        }
      }
    };
    stem(ox + cell * 0.02, cy, ox + cell * 0.97, cy + (R() - 0.5) * 6, 260, cell * 0.11);
    for (let k = 0; k < 9; k++) {
      const t = 0.15 + k * 0.09;
      const x0 = ox + cell * t, s = k % 2 ? 1 : -1;
      stem(x0, cy, x0 + cell * 0.22 * (1 - t * 0.5), cy + s * cell * (0.2 + R() * 0.12) * (1 - t * 0.6), 90, cell * 0.075);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

let atlasCache = null;
export function getLeafAtlas(quality) {
  if (!atlasCache) atlasCache = leafAtlas(quality.tier === 'high' ? 1024 : 512);
  return atlasCache;
}

// ---------- builders ----------
class Builder {
  constructor() { this.pos = []; this.nrm = []; this.uv = []; this.wind = []; this.col = []; this.idx = []; this.bark = new Map(); }
  card(p, ax, ay, n, cell, flex, phase, flutter, tint, uvSpan = [0, 0, 1, 1]) {
    const base = this.pos.length / 3;
    const cu = (cell % 2) * 0.5, cv = cell < 2 ? 0 : 0.5;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [i, j] of corners) {
      this.pos.push(p.x + ax.x * i + ay.x * j, p.y + ax.y * i + ay.y * j, p.z + ax.z * i + ay.z * j);
      this.nrm.push(n.x, n.y, n.z);
      const u = i < 0 ? uvSpan[0] : uvSpan[2], v = j < 0 ? uvSpan[1] : uvSpan[3];
      this.uv.push(cu + u * 0.5, 1 - (cv + (1 - v) * 0.5));
      this.wind.push(flex, phase, flutter);
      this.col.push(tint[0], tint[1], tint[2]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  limb(key, a, b, r0, r1, seg = 7) {
    const len = a.distanceTo(b);
    if (len < 0.05) return;
    const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    if (!this.bark.has(key)) this.bark.set(key, []);
    this.bark.get(key).push(g);
  }
}

function randomCardAxes(R, n, size, vertical = 0) {
  const tmp = Math.abs(n.y) > 0.9 ? V(1, 0, 0) : UP;
  let ax = new THREE.Vector3().crossVectors(n, tmp).normalize();
  let ay = new THREE.Vector3().crossVectors(n, ax).normalize();
  const a = R() * Math.PI * 2;
  const c = Math.cos(a), s = Math.sin(a);
  const ax2 = ax.clone().multiplyScalar(c).addScaledVector(ay, s);
  const ay2 = ay.clone().multiplyScalar(c).addScaledVector(ax, -s);
  if (vertical > 0) { ay2.lerp(V(0, -1, 0), vertical).normalize(); ax2.crossVectors(ay2, n).normalize(); }
  return [ax2.multiplyScalar(size / 2), ay2.multiplyScalar(size / 2)];
}

function broadleaf(B, R, t, y0, detail) {
  const { x, z, h, r } = t;
  const cell = t.kind === 'maple' ? 1 : 0;
  const hb = h * (t.kind === 'maple' ? 0.28 : t.kind === 'cotton' ? 0.36 : 0.32);
  const r0 = Math.max(0.12, h * 0.024);
  const lean = V((R() - 0.5) * 0.5, 0, (R() - 0.5) * 0.5);
  const P = (dx, dy, dz) => V(x + dx, y0 + dy, z + dz);
  const trunkTop = P(lean.x, hb, lean.z);
  const barkKey = t.kind === 'maple' ? 'barkGray' : 'bark';
  B.limb(barkKey, P(0, -0.3, 0), trunkTop, r0 * 1.15, r0 * 0.8, 9);
  B.limb(barkKey, trunkTop, P(lean.x * 1.8, h * 0.8, lean.z * 1.8), r0 * 0.8, r0 * 0.18);
  const c = V(x + lean.x * 1.2, y0 + hb + (h - hb) * 0.5, z + lean.z * 1.2);
  const rad = V(r, (h - hb) * 0.55, r);
  const clusters = [];
  const nL = 5 + ((R() * 3) | 0);
  for (let i = 0; i < nL; i++) {
    const az = (i / nL) * Math.PI * 2 + R() * 0.7;
    const el = 0.45 + R() * 0.55;
    const start = trunkTop.clone().lerp(P(lean.x * 1.8, h * 0.75, lean.z * 1.8), R() * 0.4);
    const dir = V(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    const L = r * (0.75 + R() * 0.35);
    const mid = start.clone().addScaledVector(dir, L * 0.5).add(V(0, L * 0.12, 0));
    const end = start.clone().addScaledVector(dir, L).add(V(0, L * 0.25, 0));
    end.y = Math.min(end.y, y0 + h - 0.8);
    B.limb(barkKey, start, mid, r0 * 0.5, r0 * 0.33);
    B.limb(barkKey, mid, end, r0 * 0.33, r0 * 0.1);
    clusters.push(end);
    for (let k = 0; k < 3; k++) {
      const from = mid.clone().lerp(end, R());
      const d2 = dir.clone().add(V((R() - 0.5) * 1.4, R() * 0.8, (R() - 0.5) * 1.4)).normalize();
      const tip = from.clone().addScaledVector(d2, L * (0.3 + R() * 0.25));
      B.limb(barkKey, from, tip, r0 * 0.12, 0.025, 5);
      clusters.push(tip);
    }
  }
  // fill the crown shell so it reads full from any side
  const fill = Math.round(10 + r * 2.2);
  for (let i = 0; i < fill; i++) {
    const u = V(R() * 2 - 1, R() * 1.6 - 0.5, R() * 2 - 1).normalize();
    clusters.push(c.clone().add(u.multiply(rad).multiplyScalar(0.78)));
  }
  const perCluster = Math.max(5, Math.round((r * r * (h - hb)) / clusters.length * 1.05 * detail));
  const size0 = (t.kind === 'cotton' ? 2.9 : 2.3) / Math.sqrt(Math.max(detail, 0.4));
  for (const cc of clusters) {
    for (let k = 0; k < perCluster; k++) {
      const p = cc.clone().add(V((R() - 0.5) * 3.0, (R() - 0.5) * 2.2, (R() - 0.5) * 3.0));
      const sh = p.clone().sub(c).divide(rad);
      const n = sh.clone().normalize().multiplyScalar(0.85).add(p.clone().sub(cc).multiplyScalar(0.25)).add(V(0, 0.2, 0)).normalize();
      const size = size0 * (0.8 + R() * 0.5);
      const [ax, ay] = randomCardAxes(R, V(R() - 0.5, R() - 0.5, R() - 0.5).normalize(), size);
      const flex = Math.min(1, Math.pow(Math.max(0, (p.y - y0) / h), 1.4) * (0.6 + sh.length() * 0.5));
      const v = 0.86 + R() * 0.24;
      B.card(p, ax, ay, n, cell, flex, R() * 6.28, 0.6 + R() * 0.4, [v, v * (0.98 + R() * 0.05), v * 0.95]);
    }
  }
  return { collider: { c: [x, z], r: r0 * 1.2 } };
}

function birch(B, R, t, y0, detail) {
  const { x, z, h, r } = t;
  const stems = t.stems || 2;
  const tops = [];
  for (let s = 0; s < stems; s++) {
    const a = (s / stems) * Math.PI * 2 + R();
    const lean = 0.12 + R() * 0.12;
    const base = V(x + Math.cos(a) * 0.18, y0 - 0.2, z + Math.sin(a) * 0.18);
    const top = V(x + Math.cos(a) * h * lean, y0 + h * (0.88 + R() * 0.1), z + Math.sin(a) * h * lean);
    const mid = base.clone().lerp(top, 0.5).add(V((R() - 0.5) * 0.3, 0, (R() - 0.5) * 0.3));
    B.limb('birch', base, mid, 0.13, 0.1, 9);
    B.limb('birch', mid, top, 0.1, 0.03, 7);
    tops.push([base, mid, top]);
    // thin drooping branches up the stem
    for (let k = 0; k < 9; k++) {
      const tt = 0.35 + (k / 9) * 0.6;
      const from = tt < 0.5 ? base.clone().lerp(mid, tt * 2) : mid.clone().lerp(top, (tt - 0.5) * 2);
      const az = R() * Math.PI * 2;
      const L = r * (0.5 + R() * 0.5) * (1.15 - tt);
      const tip = from.clone().add(V(Math.cos(az) * L, L * 0.35 - 0.6 * L * R(), Math.sin(az) * L));
      B.limb('birch', from, tip, 0.035, 0.01, 4);
    }
  }
  const c = V(x, y0 + h * 0.62, z);
  const rad = V(r, h * 0.36, r);
  const n = Math.round(r * r * h * 0.9 * detail);
  for (let i = 0; i < n; i++) {
    const [base, mid, top] = tops[(R() * tops.length) | 0];
    const tt = 0.38 + R() * 0.62;
    const onStem = tt < 0.5 ? base.clone().lerp(mid, tt * 2) : mid.clone().lerp(top, (tt - 0.5) * 2);
    const az = R() * Math.PI * 2;
    const out = r * Math.sqrt(R()) * (1.25 - tt * 0.6);
    const p = onStem.add(V(Math.cos(az) * out, (R() - 0.6) * 1.0, Math.sin(az) * out));
    const sh = p.clone().sub(c).divide(rad);
    const nn = sh.clone().normalize().add(V(0, 0.25, 0)).normalize();
    const size = (1.35 + R() * 0.5) / Math.sqrt(Math.max(detail, 0.4));
    const [ax, ay] = randomCardAxes(R, V(R() - 0.5, (R() - 0.5) * 0.4, R() - 0.5).normalize(), size, 0.55);
    const flex = Math.min(1, 0.35 + ((p.y - y0) / h) * 0.9);
    const v = 0.9 + R() * 0.2;
    B.card(p, ax, ay, nn, 2, flex, R() * 6.28, 1.0, [v, v, v * 0.92]);
  }
  return { collider: { c: [x, z], r: 0.35 } };
}

function spruce(B, R, t, y0, detail) {
  const { x, z, h, r } = t;
  B.limb('spruceBark', V(x, y0 - 0.3, z), V(x, y0 + h * 0.97, z), Math.max(0.16, h * 0.022), 0.03, 8);
  const step = 0.42 / Math.sqrt(Math.max(detail, 0.4));
  for (let y = 0.5; y < h - 0.3; y += step * (0.85 + R() * 0.3)) {
    const f = Math.pow((h - y) / (h - 0.5), 0.95);
    const rr = r * f * (0.85 + R() * 0.25) + 0.25;
    const nb = Math.max(4, Math.round(5 + f * 4));
    const off = R() * Math.PI * 2;
    for (let i = 0; i < nb; i++) {
      const az = off + (i / nb) * Math.PI * 2 + (R() - 0.5) * 0.4;
      const out = V(Math.cos(az), 0, Math.sin(az));
      const droop = -0.25 - R() * 0.25;
      const dir = out.clone().add(V(0, droop, 0)).normalize();
      const center = V(x, y0 + y, z).addScaledVector(dir, rr * 0.5);
      const ax = dir.clone().multiplyScalar(rr * 0.52);
      const side = new THREE.Vector3().crossVectors(dir, UP).normalize();
      const w = 0.45 + f * 0.35;
      const n = out.clone().multiplyScalar(0.8).add(V(0, 0.45, 0)).normalize();
      const flex = Math.min(1, 0.15 + (y / h) * 0.5) * 0.6;
      const tint = [0.92 + R() * 0.12, 0.95 + R() * 0.1, 1.0 + R() * 0.08];
      // a flat spray and a tilted one, so the branch has depth
      B.card(center, ax, side.clone().multiplyScalar(w), n, 3, flex, R() * 6.28, 0.25, tint);
      const tilt = side.clone().multiplyScalar(w * 0.6).add(V(0, w * 0.75, 0));
      B.card(center.clone().add(V(0, 0.05, 0)), ax, tilt, n, 3, flex, R() * 6.28, 0.25, tint);
    }
  }
  return { collider: { c: [x, z], r: 0.45 } };
}

export function buildTrees(T, quality) {
  const R = rng(23);
  const B = new Builder();
  const colliders = [];
  const detail = quality.treeDetail;
  const make = (t, det) => {
    const y0 = T.heightAt(t.x, t.z);
    const res = t.kind === 'birch' ? birch(B, R, t, y0, det) : t.kind === 'spruce' ? spruce(B, R, t, y0, det) : broadleaf(B, R, t, y0, det);
    colliders.push(res.collider);
  };
  TREES.forEach((t) => make(t, detail));
  // the grove along the lane, down the bluff
  for (const p of samplePolyline(GROVE_LINE, 8.5)) {
    const nx = -Math.sin(p.ang), nz = Math.cos(p.ang);
    const off = (R() - 0.3) * 12;
    const kind = R() < 0.72 ? 'cotton' : 'spruce';
    const h = kind === 'cotton' ? 15 + R() * 7 : 11 + R() * 5;
    const r = kind === 'cotton' ? 5.5 + R() * 3 : 3 + R() * 1.2;
    make({ kind, x: p.x + nx * off, z: p.z + nz * off, h, r }, detail * 0.45);
  }

  const atlas = getLeafAtlas(quality);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
  g.setAttribute('aWind', new THREE.Float32BufferAttribute(B.wind, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
  g.setIndex(B.idx);
  g.computeBoundingSphere();
  const mat = foliageMaterial(atlas, { translucency: 0.65, a2c: quality.tier === 'high' });
  mat.vertexColors = true;
  const leaves = new THREE.Mesh(g, mat);
  leaves.castShadow = true;
  leaves.receiveShadow = true;
  leaves.customDepthMaterial = foliageDepthMaterial(atlas);

  const barkMats = {
    bark: patternMaterial({ color: [112, 102, 90], pattern: 'bark', rough: 0.95 }),
    barkGray: patternMaterial({ color: [124, 118, 108], pattern: 'bark', rough: 0.95 }),
    spruceBark: patternMaterial({ color: [92, 76, 62], pattern: 'bark', rough: 0.95 }),
    birch: patternMaterial({ color: [232, 228, 218], pattern: 'birch', rough: 0.8 }),
  };
  const group = new THREE.Group();
  group.add(leaves);
  for (const [key, geos] of B.bark) {
    const m = new THREE.Mesh(mergeGeometries(geos), barkMats[key]);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  return { group, colliders };
}
