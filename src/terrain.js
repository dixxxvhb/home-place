import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { DEM_CENTER, HOUSE, SHOP, ARENA, roadX, ROAD_WIDTH } from './layout.js';
import { clamp, smoothstep, lerp, rectOutside } from './geo.js';

// The painted, walkable square around the property.
export const MAP = { x0: -222, z0: -192, size: 384 };

const R_EFF = 6371000 / 0.87; // earth radius, stretched for refraction

export async function loadTerrain() {
  const meta = await (await fetch('./data/terrain.json')).json();
  const load = async (m) => {
    const buf = await (await fetch('./data/' + m.file)).arrayBuffer();
    const u = new Uint16Array(buf);
    const f = new Float32Array(u.length);
    for (let i = 0; i < u.length; i++) f[i] = u[i] / m.scale + m.base;
    return { n: m.n, size: m.size, data: f };
  };
  const [local, mid, far] = await Promise.all([load(meta.local), load(meta.mid), load(meta.far)]);

  const sample = (g, x, z) => {
    const n = g.n;
    let gx = ((x - DEM_CENTER.x) / g.size) * n + n / 2 - 0.5;
    let gz = ((z - DEM_CENTER.z) / g.size) * n + n / 2 - 0.5;
    gx = clamp(gx, 0, n - 1.001);
    gz = clamp(gz, 0, n - 1.001);
    const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz;
    const d = g.data, i = iz * n + ix;
    return lerp(lerp(d[i], d[i + 1], fx), lerp(d[i + n], d[i + n + 1], fx), fz);
  };

  // Elevation in meters above sea level, blended across the three grids, with earth curvature.
  const elevation = (x, z) => {
    const dx = x - DEM_CENTER.x, dz = z - DEM_CENTER.z;
    const cheb = Math.max(Math.abs(dx), Math.abs(dz));
    let h = sample(far, x, z);
    if (cheb < 1490) h = lerp(h, sample(mid, x, z), 1 - smoothstep(1250, 1480, cheb));
    if (cheb < 296) h = lerp(h, sample(local, x, z), 1 - smoothstep(230, 290, cheb));
    return h - (dx * dx + dz * dz) / (2 * R_EFF);
  };

  const ELEV0 = elevation(-5, 0);
  const raw = (x, z) => elevation(x, z) - ELEV0;

  // Level pads under the buildings and the arena, a crowned road, and a ditch on the field side.
  const pad = (r, margin) => {
    const c = [(r[0] + r[2]) / 2, (r[1] + r[3]) / 2];
    let s = 0, k = 0;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { s += raw(lerp(r[0], r[2], i / 4), lerp(r[1], r[3], j / 4)); k++; }
    return { r, margin, y: s / k, c };
  };
  const pads = [
    pad([HOUSE.garage[0] - 1, HOUSE.main[1] - 1, HOUSE.main[2] + 4, HOUSE.main[3] + 1], 9),
    pad([SHOP.leanTo[0] - 1, SHOP.rect[1] - 1, SHOP.rect[2] + 2, SHOP.rect[3] + 1], 8),
    pad(ARENA, 6),
  ];
  // The house sits a hair above its surroundings so water runs off.
  pads[0].y += 0.12;

  const shaped = (x, z) => {
    let h = raw(x, z);
    for (const p of pads) {
      const d = rectOutside(x, z, p.r);
      if (d < p.margin) h = lerp(p.y, h, smoothstep(0, p.margin, d));
    }
    if (Math.abs(z) < 190) {
      const rc = roadX(z);
      const dx = x - rc;
      const ry = raw(rc, z);
      const half = ROAD_WIDTH / 2;
      const ad = Math.abs(dx);
      if (ad < half + 3.5) {
        const crown = ad < half ? 0.1 * (1 - (ad / half) ** 2) : 0;
        h = lerp(ry + crown, h, smoothstep(half + 0.8, half + 3.5, ad));
      }
      // irrigation ditch on the east side
      const dd = Math.abs(dx - (half + 3.3));
      if (dd < 1.6) h -= 0.75 * (1 - (dd / 1.6) ** 2) * smoothstep(-185, -150, z) * (1 - smoothstep(150, 185, z));
      // shallow borrow on the west side
      const dw = Math.abs(dx + half + 2.0);
      if (dw < 1.2) h -= 0.18 * (1 - (dw / 1.2) ** 2);
    }
    return h;
  };

  // Cache the shaped ground on a 1 m grid over the painted square.
  const N = MAP.size + 1;
  const grid = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) grid[j * N + i] = shaped(MAP.x0 + i, MAP.z0 + j);

  const heightAt = (x, z) => {
    const gx = x - MAP.x0, gz = z - MAP.z0;
    if (gx < 0 || gz < 0 || gx >= N - 1 || gz >= N - 1) return raw(x, z);
    const ix = gx | 0, iz = gz | 0, fx = gx - ix, fz = gz - iz;
    const i = iz * N + ix;
    return lerp(lerp(grid[i], grid[i + 1], fx), lerp(grid[i + N], grid[i + N + 1], fx), fz);
  };

  // Height texture for the grass shader (and anything else that needs ground height on the GPU).
  const hdata = new Float32Array(N * N);
  hdata.set(grid);
  const heightTex = new THREE.DataTexture(toHalf(hdata), N, N, THREE.RedFormat, THREE.HalfFloatType);
  heightTex.magFilter = THREE.LinearFilter;
  heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;

  return { raw, heightAt, heightTex, pads, N, ELEV0 };
}

