import * as THREE from 'three';

// Shared clock and breeze for everything that moves in the wind.
export const WIND = {
  uTime: { value: 0 },
  uGust: { value: 0.6 },
  dir: new THREE.Vector3(0.86, 0, 0.5).normalize(),
};

const NO_FLIP = THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', '');

// Lambert plus light coming through thin leaves when you look toward the sun.
export function translucentLambert(amount, tint = 'vec3(1.0, 1.12, 0.55)') {
  return THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
    'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
    `reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
     float backLit = pow( saturate( dot( - geometryViewDir, directLight.direction ) ), 3.0 );
     float wrapLit = saturate( dot( - geometryNormal, directLight.direction ) ) * 0.45;
     reflectedLight.directDiffuse += directLight.color * ( backLit * 0.9 + wrapLit ) * ${amount.toFixed(3)} * material.diffuseColor * ${tint} * RECIPROCAL_PI;`,
  );
}

const WIND_VERTEX = /* glsl */ `
  {
    vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz;
    float gust = uGust * (0.65 + 0.35 * sin(uTime * 0.31 + wp0.x * 0.021) * sin(uTime * 0.19 + wp0.z * 0.017 + 1.3));
    float sway = sin(uTime * 1.1 + aWind.y + wp0.x * 0.13) * 0.6 + sin(uTime * 1.9 + aWind.y * 1.7 + wp0.z * 0.1) * 0.4;
    float flutter = sin(uTime * 6.5 + aWind.y * 13.0 + position.y * 2.7 + position.x * 1.9) * aWind.z;
    vec3 wdir = vec3(${WIND.dir.x.toFixed(3)}, 0.0, ${WIND.dir.z.toFixed(3)});
    transformed += (wdir * (sway * 0.11 + 0.06) + vec3(flutter * 0.02, flutter * 0.035, -flutter * 0.015)) * aWind.x * gust;
  }
`;

// Leaf cards. Normals come from the canopy shape, not the card, so a crown shades like a volume.
export function foliageMaterial(map, { translucency = 0.6, a2c = false } = {}) {
  const mat = new THREE.MeshLambertMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, alphaToCoverage: a2c });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = WIND.uTime;
    s.uniforms.uGust = WIND.uGust;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uGust;\nattribute vec3 aWind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_VERTEX);
    s.fragmentShader = s.fragmentShader
      .replace('#include <normal_fragment_begin>', NO_FLIP)
      .replace('#include <lights_lambert_pars_fragment>', translucentLambert(translucency));
  };
  mat.customProgramCacheKey = () => 'foliage' + translucency + a2c;
  return mat;
}

export function foliageDepthMaterial(map) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.42, side: THREE.DoubleSide });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = WIND.uTime;
    s.uniforms.uGust = WIND.uGust;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uGust;\nattribute vec3 aWind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + WIND_VERTEX);
  };
  mat.customProgramCacheKey = () => 'foliageDepth';
  return mat;
}
