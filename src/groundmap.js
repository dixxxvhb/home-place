import * as THREE from 'three';
import { MAP } from './terrain.js';
import {
  ROAD_SMOOTH, ROAD_WIDTH, roadX, DIRT_NE, LANE_NW, DRIVE, DRIVE_WIDTH, FRONT_PAD, LAWN, GRAVEL,
  NEIGHBOR_LAWNS, ARENA, HOUSE, SHOP, HORSE_SHED, UTILITY_SHED, TREES, SPRINKLERS, NEIGHBORS, PASTURE_WEST,
  APRON, SIDEWALK, ROCKS, GARDEN, PIT, CANAL_SHAPE,
} from './layout.js';
import { CANAL_PTS } from './terrain.js';
import { rng, smoothLine } from './geo.js';

// Surface kinds. col = albedo (sRGB), p1 = [grass height m, grass density, gravel],
// p2 = [hard surface, class id]. Class ids drive footstep sounds.
export const CLASS = {
  LAWN: 0, PASTURE: 1, GRAVEL: 2, ASPHALT: 3, SAND: 4, CONCRETE: 5, FIELD: 6, ROAD: 7,
  GARDEN: 8, WORN: 9, DITCH: 10, DIRT: 11,
};
const S = {
  pasture: { col: [98, 104, 48], p1: [0.4, 0.92, 0], p2: [0, CLASS.PASTURE] },
  lawn: { col: [66, 100, 38], p1: [0.085, 1, 0], p2: [0, CLASS.LAWN] },
  worn: { col: [112, 100, 66], p1: [0.1, 0.35, 0.2], p2: [0, CLASS.WORN] },
  gravel: { col: [150, 141, 126], p1: [0.12, 0.035, 1], p2: [0, CLASS.GRAVEL] },
  asphalt: { col: [56, 56, 58], p1: [0, 0, 0], p2: [1, CLASS.ASPHALT] },
  sand: { col: [170, 140, 100], p1: [0, 0, 0.12], p2: [0, CLASS.SAND] },
  concrete: { col: [168, 164, 154], p1: [0, 0, 0], p2: [1, CLASS.CONCRETE] },
  field: { col: [48, 90, 34], p1: [0.5, 1, 0], p2: [0, CLASS.FIELD] },
  road: { col: [112, 108, 101], p1: [0, 0, 0.35], p2: [1, CLASS.ROAD] },
  shoulder: { col: [138, 128, 110], p1: [0.12, 0.06, 1], p2: [0, CLASS.GRAVEL] },
  ditch: { col: [66, 82, 38], p1: [0.85, 0.8, 0], p2: [0, CLASS.DITCH] },
  dirt: { col: [128, 106, 78], p1: [0.1, 0.06, 0.3], p2: [0, CLASS.DIRT] },
  garden: { col: [80, 60, 42], p1: [0, 0, 0], p2: [0, CLASS.GARDEN] },
  rock: { col: [150, 146, 138], p1: [0.06, 0.02, 1], p2: [0, CLASS.GRAVEL] },
  mud: { col: [70, 62, 48], p1: [0, 0, 0], p2: [0, CLASS.DIRT] },
  under: { col: [120, 116, 110], p1: [0, 0, 0], p2: [1, CLASS.CONCRETE] },
};

