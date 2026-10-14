import * as THREE from 'three';
import { SPRINKLERS } from './layout.js';
import { SUN } from './atmosphere.js';
import { patternMaterial } from './materials.js';

// Impact sprinklers. The head steps around its arc a few degrees at a time, the arm
// knocking the stream into spray with every tick, then rattles back quickly to start over.
export function buildWater(T, props) {
  const heads = [];
  const g = new THREE.Group();
  const brass = patternMaterial({ color: [182, 146, 74], rough: 0.3, metal: 0.85 });
  const dark = patternMaterial({ color: [40, 40, 40], rough: 0.5, metal: 0.5 });

  for (const s of SPRINKLERS) {
    const y = T.heightAt(s.x, s.z) + 0.32;
    const pivot = new THREE.Group();
    pivot.position.set(s.x, y, s.z);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.09, 10), brass);
    body.position.y = 0.03;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.013, 0.16, 8), brass);
    nozzle.rotation.z = -Math.PI / 2 + 0.45;
    nozzle.position.set(0.07, 0.08, 0);
    const armPivot = new THREE.Group();
    armPivot.position.set(0, 0.1, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.012, 0.012), dark);
    arm.position.set(0.07, 0.0, 0.0);
    const spoon = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.01), dark);
    spoon.position.set(0.15, 0.0, 0.0);
    armPivot.add(arm, spoon);
    pivot.add(body, nozzle, armPivot);
    for (const m of [body, nozzle, arm, spoon]) m.castShadow = true;
    g.add(pivot);
    const v = Math.sqrt((s.radius * 9.81) / Math.sin(2 * 0.42)) * 1.12;
    heads.push({
      kind: 'lawn', x: s.x, z: s.z, y, from: s.from, to: s.to, ang: (s.from + s.to) / 2, dir: 1,
      state: 'fwd', timer: Math.random() * 0.3, v, el: 0.42, pivot, armPivot, flick: 0, rate: 460, pool: 1100, spawnAcc: 0,
    });
  }
  // wheel line heads: full circles, slower and farther away
  if (props && props.wheelLine) {
    const W = props.wheelLine;
    for (let i = 0; i < W.length - 1; i++) {
      const a = W[i], b = W[i + 1];
      const y = (a.y + b.y) / 2 + 0.63;
      const radius = 10.5;
      heads.push({
        kind: 'field', x: a.x, z: (a.z + b.z) / 2, y, from: -Infinity, to: Infinity, ang: Math.random() * 6.28, dir: Math.random() < 0.5 ? 1 : -1,
        state: 'fwd', timer: Math.random() * 0.5, v: Math.sqrt((radius * 9.81) / Math.sin(2 * 0.4)) * 1.1, el: 0.4, rate: 90, pool: 220, spawnAcc: 0,
      });
    }
  }

  // particle pool for all heads
  const total = heads.reduce((n, h) => n + h.pool, 0);
  const pos = new Float32Array(total * 3);
  const vel = new Float32Array(total * 3);
  const life = new Float32Array(total);
  const size = new Float32Array(total);
  const alpha = new Float32Array(total);
  let off = 0;
  for (const h of heads) { h.base = off; h.next = 0; off += h.pool; }
  for (let i = 0; i < total; i++) { pos[i * 3 + 1] = -1000; life[i] = 0; }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aAlpha;
      uniform float uScale;
      varying float vAlpha;
      varying vec3 vWP;
      void main() {
        vWP = position;
        vec4 mv = viewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.5, aSize * uScale / -mv.z);
        vAlpha = aAlpha * smoothstep(0.0, 1.5, gl_PointSize);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying vec3 vWP;
      const vec3 SUN_DIR = vec3(${SUN.x.toFixed(4)}, ${SUN.y.toFixed(4)}, ${SUN.z.toFixed(4)});
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.0, d) * vAlpha;
        vec3 v = normalize(vWP - cameraPosition);
        float back = pow(max(dot(v, SUN_DIR), 0.0), 5.0);
        vec3 col = vec3(0.6, 0.66, 0.72) + vec3(1.0, 0.9, 0.72) * (0.3 + back * 2.4);
        gl_FragColor = vec4(col, a * (0.6 + back * 0.4));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 10;
  g.add(points);

  const listeners = [];
  const emit = (h, burst) => {
    const i = h.base + h.next;
    h.next = (h.next + 1) % h.pool;
    const spread = burst ? 0.28 : 0.022;
    const a = h.ang + (Math.random() - 0.5) * spread * (burst ? 1 : 1);
    const el = h.el + (Math.random() - 0.5) * (burst ? 0.35 : 0.03);
    const sp = h.v * (burst ? 0.35 + Math.random() * 0.55 : 0.92 + Math.random() * 0.1);
    const dx = Math.cos(a), dz = -Math.sin(a);
    pos[i * 3] = h.x + dx * 0.12;
    pos[i * 3 + 1] = h.y + 0.1;
    pos[i * 3 + 2] = h.z + dz * 0.12;
    vel[i * 3] = dx * Math.cos(el) * sp;
    vel[i * 3 + 1] = Math.sin(el) * sp;
    vel[i * 3 + 2] = dz * Math.cos(el) * sp;
    life[i] = 2.4;
    const mist = Math.random() < (burst ? 0.5 : 0.06);
    size[i] = mist ? 0.05 + Math.random() * 0.05 : 0.026 + Math.random() * 0.016;
    alpha[i] = mist ? 0.07 : 0.55;
  };

  const update = (dt) => {
    for (const h of heads) {
      h.timer -= dt;
      if (h.timer <= 0) {
        if (h.state === 'fwd') {
          h.ang += 0.058 * h.dir * (h.kind === 'field' ? 1.2 : 1);
          h.timer = (h.kind === 'field' ? 0.5 : 0.38) + Math.random() * 0.08;
          for (let k = 0; k < (h.kind === 'field' ? 10 : 40); k++) emit(h, true);
          h.flick = 1;
          if (h.ang > h.to) { h.state = 'rev'; }
          for (const fn of listeners) fn('tick', h);
        } else {
          h.ang -= 0.055;
          h.timer = 0.065 + Math.random() * 0.01;
          for (const fn of listeners) fn('rattle', h);
          if (h.ang < h.from) { h.state = 'fwd'; h.dir = 1; for (const fn of listeners) fn('turn', h); }
        }
      }
      h.spawnAcc += dt * h.rate * (h.state === 'rev' ? 0.8 : 1);
      while (h.spawnAcc >= 1) { emit(h, false); h.spawnAcc -= 1; }
      if (h.pivot) {
        h.pivot.rotation.y = h.ang;
        h.flick = Math.max(0, h.flick - dt * 9);
        h.armPivot.rotation.y = Math.sin(h.flick * Math.PI) * 0.9;
      }
    }
    const drag = Math.exp(-0.32 * dt);
    for (let i = 0; i < total; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      const j = i * 3;
      vel[j] *= drag; vel[j + 2] *= drag;
      vel[j + 1] = vel[j + 1] * drag - 9.81 * dt;
      pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
      size[i] *= 1 + dt * 0.25;
      if (life[i] <= 0 || pos[j + 1] < T.heightAt(pos[j], pos[j + 2])) { life[i] = 0; pos[j + 1] = -1000; }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
  };

  const resize = (camera, height) => {
    mat.uniforms.uScale.value = (height * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
  };
  // warm the system so water is already in the air on the first frame
  for (let k = 0; k < 90; k++) update(1 / 30);
  return { group: g, update, resize, heads, on: (fn) => listeners.push(fn) };
}
