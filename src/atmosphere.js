import * as THREE from 'three';
import { NOISE } from './glsl.js';

// One moment: a clear July Saturday, a little before 8 in the morning.
// The sun is low over the mountains to the east-northeast.
const deg = Math.PI / 180;
const SUN_AZ = 76 * deg;
const SUN_ALT = 15.5 * deg;
export const SUN = new THREE.Vector3(
  Math.cos(SUN_ALT) * Math.sin(SUN_AZ),
  Math.sin(SUN_ALT),
  -Math.cos(SUN_ALT) * Math.cos(SUN_AZ),
).normalize();

export const SUN_COLOR = new THREE.Color(1.0, 0.9, 0.76);
export const SKY_LIGHT = new THREE.Color(0.56, 0.68, 0.9);
export const GROUND_LIGHT = new THREE.Color(0.42, 0.4, 0.27);

const v3 = (v) => `vec3(${v.x.toFixed(6)}, ${v.y.toFixed(6)}, ${v.z.toFixed(6)})`;

// The sky gradient and the haze share one function so distance fades into the sky exactly.
export const SKY_GLSL = /* glsl */ `
const vec3 SUN_DIR = ${v3(SUN)};
vec3 skyColor(vec3 dir) {
  float y = max(dir.y, 0.0);
  float mu = dot(dir, SUN_DIR);
  float t = pow(y, 0.42);
  vec3 zen = vec3(0.085, 0.215, 0.60);
  vec3 hor = vec3(0.55, 0.66, 0.80);
  vec3 col = mix(hor, zen, t);
  float horiz = exp(-y * 7.0);
  float sunSide = pow(clamp(mu * 0.5 + 0.5, 0.0, 1.0), 5.0);
  col = mix(col, vec3(1.0, 0.84, 0.64), horiz * sunSide * 0.62);
  float anti = pow(clamp(-mu, 0.0, 1.0), 2.0);
  col += vec3(0.07, 0.035, 0.06) * horiz * anti;
  float m = max(mu, 0.0);
  col += vec3(1.0, 0.86, 0.66) * (pow(m, 10.0) * 0.32 + pow(m, 90.0) * 1.1 + pow(m, 900.0) * 3.0);
  return col * 1.25;
}
vec3 aerial(vec3 col, vec3 wpos) {
  vec3 rel = wpos - cameraPosition;
  float d = length(rel);
  vec3 dir = rel / max(d, 0.001);
  const float H = 650.0;
  float k = rel.y / H;
  float hf = exp(-max(cameraPosition.y, 0.0) / H) * (abs(k) > 0.002 ? (1.0 - exp(-k)) / k : 1.0);
  float od = 0.000105 * d * hf;
  vec3 ext = 1.0 - exp(-od * vec3(0.82, 1.0, 1.22));
  vec3 fc = skyColor(normalize(vec3(dir.x, max(dir.y, 0.0) * 0.4 + 0.02, dir.z)));
  fc += vec3(1.0, 0.86, 0.66) * pow(max(dot(dir, SUN_DIR), 0.0), 7.0) * 0.45;
  return mix(col, fc, ext);
}
`;

// Replace three's fog with height-aware aerial perspective, applied in linear light
// before tone mapping so it matches the sky in every render path.
export function installAtmosphere() {
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\nvarying vec3 vFogWorld;\n#endif\n';
  C.fog_vertex = `#ifdef USE_FOG
{
  vec4 fw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  fw = instanceMatrix * fw;
  #endif
  fw = modelMatrix * fw;
  vFogWorld = fw.xyz;
}
#endif
`;
  C.fog_pars_fragment = `#ifdef USE_FOG\nvarying vec3 vFogWorld;\n${SKY_GLSL}\n#endif\n`;
  C.fog_fragment = '';
  C.tonemapping_fragment = `#ifdef USE_FOG
gl_FragColor.rgb = aerial(gl_FragColor.rgb, vFogWorld);
#endif
#if defined( TONE_MAPPING )
gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif
`;
}

export function makeSky(quality) {
  const geo = new THREE.SphereGeometry(1, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    uniforms: { uTime: { value: 0 } },
    defines: { CLOUD_OCTAVES: quality.tier === 'high' ? 5 : 4 },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vDir;
      ${NOISE}
      ${SKY_GLSL}
      float fbmC(vec2 p) {
        float s = 0.0, a = 0.5;
        for (int i = 0; i < CLOUD_OCTAVES; i++) { s += a * vnoise(p); p = p * 2.02 + vec2(11.7, 5.3); a *= 0.5; }
        return s;
      }
      float cloud(vec2 p) {
        float n = fbmC(p * 0.42);
        float cov = 0.6 + 0.1 * vnoise(p * 0.05 + 7.0);
        return smoothstep(cov, cov + 0.16, n);
      }
      void main() {
        vec3 dir = normalize(vDir);
        vec3 col = skyColor(dir);
        float mu = dot(dir, SUN_DIR);
        col += vec3(1.0, 0.93, 0.82) * smoothstep(0.999982, 0.999992, mu) * 60.0;
        if (dir.y > 0.004) {
          float t = 2600.0 / dir.y;
          vec2 p = dir.xz * t * 0.001 + vec2(3.0 + uTime * 0.0035, -5.0);
          float d = cloud(p);
          if (d > 0.002) {
            float far = clamp(t / 70000.0, 0.0, 1.0);
            float d2 = cloud(p + SUN_DIR.xz * 0.3);
            float lit = clamp(1.0 - (d2 - d) * 1.4 - d2 * 0.35, 0.0, 1.0);
            vec3 cc = mix(vec3(0.5, 0.58, 0.72), vec3(1.15, 1.08, 0.98), lit);
            cc += vec3(1.0, 0.88, 0.68) * pow(max(mu, 0.0), 5.0) * (1.0 - d) * 1.3;
            cc = mix(cc * 1.25, skyColor(dir), far * 0.75);
            col = mix(col, cc, d * (1.0 - far * far) * 0.92);
          }
        }
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.onBeforeRender = (r, s, cam) => mesh.position.copy(cam.position);
  return { mesh, update: (t) => { mat.uniforms.uTime.value = t; } };
}