function toHalf(f32) {
  const out = new Uint16Array(f32.length);
  for (let i = 0; i < f32.length; i++) out[i] = THREE.DataUtils.toHalfFloat(f32[i]);
  return out;
}

// ---------- shading ----------

// Procedural land cover for everything outside the painted square:
// irrigated fields on the valley floor, dry grass, sage and timber up the mountains.
export const LAND_GLSL = /* glsl */ `
vec3 landAlbedo(vec3 wp, vec3 n, float dist) {
  float slope = clamp(1.0 - n.y, 0.0, 1.0);
  float e = wp.y;
  vec2 q = wp.xz + vec2(186.0, 151.0);
  vec2 cell = floor(q / 402.3);
  vec2 f = fract(q / 402.3);
  float h0 = hash12(cell);
  vec2 sub = h0 < 0.5 ? vec2(step(0.5, f.x), 0.0) : vec2(0.0, step(0.5, f.y));
  float h = hash12(cell * 1.7 + sub * 13.1 + 0.37);
  vec3 crop = h < 0.26 ? vec3(0.07, 0.125, 0.03)
            : h < 0.42 ? vec3(0.20, 0.165, 0.07)
            : h < 0.56 ? vec3(0.055, 0.115, 0.03)
            : h < 0.68 ? vec3(0.23, 0.19, 0.105)
            : h < 0.86 ? vec3(0.095, 0.135, 0.045)
            : vec3(0.2, 0.165, 0.105);
  float rows = 0.5 + 0.5 * sin((h0 < 0.5 ? q.x : q.y) * 2.4);
  crop *= mix(1.0, 0.86 + 0.14 * rows, 1.0 - smoothstep(80.0, 500.0, dist));
  crop *= 0.82 + 0.36 * vnoise(q * 0.018 + h * 9.0);
  vec2 edge = min(f, 1.0 - f) * 402.3;
  float border = 1.0 - smoothstep(1.5, 7.0, min(edge.x, edge.y));
  crop = mix(crop, vec3(0.1, 0.11, 0.05), border * 0.55);
  float aspectN = clamp(-n.z, 0.0, 1.0);
  float nz = fbm3(q * 0.0022);
  vec3 up = mix(vec3(0.29, 0.23, 0.125), vec3(0.15, 0.16, 0.1), smoothstep(0.35, 0.7, nz));
  up = mix(up, vec3(0.085, 0.105, 0.05), smoothstep(250.0, 650.0, e) * (0.45 + 0.55 * nz));
  up = mix(up, vec3(0.03, 0.055, 0.03), smoothstep(450.0, 900.0, e) * smoothstep(0.05, 0.45, aspectN + nz * 0.45 - 0.1));
  up = mix(up, vec3(0.25, 0.24, 0.22), smoothstep(0.42, 0.7, slope) * 0.75);
  up = mix(up, vec3(0.27, 0.26, 0.23), smoothstep(1300.0, 1550.0, e) * 0.55);
  float valley = 1.0 - smoothstep(55.0, 160.0, e + slope * 280.0);
  vec3 col = mix(up, crop, valley);
  // river bottom: willows and wet meadow
  float bottom = 1.0 - smoothstep(-26.0, -18.0, e);
  col = mix(col, mix(vec3(0.04, 0.075, 0.03), vec3(0.09, 0.12, 0.05), vnoise(q * 0.03)), bottom * valley);
  return col;
}
`;

