import * as THREE from 'three';
import { SUN } from './atmosphere.js';
import { rng } from './geo.js';

// Barn swallows, butterflies, and dust in the light.
export function buildLife(T, quality) {
  const group = new THREE.Group();
  const R = rng(99);

  // ---------- swallows ----------
  const birdGeo = (() => {
    const g = new THREE.BufferGeometry();
    // body, then left and right wings (separate verts so they can flap in the shader), forked tail
    const v = [
      // body (two crossed triangles, nose at +x)
      0.09, 0, 0, -0.07, 0.012, 0, -0.07, -0.012, 0,
      0.09, 0, 0, -0.07, 0, 0.014, -0.07, 0, -0.014,
      // left wing (z+)
      0.03, 0, 0.01, -0.03, 0, 0.01, -0.04, 0, 0.17,
      // right wing (z-)
      0.03, 0, -0.01, -0.04, 0, -0.17, -0.03, 0, -0.01,
      // tail fork
      -0.06, 0, 0, -0.15, 0, 0.035, -0.11, 0, 0,
      -0.06, 0, 0, -0.11, 0, 0, -0.15, 0, -0.035,
    ];
    const wing = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0];
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const w = [];
    for (let i = 0; i < 18; i++) w.push(i >= 6 && i < 12 ? (i < 9 ? (i === 8 ? 1 : 0.15) : (i === 10 ? -1 : -0.15)) : 0);
    g.setAttribute('aWing', new THREE.Float32BufferAttribute(w, 1));
    g.computeVertexNormals();
    return g;
  })();
  const birdMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0.05, 0.06, 0.1), side: THREE.DoubleSide });
  const flap = { value: 0 };
  birdMat.onBeforeCompile = (s) => {
    s.uniforms.uFlap = flap;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWing;\nuniform float uFlap;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = uFlap + float(gl_InstanceID) * 1.7;
        float beat = sin(ph * 15.0) * step(0.0, sin(ph * 0.9));
        transformed.y += abs(aWing) * beat * 0.09 * sign(aWing) * sign(aWing);`);
  };
  birdMat.customProgramCacheKey = () => 'swallow';
  const nBirds = quality.tier === 'high' ? 9 : 6;
  const birds = new THREE.InstancedMesh(birdGeo, birdMat, nBirds);
  birds.frustumCulled = false;
  group.add(birds);
  const paths = [];
  for (let i = 0; i < nBirds; i++) {
    paths.push({
      cx: -55 + R() * 70, cz: -10 + R() * 50, r1: 10 + R() * 18, r2: 4 + R() * 8,
      f1: 0.18 + R() * 0.12, f2: 0.5 + R() * 0.4, p1: R() * 6.28, p2: R() * 6.28, h: 1.2 + R() * 3, hv: 0.8 + R() * 2,
    });
  }
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const birdPos = (p, t) => {
    const x = p.cx + Math.cos(t * p.f1 + p.p1) * p.r1 + Math.sin(t * p.f2 + p.p2) * p.r2;
    const z = p.cz + Math.sin(t * p.f1 * 1.3 + p.p1) * p.r1 * 0.8 + Math.cos(t * p.f2 * 0.8 + p.p2) * p.r2;
    const y = T.heightAt(x, z) + p.h + Math.sin(t * p.f2 * 1.7 + p.p1) * p.hv;
    return [x, Math.max(y, T.heightAt(x, z) + 0.6), z];
  };

  // ---------- butterflies ----------
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.02, 0, 0.035, 0.02, 0, 0.03, 0, 0, 0, 0.02, 0, -0.03, -0.02, 0, -0.035], 3));
  flyGeo.setAttribute('aWing', new THREE.Float32BufferAttribute([0, 1, 1, 0, -1, -1], 1));
  flyGeo.computeVertexNormals();
  const flyMat = new THREE.MeshLambertMaterial({ color: new THREE.Color(0.95, 0.95, 0.88), side: THREE.DoubleSide, emissive: new THREE.Color(0.08, 0.08, 0.07) });
  const flyFlap = { value: 0 };
  flyMat.onBeforeCompile = (s) => {
    s.uniforms.uFlap = flyFlap;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWing;\nuniform float uFlap;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float a = (0.5 + 0.5 * sin(uFlap * 22.0 + float(gl_InstanceID) * 2.3)) * 1.3;
        float w = abs(aWing);
        transformed.y += w * sin(a) * 0.035;
        transformed.z *= mix(1.0, cos(a), w);`);
  };
  flyMat.customProgramCacheKey = () => 'butterfly';
  const nFly = 4;
  const flies = new THREE.InstancedMesh(flyGeo, flyMat, nFly);
  flies.frustumCulled = false;
  group.add(flies);
  const flyState = [];
  for (let i = 0; i < nFly; i++) flyState.push({ x: 4 + R() * 12, z: -8 + R() * 26, y: 0.6, vx: 0, vz: 0, seed: R() * 100 });

  // ---------- dust and pollen hanging in the light ----------
  const nDust = quality.tier === 'high' ? 900 : 350;
  const dpos = new Float32Array(nDust * 3), dseed = new Float32Array(nDust);
  for (let i = 0; i < nDust; i++) { dpos[i * 3] = R() * 24 - 12; dpos[i * 3 + 1] = R() * 5; dpos[i * 3 + 2] = R() * 24 - 12; dseed[i] = R(); }
  const dgeo = new THREE.BufferGeometry();
  dgeo.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
  dgeo.setAttribute('aSeed', new THREE.BufferAttribute(dseed, 1));
  dgeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const dmat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uScale: { value: 600 } },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime, uScale;
      uniform vec3 uCam;
      varying float vA;
      const vec3 SUN_DIR = vec3(${SUN.x.toFixed(4)}, ${SUN.y.toFixed(4)}, ${SUN.z.toFixed(4)});
      void main() {
        vec3 p = position;
        p += vec3(sin(uTime * 0.21 + aSeed * 40.0), sin(uTime * 0.13 + aSeed * 17.0) * 0.6, cos(uTime * 0.17 + aSeed * 23.0)) * 0.8;
        p.x += uTime * 0.25;
        vec3 rel = mod(p - uCam + vec3(12.0, 1.0, 12.0), vec3(24.0, 5.0, 24.0)) - vec3(12.0, 1.0, 12.0);
        vec3 wp = uCam + rel;
        vec4 mv = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.0, (0.006 + aSeed * 0.006) * uScale / -mv.z);
        vec3 v = normalize(wp - cameraPosition);
        float back = pow(max(dot(v, SUN_DIR), 0.0), 6.0);
        float near = 1.0 - smoothstep(4.0, 12.0, length(rel));
        vA = back * near * (0.4 + 0.6 * sin(uTime * 2.0 + aSeed * 50.0) * 0.5 + 0.3);
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vec3(1.0, 0.92, 0.75) * vA * smoothstep(0.5, 0.0, d) * 1.4, 1.0);
      }
    `,
  });
  const dust = new THREE.Points(dgeo, dmat);
  dust.frustumCulled = false;
  group.add(dust);

  let t = 0;
  const update = (dt, camera, height) => {
    t += dt;
    flap.value = t;
    flyFlap.value = t;
    // swallows: look along the direction of travel, bank into turns
    for (let i = 0; i < nBirds; i++) {
      const p = paths[i];
      const a = birdPos(p, t), b = birdPos(p, t + 0.05);
      const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
      const yaw = Math.atan2(-dz, dx);
      const c = birdPos(p, t + 0.1);
      const turn = Math.atan2(-(c[2] - b[2]), c[0] - b[0]) - yaw;
      e.set(0, yaw, 0, 'YXZ');
      q.setFromEuler(e);
      const bank = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.max(-1, Math.min(1, -turn * 6)));
      const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(dy, Math.hypot(dx, dz)));
      q.multiply(pitch).multiply(bank);
      m4.compose(new THREE.Vector3(...a), q, new THREE.Vector3(1.4, 1.4, 1.4));
      birds.setMatrixAt(i, m4);
    }
    birds.instanceMatrix.needsUpdate = true;
    // butterflies: drunk walk over the front lawn, never higher than the hedge
    for (let i = 0; i < nFly; i++) {
      const f = flyState[i];
      const s = f.seed + t;
      f.vx += (Math.sin(s * 1.7) + Math.sin(s * 4.3) * 0.6) * dt * 1.6;
      f.vz += (Math.cos(s * 1.3) + Math.cos(s * 3.7) * 0.6) * dt * 1.6;
      f.vx *= 0.97; f.vz *= 0.97;
      f.x += f.vx * dt; f.z += f.vz * dt;
      if (f.x < 2 || f.x > 18) f.vx -= Math.sign(f.x - 10) * dt * 3;
      if (f.z < -10 || f.z > 20) f.vz -= Math.sign(f.z - 5) * dt * 3;
      const y = T.heightAt(f.x, f.z) + 0.35 + 0.5 * (0.5 + 0.5 * Math.sin(s * 2.1)) + Math.abs(Math.sin(s * 9)) * 0.08;
      e.set(0, Math.atan2(-f.vz, f.vx), 0, 'YXZ');
      q.setFromEuler(e);
      m4.compose(new THREE.Vector3(f.x, y, f.z), q, new THREE.Vector3(1.6, 1.6, 1.6));
      flies.setMatrixAt(i, m4);
    }
    flies.instanceMatrix.needsUpdate = true;
    dmat.uniforms.uTime.value = t;
    dmat.uniforms.uCam.value.copy(camera.position);
    dmat.uniforms.uScale.value = (height * 0.5) / Math.tan((camera.fov * Math.PI) / 360);
  };
  return { group, update, birdPositions: () => paths.map((p) => birdPos(p, t)) };
}
