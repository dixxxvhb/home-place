import * as THREE from 'three';
import { NOISE } from './glsl.js';
import { SKY_GLSL } from './atmosphere.js';

const srgb = (r, g, b) => new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);

// Surface patterns are computed from world position, so geometry never needs careful UVs.
// pattern: lap (horizontal siding), ribs (steel panels, ribs vertical on walls),
// roofribs (steel roof, ribs running down the slope), shingle (uses uv: u along ridge, v down slope),
// board (vertical boards, weathered), concrete, none.
export function patternMaterial({ color, pattern = 'none', rough = 0.85, metal = 0, ribAxis = 'x', scale = 1, side = THREE.FrontSide }) {
  const mat = new THREE.MeshStandardMaterial({ color: Array.isArray(color) ? srgb(...color) : color, roughness: rough, metalness: metal, side });
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;\nvarying vec2 vUv2;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWP = (modelMatrix * vec4(position, 1.0)).xyz;
        vWN = normalize(mat3(modelMatrix) * normal);
        vUv2 = uv;`);
    let frag = '';
    let nrm = '';
    if (pattern === 'lap') {
      frag = `
        float lapc = (vWP.y + 0.03) / 0.2;
        float lap = fract(lapc);
        float aaL = clamp(fwidth(lapc) * 3.0, 0.0, 1.0);
        float under = mix(smoothstep(0.0, 0.16, lap), 0.88, aaL);
        diffuseColor.rgb *= mix(0.62, 1.0, under) * (0.97 + 0.06 * vnoise(vWP.xz * 3.0 + vWP.y));
      `;
      nrm = `
        if (abs(vWN.y) < 0.5) {
          float lc2 = (vWP.y + 0.03) / 0.2;
          float lap2 = fract(lc2);
          float fadeN = 1.0 - clamp(fwidth(lc2) * 3.0, 0.0, 1.0);
          vec3 nW = normalize(vWN + vec3(0.0, (-0.55 * (1.0 - smoothstep(0.0, 0.18, lap2)) + 0.12) * fadeN, 0.0));
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }
      `;
    } else if (pattern === 'ribs' || pattern === 'roofribs') {
      const coord = pattern === 'ribs' ? '(abs(vWN.x) > 0.5 ? vWP.z : vWP.x)' : `vWP.${ribAxis}`;
      const tan = pattern === 'ribs' ? '(abs(vWN.x) > 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0))' : (ribAxis === 'x' ? 'vec3(1.0,0.0,0.0)' : 'vec3(0.0,0.0,1.0)');
      frag = `
        float rc = ${coord} / ${(0.229 * scale).toFixed(3)};
        float rf = fract(rc);
        float rib = smoothstep(0.0, 0.05, rf) * (1.0 - smoothstep(0.17, 0.22, rf));
        diffuseColor.rgb *= 0.94 + 0.08 * vnoise(vWP.xz * 0.6 + vWP.y * 0.4);
      `;
      nrm = `
        {
          float rc2 = ${coord} / ${(0.229 * scale).toFixed(3)};
          float f = fract(rc2);
          float slope = (f < 0.05) ? 1.0 : (f < 0.17 ? 0.0 : (f < 0.22 ? -1.0 : 0.0));
          float minor = sin(rc2 * 6.2831 * 3.0) * 0.08;
          float fadeR = 1.0 - clamp(fwidth(rc2) * 2.5, 0.0, 1.0);
          vec3 t = ${tan};
          vec3 nW = normalize(normalize(vWN) + t * (slope * 0.9 + minor) * fadeR);
          normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        }
      `;
    } else if (pattern === 'shingle') {
      frag = `
        float rowc = vUv2.y / 0.143;
        float row = floor(rowc);
        float rv = fract(rowc);
        float aaS = clamp(fwidth(rowc) * 2.5, 0.0, 1.0);
        rv = mix(rv, 0.6, aaS);
        float tab = floor(vUv2.x / 0.33 + row * 0.5);
        float hv = hash12(vec2(tab, row));
        diffuseColor.rgb *= (0.84 + 0.3 * hv) * mix(0.55, 1.0, smoothstep(0.0, 0.12, rv));
        diffuseColor.rgb *= 0.9 + 0.2 * vnoise(vUv2 * 9.0);
        float gap = smoothstep(0.0, 0.012, abs(fract(vUv2.x / 0.33 + row * 0.5) - 0.5) * 0.33);
        diffuseColor.rgb *= mix(0.6, 1.0, 1.0 - (1.0 - gap) * step(0.35, rv));
      `;
    } else if (pattern === 'board') {
      frag = `
        float bc = (abs(vWN.x) > 0.5 ? vWP.z : vWP.x) / 0.3;
        float bf = fract(bc);
        float bid = floor(bc);
        diffuseColor.rgb *= (0.78 + 0.32 * hash12(vec2(bid, 3.0))) * mix(0.45, 1.0, smoothstep(0.0, 0.06, bf) * (1.0 - smoothstep(0.94, 1.0, bf)));
        diffuseColor.rgb *= 0.8 + 0.35 * vnoise(vec2(bid * 7.0, vWP.y * 1.5)) * vnoise(vec2(bc * 2.0, vWP.y * 9.0));
      `;
    } else if (pattern === 'birch') {
      frag = `
        float ang = atan(vWN.z, vWN.x);
        float lent = smoothstep(0.62, 0.7, vnoise(vec2(ang * 3.0, vWP.y * 11.0)) * vnoise(vec2(ang * 1.3 + 4.0, vWP.y * 2.0)) * 1.6);
        float scar = smoothstep(0.7, 0.8, vnoise(vec2(ang * 2.0, vWP.y * 1.3 + 9.0)));
        diffuseColor.rgb *= (1.0 - 0.8 * max(lent, scar * 0.85)) * (0.9 + 0.12 * vnoise(vec2(ang * 8.0, vWP.y * 30.0)));
      `;
    } else if (pattern === 'brick') {
      frag = `
        float bc = (abs(vWN.x) > 0.5 ? vWP.z : vWP.x);
        float row = floor(vWP.y / 0.075);
        float bx = fract(bc / 0.2 + row * 0.5);
        float by = fract(vWP.y / 0.075);
        float mortar = step(bx, 0.05) + step(by, 0.12);
        float shade = 0.82 + 0.3 * hash12(vec2(floor(bc / 0.2 + row * 0.5), row));
        diffuseColor.rgb = mix(diffuseColor.rgb * shade, vec3(0.42, 0.4, 0.36), clamp(mortar, 0.0, 1.0));
      `;
    } else if (pattern === 'louver') {
      frag = `
        float lv = fract(vWP.y / 0.055);
        diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 0.3, lv));
      `;
    } else if (pattern === 'hay') {
      frag = `
        vec2 hp = vec2((abs(vWN.x) > 0.5 ? vWP.z : vWP.x) * 3.0, vWP.y * 40.0);
        float fib = vnoise(hp * vec2(1.0, 0.25)) * 0.6 + vnoise(hp * vec2(4.0, 0.6)) * 0.4;
        diffuseColor.rgb *= 0.7 + 0.5 * fib;
      `;
    } else if (pattern === 'concrete') {
      frag = `
        diffuseColor.rgb *= 0.88 + 0.16 * vnoise(vWP.xz * 4.0 + vWP.y * 3.0) + 0.06 * hash12(floor(vWP.xz * 60.0 + vWP.y * 40.0));
      `;
    } else if (pattern === 'paneldoor') {
      frag = `
        float pc = (abs(vWN.x) > 0.5 ? vWP.z : vWP.x);
        float sec = fract(vWP.y / 0.575);
        float groove = smoothstep(0.0, 0.03, sec) * (1.0 - smoothstep(0.97, 1.0, sec));
        float pan = fract(pc / 0.61);
        float inset = smoothstep(0.08, 0.12, pan) * (1.0 - smoothstep(0.88, 0.92, pan)) * smoothstep(0.15, 0.2, sec) * (1.0 - smoothstep(0.8, 0.85, sec));
        diffuseColor.rgb *= mix(0.55, 1.0, groove) * (1.0 - inset * 0.07);
      `;
    } else if (pattern === 'bark') {
      frag = `
        float bk = vnoise(vec2(atan(vWN.z, vWN.x) * 6.0, vWP.y * 1.2)) * vnoise(vec2(atan(vWN.z, vWN.x) * 14.0, vWP.y * 5.0));
        diffuseColor.rgb *= 0.65 + 0.7 * bk;
      `;
    }
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWP;\nvarying vec3 vWN;\nvarying vec2 vUv2;\n${NOISE}`)
      .replace('#include <map_fragment>', '#include <map_fragment>\n' + frag)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + nrm);
  };
  mat.customProgramCacheKey = () => 'pat-' + pattern + ribAxis + scale;
  return mat;
}

