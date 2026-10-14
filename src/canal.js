import * as THREE from 'three';
import { CANAL_SHAPE, WALK_BOUNDS } from './layout.js';
import { CANAL_PTS } from './terrain.js';
import { samplePolyline, rng } from './geo.js';
import { NOISE } from './glsl.js';
import { SUN } from './atmosphere.js';
import { WIND } from './foliage.js';

// Water in the big canal across the road, running steady and brown-green,
// with the morning sky on it.
export function buildCanal(T) {
  const C = CANAL_SHAPE;
  const samples = samplePolyline(CANAL_PTS, 1.5).filter((p, i, a) => i === 0 || Math.hypot(p.x - a[i - 1].x, p.z - a[i - 1].z) > 0.3);
  // water level follows the land, smoothed so it never ripples uphill
  const raw = samples.map((s) => T.rawBase(s.x, s.z) - C.depth + C.water);
  const level = raw.map((_, i) => {
    let sum = 0, n = 0;
    for (let k = -12; k <= 12; k++) { const j = i + k; if (j >= 0 && j < raw.length) { sum += raw[j]; n++; } }
    return sum / n;
  });
  const half = C.bottom / 2 + (C.water / C.depth) * (C.top - C.bottom) / 2 + 0.15;
  const pos = [], uv = [], idx = [];
  let along = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (i > 0) along += Math.hypot(s.x - samples[i - 1].x, s.z - samples[i - 1].z);
    // direction from the neighbors on either side, so bends never fold the surface
    const pa = samples[Math.max(0, i - 2)], pb = samples[Math.min(samples.length - 1, i + 2)];
    const dl = Math.hypot(pb.x - pa.x, pb.z - pa.z) || 1;
    const nx = -(pb.z - pa.z) / dl, nz = (pb.x - pa.x) / dl;
    for (const side of [-1, 1]) {
      pos.push(s.x + nx * half * side, level[i], s.z + nz * half * side);
      uv.push(along, side);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const mat = new THREE.ShaderMaterial({
    fog: true,
    side: THREE.DoubleSide,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWP;
      varying vec2 vUv;
      void main() {
        vec3 transformed = position;
        vWP = position;
        vUv = uv;
        vec4 mvPosition = viewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      varying vec3 vWP;
      varying vec2 vUv;
      ${NOISE}
      const vec3 SUN_D = vec3(${SUN.x.toFixed(4)}, ${SUN.y.toFixed(4)}, ${SUN.z.toFixed(4)});
      #ifndef USE_FOG
      vec3 skyColor(vec3 d) { return vec3(0.6, 0.7, 0.85); }
      #endif
      float hgt(vec2 p) {
        float t = uTime;
        return vnoise(vec2(p.x * 1.6 - t * 1.1, p.y * 2.6)) * 0.5
             + vnoise(vec2(p.x * 3.7 - t * 1.7, p.y * 5.0 + 3.0)) * 0.3
             + vnoise(vec2(p.x * 8.0 - t * 2.6, p.y * 9.0 + 7.0)) * 0.2;
      }
      void main() {
        vec2 p = vec2(vUv.x, vUv.y * 2.4);
        float e = 0.05;
        float h0 = hgt(p), hx = hgt(p + vec2(e, 0.0)), hy = hgt(p + vec2(0.0, e));
        vec3 n = normalize(vec3((h0 - hx) * 1.2, 1.0, (h0 - hy) * 1.2));
        vec3 v = normalize(vWP - cameraPosition);
        vec3 r = reflect(v, n);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-v, n), 0.0), 5.0);
        vec3 refl = skyColor(normalize(vec3(r.x, max(r.y, 0.02), r.z)));
        // banks and willows reflect darker than open sky near the horizon
        refl = mix(vec3(0.05, 0.07, 0.04), refl, smoothstep(0.03, 0.35, r.y));
        vec3 body = vec3(0.03, 0.045, 0.032);
        float shallow = smoothstep(0.7, 1.0, abs(vUv.y));
        body = mix(body, vec3(0.08, 0.075, 0.05), shallow);
        vec3 col = mix(body, refl, fres * 0.75 + 0.05);
        col += vec3(1.0, 0.88, 0.7) * pow(max(dot(r, SUN_D), 0.0), 260.0) * 9.0;
        col += vec3(0.9) * smoothstep(0.62, 0.8, h0) * shallow * 0.05;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const water = new THREE.Mesh(g, mat);
  water.receiveShadow = false;

  // keep walkers on the banks
  const colliders = [];
  for (let i = 0; i < samples.length - 1; i += 2) {
    const a = samples[i], b = samples[Math.min(i + 2, samples.length - 1)];
    if (a.x > WALK_BOUNDS[2] + 8 || a.z < WALK_BOUNDS[1] - 8 || a.z > WALK_BOUNDS[3] + 8) continue;
    for (const side of [-1, 1]) {
      const off = (half - 0.4) * side;
      const anx = -Math.sin(a.ang) * off, anz = Math.cos(a.ang) * off;
      const bnx = -Math.sin(b.ang) * off, bnz = Math.cos(b.ang) * off;
      colliders.push({ seg: [a.x + anx, a.z + anz, b.x + bnx, b.z + bnz], r: 0.2 });
    }
  }

  // willows and Russian olives along the banks
  const R = rng(909);
  const trees = [];
  for (const s of samplePolyline(CANAL_PTS, 11)) {
    if (s.x > 175 || R() < 0.3) continue;
    const side = R() < 0.55 ? 1 : -1;
    const off = (C.top / 2 + 2.2 + R() * 2.2) * side;
    trees.push({ kind: 'ash', x: s.x - Math.sin(s.ang) * off, z: s.z + Math.cos(s.ang) * off, h: 6.5 + R() * 5, r: 2.8 + R() * 1.8 });
  }
  const update = (t) => { mat.uniforms.uTime.value = t; };
  return { mesh: water, colliders, trees, update };
}

// Nearest point on the canal's centerline, for the sound of it.
export function canalNearest(x, z) {
  let best = { d: Infinity, x: 0, z: 0 };
  for (let i = 0; i < CANAL_PTS.length - 1; i++) {
    const [ax, az] = CANAL_PTS[i], [bx, bz] = CANAL_PTS[i + 1];
    const dx = bx - ax, dz = bz - az;
    const L = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L));
    const qx = ax + dx * t, qz = az + dz * t;
    const d = Math.hypot(x - qx, z - qz);
    if (d < best.d) best = { d, x: qx, z: qz };
  }
  return best;
}
void WIND;