function landMaterial({ bump = false, offset = false } = {}) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  if (offset) {
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = 2;
    mat.polygonOffsetUnits = 4;
  }
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * normal);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;\n${NOISE}\n${LAND_GLSL}`)
      .replace('#include <map_fragment>', `
        float distL = length(vWP - cameraPosition);
        diffuseColor.rgb = landAlbedo(vWP, normalize(vWN), distL);
      `)
      .replace('#include <normal_fragment_maps>', bump ? `
        {
          vec2 q = vWP.xz * 0.004;
          float e0 = fbm3(q);
          float ex = fbm3(q + vec2(0.05, 0.0));
          float ez = fbm3(q + vec2(0.0, 0.05));
          float steep = smoothstep(0.08, 0.4, 1.0 - normalize(vWN).y);
          vec3 nW = normalize(vWN + vec3(e0 - ex, 0.0, e0 - ez) * 7.0 * steep);
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }
      ` : '#include <normal_fragment_maps>');
  };
  mat.customProgramCacheKey = () => 'land-' + bump;
  return mat;
}

// Far pass: the whole valley and both mountain ranges, 100 km across.
export function buildFarMesh(T, quality) {
  const n = quality.farGrid;
  const size = 100000;
  const geo = new THREE.PlaneGeometry(size, size, n - 1, n - 1).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + DEM_CENTER.x, z = pos.getZ(i) + DEM_CENTER.z;
    pos.setXYZ(i, x, T.raw(x, z) - (Math.hypot(x, z) < 1600 ? 6 : 0), z);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, landMaterial({ bump: quality.tier === 'high' }));
  mesh.frustumCulled = false;
  return mesh;
}

// Near pass ring: 3 km around the house, out past the bluff and the river bottom.
export function buildMidMesh(T, quality) {
  const size = 3000, segs = quality.tier === 'high' ? 300 : 180;
  const geo = new THREE.PlaneGeometry(size, size, segs, segs).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const inset = 18;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + DEM_CENTER.x, z = pos.getZ(i) + DEM_CENTER.z;
    let y = T.raw(x, z);
    const inside = x > MAP.x0 + inset && x < MAP.x0 + MAP.size - inset && z > MAP.z0 + inset && z < MAP.z0 + MAP.size - inset;
    if (inside) y -= 4;
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, landMaterial({ offset: true }));
  mesh.receiveShadow = false;
  return mesh;
}

// The painted square you actually walk on.
export function buildLocalMesh(T, maps, quality) {
  const step = quality.localStep;
  const segs = Math.round(MAP.size / step);
  const geo = new THREE.PlaneGeometry(MAP.size, MAP.size, segs, segs).rotateX(-Math.PI / 2);
  geo.translate(MAP.x0 + MAP.size / 2, 0, MAP.z0 + MAP.size / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, T.heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const uniforms = {
    uColorMap: { value: maps.colorTex },
    uParamMap: { value: maps.paramTex },
    uMapRect: { value: new THREE.Vector4(MAP.x0, MAP.z0, MAP.size, 1 / MAP.size) },
  };
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(position, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * normal);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWP;
        varying vec3 vWN;
        uniform sampler2D uColorMap;
        uniform sampler2D uParamMap;
        uniform vec4 uMapRect;
        ${NOISE}
        ${LAND_GLSL}`)
      .replace('#include <map_fragment>', GROUND_DETAIL);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

// Close-up texture for the painted ground: grit in the gravel, aggregate in the asphalt,
// mowing stripes in the lawn that flip as you walk around them.
const GROUND_DETAIL = /* glsl */ `
  vec2 muv = (vWP.xz - uMapRect.xy) * uMapRect.w;
  vec3 base = texture2D(uColorMap, muv).rgb;
  vec4 prm = texture2D(uParamMap, muv);
  float dist = length(vWP - cameraPosition);
  float near = 1.0 - smoothstep(10.0, 45.0, dist);
  float mid = 1.0 - smoothstep(40.0, 160.0, dist);
  vec2 p = vWP.xz;
  base *= 0.9 + 0.2 * fbm3(p * 0.07);
  // gravel: stones of a few colors at 2 to 6 cm
  if (prm.b > 0.02) {
    float s1 = hash12(floor(p * 34.0));
    float s2 = vnoise(p * 55.0);
    vec3 stone = mix(vec3(0.75, 0.7, 0.62), vec3(1.15, 1.08, 0.98), s1);
    stone = mix(stone, vec3(0.62, 0.6, 0.58), step(0.82, hash12(floor(p * 21.0) + 3.1)));
    float grit = mix(1.0, (0.78 + 0.32 * s2), near);
    base = mix(base, base * stone * grit, prm.b * mid);
  }
  // hard surfaces: fine aggregate and a few joints
  if (prm.a > 0.02) {
    float ag = hash12(floor(p * 90.0));
    float fine = mix(1.0, 0.9 + 0.2 * ag, near);
    base = mix(base, base * fine, prm.a);
  }
  // lawn: mowing stripes, about 55 cm wide, running north-south
  float lawn = prm.g * (1.0 - smoothstep(0.12, 0.2, prm.r));
  if (lawn > 0.02) {
    float stripe = fract(vWP.x / 1.1) < 0.5 ? 1.0 : -1.0;
    vec3 toCam = normalize(cameraPosition - vWP);
    float sv = stripe * toCam.z;
    base *= 1.0 + lawn * sv * 0.09 * mid;
    base *= mix(1.0, 0.92 + 0.16 * vnoise(p * 8.0), lawn * near);
  }
  // outside the painted square, fall back to the procedural land
  vec2 eo = min(muv, 1.0 - muv);
  float inMap = smoothstep(0.0, 0.02, min(eo.x, eo.y));
  diffuseColor.rgb = mix(landAlbedo(vWP, normalize(vWN), dist), base, inMap);
`;
