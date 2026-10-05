import * as THREE from 'three';

/**
 * Cheap bee-vision effect. Bees are red-blind and see into the ultraviolet, so red is darkened,
 * blue/violet is boosted, and UV-guide flowers show a bullseye. One shared uniform drives every
 * patched material; no post-processing pass.
 */
export const beeVisionUniform = { value: 0 };
/** Shared wind uniforms: flowers sway with the simulated wind. */
export const windUniforms = { uWind: { value: 0.15 }, uTime: { value: 0 } };

export function setBeeVision(strength: number): void {
  beeVisionUniform.value = Math.min(1, Math.max(0, strength));
}

const COMMON = /* glsl */ `
  {
    vec3 c = gl_FragColor.rgb;
    float lum = dot(c, vec3(0.3, 0.55, 0.15));
    vec3 bee = vec3(c.r * 0.25, c.g * 0.9, min(1.0, c.b * 1.1 + c.r * 0.12));
    bee = mix(vec3(lum), bee, 0.85);
    gl_FragColor.rgb = mix(c, bee, uBeeVision * 0.8);
  }
`;

export function patchMaterial<M extends THREE.Material>(mat: M, opts: { uvGuide?: boolean; sway?: 'stem' | 'head' } = {}): M {
  const guide = opts.uvGuide !== undefined;
  const hasGuide = opts.uvGuide === true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uBeeVision = beeVisionUniform;
    if (opts.sway) {
      shader.uniforms.uWind = windUniforms.uWind;
      shader.uniforms.uTime = windUniforms.uTime;
      // Sway is a function of where the flower stands, so neighbours move out of step. A stem bends
      // more towards its tip; a head is carried by the tip of its stem.
      const sway = 'sin(uTime * 1.7 + instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27) * (0.05 + uWind * 0.5)';
      const offset =
        opts.sway === 'stem'
          ? `transformed.x += ${sway} * position.y;\n    transformed.z += ${sway} * 0.5 * position.y;`
          : `float sc = length(instanceMatrix[0].xyz);\n    transformed.x += ${sway} * 1.0 / max(sc, 0.05);\n    transformed.z += ${sway} * 0.5 / max(sc, 0.05);`;
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'uniform float uWind;\nuniform float uTime;\nvoid main() {')
        .replace('#include <begin_vertex>', `#include <begin_vertex>\n    ${offset}`);
    }
    shader.fragmentShader = 'uniform float uBeeVision;\n' + shader.fragmentShader;
    if (guide) {
      shader.vertexShader = shader.vertexShader
        .replace('void main() {', 'attribute float guide;\nvarying float vGuide;\nvoid main() {\n  vGuide = guide;');
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        'varying float vGuide;\nvoid main() {',
      );
    }
    const guideCode = hasGuide
      ? /* glsl */ `
      {
        vec3 uv = mix(vec3(0.78, 0.6, 1.0), vec3(0.22, 0.04, 0.5), vGuide);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uv, uBeeVision * 0.8);
      }
    `
      : '';
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      '#include <dithering_fragment>\n' + guideCode + COMMON,
    );
  };
  mat.customProgramCacheKey = () => `beevision-${guide ? (hasGuide ? 'uv' : 'guide') : 'plain'}-${opts.sway ?? 'still'}`;
  return mat;
}
