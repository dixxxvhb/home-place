import * as THREE from 'three';
import { MAP } from './terrain.js';
import { WIND, translucentLambert } from './foliage.js';
import { NOISE } from './glsl.js';
import { SUN } from './atmosphere.js';

const NO_FLIP = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');

// One blade: three segments and a tip. aShape = (side, t).
function bladeGeometry(segments) {
  const shape = [];
  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    shape.push(-1, t, 1, t);
  }
  shape.push(0, 1);
  const idx = [];
  for (let i = 0; i < segments - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  const last = (segments - 1) * 2;
  idx.push(last, last + 1, segments * 2);
  return { shape, idx, count: segments * 2 + 1 };
}

const shared = {
  uPlayer: { value: new THREE.Vector3() },
};

function grassLayer({ count, radius, inner, segments, widthScale, heightScale, T, maps, seed }) {
  const blade = bladeGeometry(segments);
  const g = new THREE.InstancedBufferGeometry();
  const pos = new Float32Array(blade.count * 3);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aShape', new THREE.Float32BufferAttribute(blade.shape, 2));
  g.setIndex(blade.idx);
  const S = radius * 2;
  const roots = new Float32Array(count * 3);
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < count; i++) {
    roots[i * 3] = rand() * S;
    roots[i * 3 + 1] = rand() * S;
    roots[i * 3 + 2] = rand();
  }
  g.setAttribute('aRoot', new THREE.InstancedBufferAttribute(roots, 3));
  g.instanceCount = count;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

  const uniforms = {
    uTime: WIND.uTime,
    uGust: WIND.uGust,
    uPlayer: shared.uPlayer,
    uCam: { value: new THREE.Vector3() },
    uSize: { value: S },
    uRadius: { value: new THREE.Vector2(inner, radius) },
    uShape: { value: new THREE.Vector2(widthScale, heightScale) },
    uHeight: { value: T.heightTex },
    uParam: { value: maps.paramTex },
    uColor: { value: maps.colorTex },
    uMapRect: { value: new THREE.Vector4(MAP.x0, MAP.z0, MAP.size, 1 / MAP.size) },
    uHN: { value: T.N },
  };

  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aRoot;
        attribute vec2 aShape;
        uniform float uTime, uGust, uSize, uHN;
        uniform vec3 uCam, uPlayer;
        uniform vec2 uRadius, uShape;
        uniform sampler2D uHeight, uParam, uColor;
        uniform vec4 uMapRect;
        varying vec3 vGrass;
        varying float vTip;
        varying float vGlint;
        ${NOISE}`)
      .replace('#include <beginnormal_vertex>', `
        vec2 rel = mod(aRoot.xy - uCam.xz + uSize * 0.5, uSize) - uSize * 0.5;
        vec2 root = uCam.xz + rel;
        float dist = length(rel);
        vec2 muv = (root - uMapRect.xy) * uMapRect.w;
        vec4 prm = textureLod(uParam, muv, 0.0);
        vec3 gcol = textureLod(uColor, muv, 0.0).rgb;
        float groundY = textureLod(uHeight, (root - uMapRect.xy + 0.5) / uHN, 0.0).r;
        float seed = aRoot.z;
        float h1 = hash12(root * 1.31 + seed);
        float h2 = hash12(root * 0.77 + seed * 3.1);
        float tallness = prm.r;
        float tall = smoothstep(0.15, 0.3, tallness);
        float patchN = vnoise(root * 0.35) * 0.7 + vnoise(root * 1.7) * 0.3;
        float H = tallness * uShape.y * mix(0.7 + 0.6 * h1, 0.35 + 1.25 * patchN * (0.6 + 0.8 * h1), tall);
        float inMap = step(0.0, muv.x) * step(0.0, muv.y) * step(muv.x, 1.0) * step(muv.y, 1.0);
        float keep = step(seed, prm.g) * inMap;
        float fadeOut = 1.0 - smoothstep(uRadius.y * 0.78, uRadius.y * 0.98, dist);
        float fadeIn = smoothstep(uRadius.x * 0.7, uRadius.x, dist);
        float k = keep * fadeOut * (uRadius.x > 0.0 ? fadeIn : 1.0);
        H *= k;
        float W = mix(0.011, 0.017, tall) * uShape.x * (0.75 + 0.5 * h2) * (1.0 - aShape.y * 0.82) * step(0.001, k);
        float ang = seed * 43.7;
        vec2 dir = vec2(cos(ang), sin(ang));
        vec2 perp = vec2(-dir.y, dir.x);
        // mowing: lawn blades lean with the stripe they were cut in
        float stripe = fract(root.x / 1.1) < 0.5 ? 1.0 : -1.0;
        vec2 lean = mix(vec2(0.0, stripe * 0.35) + dir * 0.12, dir * (0.2 + 0.4 * h2), tall);
        float wave = sin(uTime * 1.7 - dot(root, vec2(0.21, 0.13)) + h1 * 1.5) * 0.6 + sin(uTime * 2.9 - root.x * 0.45 + root.y * 0.3) * 0.4;
        float gustField = 0.55 + 0.45 * sin(uTime * 0.4 - root.x * 0.04 - root.y * 0.025);
        vec2 windv = vec2(${WIND.dir.x.toFixed(3)}, ${WIND.dir.z.toFixed(3)}) * uGust * gustField * (0.35 + 0.35 * wave) * mix(0.25, 1.0, tall);
        vec2 away = root - uPlayer.xz;
        float pd = length(away);
        vec2 push = pd > 0.001 ? away / pd * (1.0 - smoothstep(0.15, 0.6, pd)) * 1.1 : vec2(0.0);
        vec2 bendDir = lean + windv + push;
        float t = aShape.y;
        float bend = t * t;
        float bl = length(bendDir);
        vec3 grassPos = vec3(
          root.x + perp.x * aShape.x * W * 0.5 + bendDir.x * bend * H,
          groundY + H * t * (1.0 - 0.35 * bend * min(bl, 1.2)),
          root.y + perp.y * aShape.x * W * 0.5 + bendDir.y * bend * H);
        vec3 objectNormal = normalize(vec3(bendDir.x * 0.35 + dir.x * 0.25, 1.0, bendDir.y * 0.35 + dir.y * 0.25));
        // color: the painted ground under it, darker at the root, sun-bleached tips in the tall grass
        float dry = smoothstep(0.55, 0.9, h2 * patchN + 0.25) * tall;
        vec3 c = gcol * (0.85 + 0.35 * h1);
        c = mix(c, vec3(0.42, 0.36, 0.17), dry * 0.75 * t);
        c = mix(c * 0.42, c * 1.18, smoothstep(0.0, 0.9, t));
        vGrass = c;
        vTip = t;
        // dew: a few blade tips on the lawn catch the sun
        vGlint = step(0.975, hash12(root * 3.7 + seed * 11.0)) * (1.0 - tall) * smoothstep(0.5, 0.9, t) * (1.0 - smoothstep(6.0, 18.0, dist));
      `)
      .replace('#include <begin_vertex>', 'vec3 transformed = grassPos;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrass;\nvarying float vTip;\nvarying float vGlint;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb *= vGrass;')
      .replace('#include <normal_fragment_begin>', NO_FLIP)
      .replace('#include <lights_lambert_pars_fragment>', translucentLambert(0.55, 'vec3(1.0, 1.15, 0.45)',
        'reflectedLight.directDiffuse += directLight.color * vGlint * pow( saturate( dot( reflect( - directLight.direction, geometryNormal ), geometryViewDir ) ), 18.0 ) * 6.0;'));
  };
  mat.customProgramCacheKey = () => 'grass';
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return { mesh, uniforms };
}

export function buildGrass(T, maps, quality) {
  const near = grassLayer({ ...quality.grassNear, inner: 0, segments: 4, widthScale: 1, heightScale: 1, T, maps, seed: 12345 });
  const far = grassLayer({ ...quality.grassFar, inner: quality.grassNear.radius, segments: 3, widthScale: 2.2, heightScale: 1.05, T, maps, seed: 777 });
  const group = new THREE.Group();
  group.add(near.mesh, far.mesh);
  const update = (camera, player) => {
    near.uniforms.uCam.value.copy(camera.position);
    far.uniforms.uCam.value.copy(camera.position);
    if (player) shared.uPlayer.value.copy(player);
    else shared.uPlayer.value.set(1e5, 0, 1e5);
  };
  return { group, update };
}