export function paintGround(quality) {
  const N = quality.mapRes;
  const layers = ['col', 'p1', 'p2'].map(() => {
    const c = document.createElement('canvas');
    c.width = c.height = N;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const s = N / MAP.size;
    ctx.setTransform(s, 0, 0, s, -MAP.x0 * s, -MAP.z0 * s);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    return { c, ctx };
  });
  const [COL, P1, P2] = layers;
  const rgb = (a) => `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`;
  const styles = (k) => [rgb(S[k].col), rgb(S[k].p1.map((v) => v * 255)), rgb([S[k].p2[0] * 255, S[k].p2[1] * 16 + 8, 0])];

  const path = (ctx, pts, close) => {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close) ctx.closePath();
  };
  const fill = (k, pts) => styles(k).forEach((st, i) => { const ctx = layers[i].ctx; ctx.fillStyle = st; path(ctx, pts, true); ctx.fill(); });
  const rect = (k, r) => fill(k, [[r[0], r[1]], [r[2], r[1]], [r[2], r[3]], [r[0], r[3]]]);
  const stroke = (k, pts, w) => styles(k).forEach((st, i) => { const ctx = layers[i].ctx; ctx.strokeStyle = st; ctx.lineWidth = w; path(ctx, pts, false); ctx.stroke(); });

  const R = rng(7);
  const blob = (x, z, r, c, a) => {
    const g = COL.ctx.createRadialGradient(x, z, 0, x, z, r);
    g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`);
    g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
    COL.ctx.fillStyle = g;
    COL.ctx.beginPath(); COL.ctx.arc(x, z, r, 0, Math.PI * 2); COL.ctx.fill();
  };
  const X1 = MAP.x0 + MAP.size, Z1 = MAP.z0 + MAP.size;

  // 1. everything starts as pasture
  fill('pasture', [[MAP.x0, MAP.z0], [X1, MAP.z0], [X1, Z1], [MAP.x0, Z1]]);
  // patchy pasture: greener where it's wet, golder where it's dry
  for (let i = 0; i < 900; i++) {
    const x = MAP.x0 + R() * MAP.size, z = MAP.z0 + R() * MAP.size, r = 2 + R() * 9;
    blob(x, z, r, R() < 0.5 ? [150, 132, 70] : [46, 82, 28], 0.22);
  }

  // 2. the field across the road
  const roadPts = [];
  for (let z = MAP.z0 - 4; z <= Z1 + 4; z += 4) roadPts.push([roadX(z), z]);
  const fieldEdge = roadPts.map(([x, z]) => [x + ROAD_WIDTH / 2 + 5.0, z]);
  fill('field', [...fieldEdge, [X1 + 4, Z1 + 4], [X1 + 4, MAP.z0 - 4]]);
  for (let i = 0; i < 260; i++) {
    const z = MAP.z0 + R() * MAP.size, x = roadX(z) + 10 + R() * 160, r = 3 + R() * 10;
    blob(x, z, r, R() < 0.5 ? [74, 112, 52] : [36, 66, 26], 0.2);
  }

  // 3. the canal and its weedy banks, then shoulders and road
  stroke('ditch', CANAL_PTS, CANAL_SHAPE.top + 4.6);
  stroke('mud', CANAL_PTS, CANAL_SHAPE.top - 0.6);
  stroke('shoulder', roadPts, ROAD_WIDTH + 3.0);
  stroke('road', roadPts, ROAD_WIDTH);
  stroke('dirt', smoothLine(DIRT_NE, 6), 4.0);
  stroke('gravel', smoothLine(LANE_NW, 6), 4.2);

  // 4. the yard
  fill('gravel', GRAVEL);
  fill('lawn', LAWN);
  NEIGHBOR_LAWNS.forEach((p) => fill('lawn', p));
  rect('sand', ARENA);
  rect('dirt', [UTILITY_SHED.rect[0] - 1, UTILITY_SHED.rect[1] - 0.5, UTILITY_SHED.rect[2] + 3, UTILITY_SHED.rect[3] + 0.5]);
  fill('rock', ROCKS);
  // the garden: turned soil in rows running north-south
  rect('garden', GARDEN);

  // horse traffic wears the pasture bare by the gate, the trough and the shed
  const wear = [[-47.5, 6.8, 5], [-52, 10, 3.5], [-48, 40, 4], [-60, 30, 2.5], [-38.5, -31.7, 4], [-31.7, -37, 2.5]];
  wear.forEach(([x, z, r]) => styles('worn').forEach((st, i) => {
    const ctx = layers[i].ctx; ctx.fillStyle = st; ctx.beginPath(); ctx.ellipse(x, z, r, r * 0.8, 0.4, 0, Math.PI * 2); ctx.fill();
  }));
  // cow paths, horse paths: thin trails along the fence lines
  stroke('worn', [[-48, -15], [-48, 6.8], [-50, 30], [-48, 46]], 0.9);
  stroke('worn', [[-50, 10], [-70, 2], [-88, -10]], 0.8);

  // 5. hard surfaces
  rect('concrete', FRONT_PAD);
  rect('concrete', APRON);
  rect('concrete', SIDEWALK);
  rect('under', PIT.rect);
  stroke('asphalt', smoothLine(DRIVE, 6), DRIVE_WIDTH);
  // under the buildings
  rect('under', [HOUSE.main[0], HOUSE.main[1], HOUSE.main[2] + 0.6, HOUSE.main[3]]);
  rect('under', HOUSE.garage);
  rect('under', SHOP.rect);
  rect('under', SHOP.leanTo);
  rect('under', HORSE_SHED.rect);
  rect('under', UTILITY_SHED.rect);
  NEIGHBORS.forEach((n) => rect('under', n.rect));

  // 6. light only: wet rings from the sprinklers, shade under trees and at the walls
  const C = COL.ctx;
  for (let x = GARDEN[0] + 0.45; x < GARDEN[2]; x += 0.9) {
    C.fillStyle = 'rgba(40,28,18,0.35)';
    C.fillRect(x - 0.12, GARDEN[1] + 0.3, 0.24, GARDEN[3] - GARDEN[1] - 0.6);
    C.fillStyle = 'rgba(150,120,90,0.25)';
    C.fillRect(x + 0.2, GARDEN[1] + 0.3, 0.3, GARDEN[3] - GARDEN[1] - 0.6);
  }
  C.globalCompositeOperation = 'multiply';
  for (const s of SPRINKLERS) {
    const g = C.createRadialGradient(s.x, s.z, 0, s.x, s.z, s.radius + 1);
    g.addColorStop(0, 'rgb(170,175,170)');
    g.addColorStop(0.85, 'rgb(190,195,190)');
    g.addColorStop(1, 'rgb(255,255,255)');
    C.fillStyle = g; C.beginPath(); C.arc(s.x, s.z, s.radius + 1, 0, Math.PI * 2); C.fill();
  }
  for (const t of TREES) {
    const r = t.r * 1.15;
    const g = C.createRadialGradient(t.x, t.z, 0, t.x, t.z, r);
    g.addColorStop(0, 'rgb(150,148,140)');
    g.addColorStop(1, 'rgb(255,255,255)');
    C.fillStyle = g; C.beginPath(); C.arc(t.x, t.z, r, 0, Math.PI * 2); C.fill();
  }
  const wallShade = (r, w) => {
    C.strokeStyle = 'rgba(120,118,112,0.55)';
    C.lineWidth = w;
    C.strokeRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
  };
  wallShade([HOUSE.garage[0], HOUSE.main[1], HOUSE.main[2] + 0.6, HOUSE.main[3]], 1.2);
  wallShade(SHOP.rect, 1.4);
  wallShade(HORSE_SHED.rect, 1.0);
  wallShade(UTILITY_SHED.rect, 1.2);
  C.globalCompositeOperation = 'source-over';

  // ---- pack into textures ----
  const col = COL.ctx.getImageData(0, 0, N, N).data;
  const p1 = P1.ctx.getImageData(0, 0, N, N).data;
  const p2 = P2.ctx.getImageData(0, 0, N, N).data;
  const params = new Uint8Array(N * N * 4);
  const cls = new Uint8Array(N * N);
  const colors = new Uint8Array(N * N * 4);
  for (let i = 0, j = 0; i < N * N; i++, j += 4) {
    params[j] = p1[j];
    params[j + 1] = p1[j + 1];
    params[j + 2] = p1[j + 2];
    params[j + 3] = p2[j];
    cls[i] = Math.max(0, Math.round((p2[j + 1] - 8) / 16));
    colors[j] = col[j]; colors[j + 1] = col[j + 1]; colors[j + 2] = col[j + 2]; colors[j + 3] = 255;
  }
  const colorTex = new THREE.DataTexture(colors, N, N, THREE.RGBAFormat);
  colorTex.colorSpace = THREE.SRGBColorSpace;
  const paramTex = new THREE.DataTexture(params, N, N, THREE.RGBAFormat);
  for (const t of [colorTex, paramTex]) {
    t.flipY = false;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 8;
    t.needsUpdate = true;
  }

  const toPx = (x, z) => [((x - MAP.x0) / MAP.size) * N, ((z - MAP.z0) / MAP.size) * N];
  const classAt = (x, z) => {
    const [px, pz] = toPx(x, z);
    if (px < 0 || pz < 0 || px >= N || pz >= N) return CLASS.PASTURE;
    return cls[(pz | 0) * N + (px | 0)];
  };
  const grassAt = (x, z) => {
    const [px, pz] = toPx(x, z);
    if (px < 0 || pz < 0 || px >= N || pz >= N) return [0.4, 0.9];
    const j = ((pz | 0) * N + (px | 0)) * 4;
    return [params[j] / 255, params[j + 1] / 255];
  };
  return { colorTex, paramTex, classAt, grassAt, N, canvas: COL.c };
}

export { PASTURE_WEST };
