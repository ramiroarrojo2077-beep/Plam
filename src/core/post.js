// Post-procesado: bloom, tone mapping, SMAA y una pasada final con grano, viñeta,
// aberración cromática, distorsión de lente, efecto de cámara de seguridad y estática.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

export const QUALITY = {
  low: { pixelRatio: 0.6, shadow: 512, bloom: false, smaa: false, aniso: 2 },
  medium: { pixelRatio: 0.8, shadow: 1024, bloom: true, smaa: false, aniso: 4 },
  high: { pixelRatio: 1, shadow: 1024, bloom: true, smaa: true, aniso: 8 },
  ultra: { pixelRatio: 2, shadow: 2048, bloom: true, smaa: true, aniso: 16 },
};

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(1, 1) },
    camMode: { value: 0 },
    staticAmt: { value: 0 },
    grain: { value: 0.06 },
    vignette: { value: 0.85 },
    aberration: { value: 0.004 },
    distort: { value: 0.04 },
    glitch: { value: 0 },
    flash: { value: 0 },
    fade: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, camMode, staticAmt, grain, vignette, aberration, distort, glitch, flash, fade;
    uniform vec2 resolution;
    varying vec2 vUv;
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      float k = distort + camMode * 0.14;
      uv = 0.5 + c * (1.0 - k * 0.3 + k * r2 * 1.2);
      float tt = floor(time * 24.0);
      float line = floor(uv.y * 160.0);
      float tear = step(1.0 - glitch * 0.3, hash(vec2(line * 0.37, tt)));
      uv.x += (hash(vec2(line, tt + 1.0)) - 0.5) * 0.09 * glitch * tear;
      uv.x += (hash(vec2(tt, 3.0)) - 0.5) * 0.012 * glitch;
      uv.y += (hash(vec2(tt, 7.0)) - 0.5) * 0.006 * glitch;
      vec2 dir = (uv - 0.5) * (aberration + glitch * 0.02) * (0.5 + r2 * 3.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir).b;

      // Gradación general: sombras ligeramente frías, altas cálidas
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * vec3(0.92, 0.98, 1.08), smoothstep(0.35, 0.0, lum) * 0.6);
      col = mix(vec3(lum), col, 0.88);

      // Modo cámara de seguridad
      vec3 camCol = mix(vec3(lum), col, 0.5) * vec3(0.93, 1.04, 0.96);
      camCol *= 0.86 + 0.14 * sin(uv.y * resolution.y * 1.15);
      float band = smoothstep(0.0, 0.06, abs(fract(uv.y * 0.55 - time * 0.11) - 0.5));
      camCol *= 0.9 + 0.1 * band;
      camCol = pow(max(camCol, 0.0), vec3(0.85)) * 1.15;
      col = mix(col, camCol, camMode);

      float n = hash(uv * resolution + fract(time * 13.7) * 571.0);
      float sb = smoothstep(0.82, 1.0, sin(uv.y * 11.0 + time * 7.0) * 0.5 + 0.5) * camMode * 0.12;
      col = mix(col, vec3(n) * 0.9, clamp(staticAmt + sb, 0.0, 1.0));
      col += (n - 0.5) * grain * (1.0 + camMode * 1.5);

      float v = smoothstep(0.98, 0.22, length(c * vec2(1.0, 0.92)) * 1.12);
      col *= mix(1.0, v, vignette);
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) col = vec3(0.0);
      col = mix(col, vec3(1.0), flash);
      col *= 1.0 - fade;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.55, 0.45, 0.9);
    this.output = new OutputPass();
    this.smaa = new SMAAPass();
    this.final = new ShaderPass(FinalShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.composer.addPass(this.smaa);
    this.composer.addPass(this.final);
    this.u = this.final.uniforms;
  }

  setSize(w, h, pr) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.u.resolution.value.set(w * pr, h * pr);
  }

  setQuality(q) {
    this.bloom.enabled = q.bloom;
    this.smaa.enabled = q.smaa;
  }

  render(dt) {
    this.u.time.value += dt;
    this.composer.render(dt);
  }
}
