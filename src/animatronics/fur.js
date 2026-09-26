// Pelaje volumétrico por capas ("shells"): cada malla de pelaje se repite N veces desplazada
// a lo largo de la normal en un único draw call instanciado. En cada capa se descartan los
// píxeles donde el mechón es más corto que la altura de la capa, con raíces oscurecidas y
// puntas más claras, y una ligera caída por gravedad.
import * as THREE from 'three';

const cache = new WeakMap();

function shellMaterial(base, strands, length) {
  let m = cache.get(base);
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: base.map,
    roughness: 1,
    roughnessMap: base.roughnessMap,
    side: base.side,
  });
  const triScale = base.userData.triScale || { value: 4 };
  m.userData.furLen = { value: length };
  m.customProgramCacheKey = () => 'furshell';
  m.onBeforeCompile = (shader) => {
    shader.uniforms.triScale = triScale;
    shader.uniforms.strandMap = { value: strands };
    shader.uniforms.furLen = m.userData.furLen;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aShell;\nuniform float furLen;\nvarying float vShell;\nvarying vec3 vTriPos;\nvarying vec3 vTriNrm;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vShell = aShell;
vTriPos = position;
vTriNrm = normal;
transformed += normal * aShell * furLen;
transformed.y -= aShell * aShell * furLen * 0.45;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D strandMap;
uniform float triScale;
varying float vShell;
varying vec3 vTriPos;
varying vec3 vTriNrm;`,
      )
      .replace(
        '#include <map_fragment>',
        `vec3 an = abs(normalize(vTriNrm));
vec3 tb = pow(an, vec3(4.0)); tb /= (tb.x + tb.y + tb.z);
vec3 tp = vTriPos * triScale;
vec4 texel = texture2D(map, tp.zy) * tb.x + texture2D(map, tp.xz + 0.37) * tb.y + texture2D(map, tp.xy + 0.71) * tb.z;
vec3 sp = vTriPos * triScale * 2.6;
vec2 suv = an.x > max(an.y, an.z) ? sp.zy : (an.y > an.z ? sp.xz : sp.xy);
vec4 strand = texture2D(strandMap, suv);
if (strand.r < vShell * 0.92 + 0.04) discard;
diffuseColor *= texel;
diffuseColor.rgb *= mix(0.62, 1.18, vShell) * (0.86 + strand.g * 0.28);`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness;
roughnessFactor *= clamp(texture2D(roughnessMap, tp.xy).g + 0.1, 0.0, 1.0);`,
      );
  };
  cache.set(base, m);
  return m;
}

export function setFurShells(root, furMats, strands, layers, length = 0.013) {
  const old = [];
  root.traverse((o) => {
    if (o.userData.furShell) old.push(o);
  });
  for (const o of old) o.parent.remove(o);
  if (!layers) return;
  const targets = [];
  root.traverse((o) => {
    if (o.isMesh && !o.userData.furShell && furMats.includes(o.material)) targets.push(o);
  });
  const shellIdx = new Float32Array(layers);
  for (let i = 0; i < layers; i++) shellIdx[i] = (i + 1) / layers;
  const aShell = new THREE.InstancedBufferAttribute(shellIdx, 1);
  for (const o of targets) {
    const src = o.geometry;
    const g = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'uv', 'color']) if (src.attributes[name]) g.setAttribute(name, src.attributes[name]);
    if (src.index) g.setIndex(src.index);
    g.setAttribute('aShell', aShell);
    g.boundingSphere = src.boundingSphere ? src.boundingSphere.clone() : null;
    if (!g.boundingSphere) {
      src.computeBoundingSphere();
      g.boundingSphere = src.boundingSphere.clone();
    }
    g.boundingSphere.radius += length * 2;
    const inst = new THREE.InstancedMesh(g, shellMaterial(o.material, strands, length), layers);
    inst.castShadow = false;
    inst.receiveShadow = true;
    inst.userData.furShell = true;
    inst.frustumCulled = true;
    inst.computeBoundingSphere = function () {
      this.boundingSphere = g.boundingSphere.clone();
    };
    inst.boundingSphere = g.boundingSphere.clone();
    o.add(inst);
  }
}