// Window glass: reflects the sky, with a dim room and pale curtains behind it.
export function glassMaterial() {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWP;
      varying vec3 vWN;
      void main() {
        vec3 transformed = position;
        vWP = (modelMatrix * vec4(position, 1.0)).xyz;
        vWN = normalize(mat3(modelMatrix) * normal);
        vec4 mvPosition = viewMatrix * vec4(vWP, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      varying vec3 vWP;
      varying vec3 vWN;
      ${NOISE}
      #ifndef USE_FOG
      ${SKY_GLSL}
      #endif
      void main() {
        vec3 n = normalize(vWN);
        vec3 v = normalize(vWP - cameraPosition);
        vec3 r = reflect(v, n);
        float fres = 0.08 + 0.92 * pow(1.0 - max(dot(-v, n), 0.0), 4.0);
        vec3 refl = skyColor(normalize(vec3(r.x, max(r.y, 0.02), r.z)));
        // near the horizon a window mostly reflects trees, fields and hills, not open sky
        vec3 land = mix(vec3(0.035, 0.05, 0.03), vec3(0.18, 0.21, 0.26), smoothstep(-0.05, 0.08, r.y));
        refl = mix(land, refl, smoothstep(0.04, 0.3, r.y));
        float curtain = smoothstep(0.35, 0.45, vnoise(vWP.xz * 3.0 + vWP.y * 0.5));
        vec3 room = mix(vec3(0.012, 0.012, 0.011), vec3(0.09, 0.085, 0.075), curtain * 0.7);
        vec3 col = mix(room, refl, fres * 0.8 + 0.1);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

export { srgb };
