// Biblioteca de materiales PBR construidos sobre las texturas procedurales.
import * as THREE from 'three';

export function createMaterials(T) {
  const M = {};
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const ns = (s) => new THREE.Vector2(s, s);

  M.floor = std({ map: T.floor.map, normalMap: T.floor.normal, normalScale: ns(0.7), roughnessMap: T.floor.rough, roughness: 1, metalness: 0 });
  M.floor.userData.uv = 1.6;

  M.wainscot = std({ map: T.wainscot.map, normalMap: T.wainscot.normal, normalScale: ns(0.8), roughnessMap: T.wainscot.rough, roughness: 1 });
  M.wainscot.userData.uv = [2.8, 1.4];

  M.plaster = std({ map: T.plaster.map, normalMap: T.plaster.normal, normalScale: ns(0.6), roughnessMap: T.plaster.rough, roughness: 1 });
  M.plaster.userData.uv = 2.2;
  M.plasterDark = std({ map: T.plaster.map, color: 0x77746e, normalMap: T.plaster.normal, roughnessMap: T.plaster.rough, roughness: 1 });
  M.plasterDark.userData.uv = 2.2;
  M.tileWall = std({ map: T.wainscot.map, color: 0xb0b8c0, normalMap: T.wainscot.normal, roughnessMap: T.wainscot.rough, roughness: 1 });
  M.tileWall.userData.uv = [2.8, 1.4];

  M.ceiling = std({ map: T.ceiling.map, normalMap: T.ceiling.normal, normalScale: ns(0.6), roughnessMap: T.ceiling.rough, roughness: 1 });
  M.ceiling.userData.uv = 1.2;

  M.wood = std({ map: T.wood.map, normalMap: T.wood.normal, normalScale: ns(0.6), roughnessMap: T.wood.rough, roughness: 1 });
  M.wood.userData.uv = 2.4;
  M.woodPanel = std({ map: T.wood.map, color: 0x6a4b3c, normalMap: T.wood.normal, roughnessMap: T.wood.rough, roughness: 1 });
  M.woodPanel.userData.uv = 1.2;
  M.deskWood = std({ map: T.wood.map, color: 0xb08a6a, normalMap: T.wood.normal, roughnessMap: T.wood.rough, roughness: 0.9 });
  M.deskWood.userData.uv = 1.6;

  M.concrete = std({ map: T.concrete.map, normalMap: T.concrete.normal, roughnessMap: T.concrete.rough, roughness: 1 });
  M.concrete.userData.uv = 3;

  M.curtainPurple = phys({
    map: T.curtainPurple.map,
    normalMap: T.curtainPurple.normal,
    roughnessMap: T.curtainPurple.rough,
    roughness: 1,
    sheen: 1,
    sheenColor: new THREE.Color(0xb080d0),
    sheenRoughness: 0.35,
    side: THREE.DoubleSide,
  });
  M.curtainRed = phys({
    map: T.curtainRed.map,
    normalMap: T.curtainRed.normal,
    roughnessMap: T.curtainRed.rough,
    roughness: 1,
    sheen: 1,
    sheenColor: new THREE.Color(0xff8080),
    sheenRoughness: 0.35,
    side: THREE.DoubleSide,
  });
  M.backdrop = phys({
    map: T.curtainNavy.map,
    normalMap: T.curtainNavy.normal,
    roughness: 0.9,
    sheen: 0.6,
    sheenColor: new THREE.Color(0x8090ff),
    sheenRoughness: 0.4,
  });

  M.cloth = phys({ map: T.cloth.map, normalMap: T.cloth.normal, roughness: 0.95, sheen: 0.5, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.6 });
  M.door = std({ map: T.door.map, normalMap: T.door.normal, normalScale: ns(1), roughnessMap: T.door.rough, roughness: 1, metalness: 0.55 });

  M.metal = std({ map: T.metal.map, color: 0x9a9a9a, roughnessMap: T.metal.rough, normalMap: T.metal.normal, normalScale: ns(0.4), metalness: 0.9, roughness: 1.35 });
  M.metal.userData.uv = 0.6;
  M.darkMetal = std({ color: 0x55565a, map: T.metal.map, roughnessMap: T.metal.rough, metalness: 0.9, roughness: 1 });
  M.darkMetal.userData.uv = 0.6;
  M.chrome = std({ color: 0xd8d8d8, metalness: 1, roughness: 0.18 });
  M.rubber = std({ color: 0x141414, roughness: 0.85 });
  M.plasticBeige = std({ color: 0xc9bfa2, roughness: 0.55 });
  M.plasticBlack = std({ color: 0x121212, roughness: 0.4 });
  M.plasticRed = phys({ color: 0x8a0d10, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  M.paintedMetal = std({ color: 0x59605c, map: T.metal.map, roughnessMap: T.metal.rough, roughness: 1, metalness: 0.45 });
  M.paintedMetal.userData.uv = 0.8;
  M.trim = std({ color: 0x2b2725, roughness: 0.55, metalness: 0.2 });
  M.glass = phys({ color: 0xa8bcb8, transparent: true, opacity: 0.16, roughness: 0.06, metalness: 0, envMapIntensity: 2, depthWrite: false });
  M.cardboard = std({ color: 0x8e6e45, roughness: 0.95, map: T.cloth.map });
  M.chair = std({ color: 0x4b4f53, map: T.metal.map, roughnessMap: T.metal.rough, metalness: 0.6, roughness: 1 });
  M.chair.userData.uv = 0.6;
  M.chairSeat = std({ color: 0x5c1616, roughness: 0.55 });
  M.porcelain = phys({ color: 0xe8e6e0, roughness: 0.2, clearcoat: 0.8 });
  M.pizza = std({ color: 0xc9772f, roughness: 0.8 });

  M.partyHat = std({ map: T.partyHat, roughness: 0.6 });
  M.partyHat2 = std({ map: T.partyHat2, roughness: 0.6 });
  M.balloons = [0xc4161c, 0x1f5fbf, 0xe6b820, 0x2f8f3a, 0x9b2fc4].map((c) => phys({ color: c, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }));

  // Emisivos que dependen de la corriente (se apagan al quedarse sin energía).
  M.bulb = std({ color: 0xffffff, emissive: 0xffd28a, emissiveIntensity: 4 });
  M.bulbDead = std({ color: 0x555044, roughness: 0.3 });
  M.fluoro = std({ color: 0xffffff, emissive: 0xe4fff0, emissiveIntensity: 3 });
  M.ledRed = std({ color: 0x220000, emissive: 0xff1a10, emissiveIntensity: 4 });
  M.stageSign = std({ map: T.stageSign.map, emissiveMap: T.stageSign.emissive, emissive: 0xffffff, emissiveIntensity: 2.2, roughness: 0.5 });
  M.exitSign = std({ map: T.exitSign, emissiveMap: T.exitSign, emissive: 0xffffff, emissiveIntensity: 1.6 });
  M.buttonRed = phys({ color: 0x5a0000, emissive: 0xff1a10, emissiveIntensity: 0, roughness: 0.3, clearcoat: 1 });
  M.buttonLight = phys({ color: 0x55544c, emissive: 0xfff2c0, emissiveIntensity: 0, roughness: 0.3, clearcoat: 1 });

  // Animatrónicos (compartidos)
  M.teeth = phys({ color: 0xe6dcc0, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  M.noseBlack = phys({ color: 0x0b0b0b, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 });
  M.mouth = std({ color: 0x160505, roughness: 0.85 });
  M.cable = std({ color: 0x111111, roughness: 0.55 });
  M.cableRed = std({ color: 0x6a0f0f, roughness: 0.5 });
  M.cableYellow = std({ color: 0x8a7412, roughness: 0.5 });
  M.boot = std({ color: 0x1c1c1c, roughness: 0.65 });
  M.hatBlack = phys({ color: 0x0d0d0f, roughness: 0.6, sheen: 0.6, sheenColor: new THREE.Color(0x333340), sheenRoughness: 0.5 });
  M.beak = phys({ color: 0xe0761a, roughness: 0.45, clearcoat: 0.4, map: T.fur.map });
  M.guitar = phys({ color: 0xa3141a, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 });
  M.frosting = phys({ color: 0xe86fa0, roughness: 0.6, sheen: 0.4, sheenColor: new THREE.Color(0xffc0d8) });
  M.cupcake = std({ color: 0x9a6a3a, roughness: 0.8 });
  M.bib = std({ map: T.bib, roughness: 0.9, side: THREE.DoubleSide });
  M.candleFlame = std({ color: 0xffd080, emissive: 0xffa040, emissiveIntensity: 3 });

  M.powered = [M.bulb, M.fluoro, M.stageSign];
  for (const m of M.powered) m.userData.baseEmissive = m.emissiveIntensity;

  return M;
}

export function posterMaterial(tex, opts = {}) {
  return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, side: THREE.FrontSide, ...opts });
}

// Material de pelaje/fieltro para animatrónicos: el color real viene de los vertex colors.
export function furMaterial(T, sheenHex = 0xffffff, repeat = 3) {
  const map = T.fur.map.clone();
  const normal = T.fur.normal.clone();
  const rough = T.fur.rough.clone();
  for (const t of [map, normal, rough]) {
    t.repeat.set(repeat, repeat);
    t.needsUpdate = true;
  }
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    vertexColors: true,
    map,
    normalMap: normal,
    normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: rough,
    roughness: 1,
    sheen: 0.55,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(sheenHex),
  });
}
