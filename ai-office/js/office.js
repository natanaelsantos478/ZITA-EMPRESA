/**
 * office.js — Constrói o ambiente 3D do escritório
 * Cria chão, teto, paredes, janelas simuladas, mesas,
 * cadeiras, plantas e detalhes decorativos.
 */

import * as THREE from 'three';

// ─── Constantes do layout ─────────────────────────────────────────────────

const ROOM_W  = 32;   // largura do escritório
const ROOM_D  = 28;   // profundidade
const ROOM_H  = 4.5;  // altura do teto
const WALL_T  = 0.3;  // espessura das paredes

// Paleta de cores do ambiente
const COL = {
  floor:       0x2e2a24,   // madeira escura
  floorLine:   0x3a342c,   // linhas do chão
  wall:        0x252832,   // parede cinza-azulada
  ceiling:     0x1e2028,   // teto escuro
  desk:        0x1a1e2a,   // mesa escura metálica
  deskTop:     0x2c3044,   // tampo da mesa
  chair:       0x151820,   // cadeira preta
  chairSeat:   0x222536,   // assento
  windowFrame: 0x303550,   // moldura de janela
  windowGlass: 0x2a3a5a,   // vidro (semi-transparente)
  windowLight: 0x8ab4ff,   // luz emitida pela janela
  carpet:      0x1e2a3a,   // tapete de corredor
  plant:       0x2a5c2a,   // planta
  plantPot:    0x5c3a2a,   // vaso
  monitor:     0x0d0f14,   // tela do monitor
  monitorGlow: 0x2244aa,   // brilho da tela
  lamp:        0x404060,   // luminária de teto
  lampGlow:    0xfff5c0,   // luz da luminária
};

/**
 * Cria material padrão (Lambert para melhor performance).
 */
function mat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

/**
 * Cria material com emissão (telas, janelas com luz).
 */
function emissiveMat(color, emissive, intensity = 0.6) {
  return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity });
}

/**
 * Cria um box simples com material e shadow.
 */
function box(w, h, d, material, castShadow = false, receiveShadow = true) {
  const geo  = new THREE.BoxGeometry(w, h, d);
  const mesh = new THREE.Mesh(geo, material);
  mesh.castShadow    = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

// ─── Função principal ─────────────────────────────────────────────────────

/**
 * Constrói todo o escritório na cena Three.js.
 * @param {THREE.Scene} scene
 * @returns {{ deskPositions: Array<{x,z,angle}> }}
 */
export function buildOffice(scene) {

  // ── Chão ────────────────────────────────────────────────────────────────
  const floorMat = mat(COL.floor);
  const floor = box(ROOM_W, 0.2, ROOM_D, floorMat, false, true);
  floor.position.set(0, -0.1, 0);
  scene.add(floor);

  // Grade de linhas no chão (efeito parquet)
  const gridHelper = new THREE.GridHelper(ROOM_W, 16, COL.floorLine, COL.floorLine);
  gridHelper.position.y = 0.01;
  gridHelper.material.opacity = 0.18;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);

  // Tapete de corredor central
  const carpetMat = mat(COL.carpet);
  const carpet = box(4, 0.02, ROOM_D - 2, carpetMat);
  carpet.position.set(0, 0.01, 0);
  scene.add(carpet);

  // ── Teto ────────────────────────────────────────────────────────────────
  const ceilMat = mat(COL.ceiling);
  const ceiling = box(ROOM_W, 0.2, ROOM_D, ceilMat);
  ceiling.position.set(0, ROOM_H, 0);
  scene.add(ceiling);

  // Calhas de LED no teto (efeito decorativo)
  const ledMat = emissiveMat(COL.lamp, COL.lampGlow, 0.8);
  [-8, 0, 8].forEach(xOff => {
    const led = box(0.15, 0.08, ROOM_D - 4, ledMat);
    led.position.set(xOff, ROOM_H - 0.12, 0);
    scene.add(led);
  });

  // ── Paredes ──────────────────────────────────────────────────────────────
  const wallMat = mat(COL.wall);

  // Parede traseira
  const wallBack = box(ROOM_W, ROOM_H, WALL_T, wallMat, false, true);
  wallBack.position.set(0, ROOM_H / 2, -ROOM_D / 2);
  scene.add(wallBack);

  // Parede frontal
  const wallFront = box(ROOM_W, ROOM_H, WALL_T, wallMat, false, true);
  wallFront.position.set(0, ROOM_H / 2, ROOM_D / 2);
  scene.add(wallFront);

  // Parede esquerda
  const wallLeft = box(WALL_T, ROOM_H, ROOM_D, wallMat, false, true);
  wallLeft.position.set(-ROOM_W / 2, ROOM_H / 2, 0);
  scene.add(wallLeft);

  // Parede direita
  const wallRight = box(WALL_T, ROOM_H, ROOM_D, wallMat, false, true);
  wallRight.position.set(ROOM_W / 2, ROOM_H / 2, 0);
  scene.add(wallRight);

  // ── Janelas simuladas (na parede traseira e laterais) ────────────────────
  addWindows(scene);

  // ── Faixa decorativa de rodapé ───────────────────────────────────────────
  const skirtMat = mat(0x1a1e28);
  const skirts = [
    [ROOM_W, 0.18, WALL_T, 0, 0.09, -ROOM_D / 2 + WALL_T / 2 + 0.15],
    [ROOM_W, 0.18, WALL_T, 0, 0.09,  ROOM_D / 2 - WALL_T / 2 - 0.15],
    [WALL_T, 0.18, ROOM_D, -ROOM_W / 2 + WALL_T / 2 + 0.15, 0.09, 0],
    [WALL_T, 0.18, ROOM_D,  ROOM_W / 2 - WALL_T / 2 - 0.15, 0.09, 0],
  ];
  skirts.forEach(([w, h, d, x, y, z]) => {
    const s = box(w, h, d, skirtMat);
    s.position.set(x, y, z);
    scene.add(s);
  });

  // ── Clusters de mesas ────────────────────────────────────────────────────
  const deskPositions = buildDeskClusters(scene);

  // ── Plantas decorativas ──────────────────────────────────────────────────
  addPlants(scene);

  // ── Recepção / balcão de entrada ─────────────────────────────────────────
  addReception(scene);

  return { deskPositions };
}

// ─── Janelas simuladas ────────────────────────────────────────────────────

function addWindows(scene) {
  const frameMat = mat(COL.windowFrame);
  const glassMat = new THREE.MeshStandardMaterial({
    color: COL.windowGlass,
    transparent: true,
    opacity: 0.55,
    emissive: COL.windowLight,
    emissiveIntensity: 0.25,
  });

  // Janelas na parede traseira (z negativo)
  const windowData = [
    { x: -10, z: -ROOM_D / 2 + 0.16, ry: 0 },
    { x: -4,  z: -ROOM_D / 2 + 0.16, ry: 0 },
    { x:  4,  z: -ROOM_D / 2 + 0.16, ry: 0 },
    { x:  10, z: -ROOM_D / 2 + 0.16, ry: 0 },
    // Janelas na parede lateral esquerda
    { x: -ROOM_W / 2 + 0.16, z: -8, ry: Math.PI / 2 },
    { x: -ROOM_W / 2 + 0.16, z:  2, ry: Math.PI / 2 },
  ];

  windowData.forEach(({ x, z, ry }) => {
    const group = new THREE.Group();

    // Moldura
    const frame = box(3.2, 2.4, 0.12, frameMat);
    group.add(frame);

    // Vidro
    const glass = box(2.8, 2.0, 0.06, glassMat);
    glass.position.z = 0.04;
    group.add(glass);

    // Divisória central horizontal e vertical
    const divH = box(2.8, 0.06, 0.08, frameMat);
    divH.position.z = 0.06;
    group.add(divH);
    const divV = box(0.06, 2.0, 0.08, frameMat);
    divV.position.z = 0.06;
    group.add(divV);

    group.position.set(x, 2.2, z);
    group.rotation.y = ry;
    scene.add(group);

    // Luz que emana da janela
    const winLight = new THREE.PointLight(COL.windowLight, 0.6, 8, 2);
    winLight.position.set(x, 2.2, z + (ry === 0 ? 1.5 : 0));
    scene.add(winLight);
  });
}

// ─── Clusters de mesas ────────────────────────────────────────────────────

/**
 * Cria 4 clusters 2×2 de mesas e retorna as posições dos assentos.
 */
function buildDeskClusters(scene) {
  const deskPositions = [];

  // Definição dos 4 clusters (centro de cada cluster)
  const clusters = [
    { cx: -8, cz: -7 },
    { cx:  8, cz: -7 },
    { cx: -8, cz:  5 },
    { cx:  8, cz:  5 },
  ];

  clusters.forEach(({ cx, cz }) => {
    // Cada cluster tem 4 mesas em L (2×2)
    const offsets = [
      { dx: -2.2, dz: -1.4, angle: 0 },
      { dx:  2.2, dz: -1.4, angle: Math.PI },
      { dx: -2.2, dz:  1.4, angle: 0 },
      { dx:  2.2, dz:  1.4, angle: Math.PI },
    ];

    offsets.forEach(({ dx, dz, angle }) => {
      const wx = cx + dx;
      const wz = cz + dz;
      createDesk(scene, wx, wz, angle);
      deskPositions.push({ x: wx, z: wz, angle });
    });
  });

  // Mesas extras (fileira central superior e inferior)
  const extras = [
    { x: 0, z: -10, angle: 0 },
    { x: 0, z:  8, angle: 0 },
  ];
  extras.forEach(({ x, z, angle }) => {
    createDesk(scene, x, z, angle);
    deskPositions.push({ x, z, angle });
  });

  return deskPositions;
}

/**
 * Cria uma mesa com monitor, cadeira e acessórios.
 */
function createDesk(scene, x, z, angle = 0) {
  const group = new THREE.Group();

  // Tampo da mesa
  const topMat = mat(COL.deskTop);
  const deskTop = box(2.4, 0.06, 1.2, topMat, true, true);
  deskTop.position.set(0, 0.76, 0);
  group.add(deskTop);

  // Pernas da mesa (4 pernas)
  const legMat = mat(COL.desk);
  [[-1.1, -0.5], [1.1, -0.5], [-1.1, 0.5], [1.1, 0.5]].forEach(([lx, lz]) => {
    const leg = box(0.06, 0.76, 0.06, legMat, false, false);
    leg.position.set(lx, 0.38, lz);
    group.add(leg);
  });

  // Painel frontal da mesa (cobre os pés)
  const panel = box(2.3, 0.4, 0.04, legMat);
  panel.position.set(0, 0.44, -0.58);
  group.add(panel);

  // Monitor
  createMonitor(group, 0, 0.76, -0.28);

  // Teclado
  const kbMat = mat(0x1a1e2a);
  const kb = box(0.6, 0.018, 0.22, kbMat);
  kb.position.set(0, 0.78, 0.16);
  group.add(kb);

  // Mouse
  const mouseMat = mat(0x252836);
  const mouse = box(0.09, 0.018, 0.13, mouseMat);
  mouse.position.set(0.42, 0.78, 0.18);
  group.add(mouse);

  // Xícara de café
  createMug(group, -0.9, 0.76);

  // Cadeira
  createChair(group, 0, 0, 0.78);

  group.position.set(x, 0, z);
  group.rotation.y = angle;
  scene.add(group);
}

/**
 * Cria um monitor simples.
 */
function createMonitor(parent, x, baseY, z) {
  const screenMat = emissiveMat(COL.monitor, COL.monitorGlow, 0.5);
  const frameMat  = mat(0x151820);

  // Corpo do monitor
  const body = box(0.8, 0.52, 0.04, frameMat, true, false);
  body.position.set(x, baseY + 0.54, z);
  parent.add(body);

  // Tela
  const screen = box(0.72, 0.44, 0.02, screenMat, false, false);
  screen.position.set(x, baseY + 0.54, z + 0.02);
  parent.add(screen);

  // Suporte
  const stand = box(0.06, 0.18, 0.06, frameMat);
  stand.position.set(x, baseY + 0.09, z);
  parent.add(stand);

  // Base
  const base = box(0.26, 0.018, 0.18, frameMat);
  base.position.set(x, baseY + 0.009, z);
  parent.add(base);
}

/**
 * Cria uma xícara decorativa.
 */
function createMug(parent, x, baseY) {
  const mugMat = mat(0x3a3050);
  const mug = new THREE.Mesh(
    new THREE.CylinderGeometry(0.045, 0.04, 0.09, 8),
    mugMat
  );
  mug.position.set(x, baseY + 0.045, 0.28);
  mug.castShadow = true;
  parent.add(mug);
}

/**
 * Cria uma cadeira de escritório simples.
 */
function createChair(parent, x, y, z) {
  const seatMat = mat(COL.chairSeat);
  const legMat  = mat(COL.chair);

  // Assento
  const seat = box(0.6, 0.06, 0.6, seatMat, true, true);
  seat.position.set(x, y + 0.48, z);
  parent.add(seat);

  // Encosto
  const back = box(0.58, 0.52, 0.06, seatMat, true, false);
  back.position.set(x, y + 0.78, z - 0.27);
  parent.add(back);

  // Haste central
  const pole = box(0.06, 0.48, 0.06, legMat);
  pole.position.set(x, y + 0.24, z);
  parent.add(pole);

  // Base em estrela (5 pontas simplificadas com 5 pernas)
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const lx = Math.cos(a) * 0.28;
    const lz = Math.sin(a) * 0.28;
    const legPiece = box(0.04, 0.06, 0.32, legMat);
    legPiece.position.set(x + lx, y + 0.03, z + lz);
    legPiece.rotation.y = -a;
    parent.add(legPiece);
  }
}

// ─── Plantas decorativas ──────────────────────────────────────────────────

function addPlants(scene) {
  const plantPositions = [
    [-14, -12], [14, -12],
    [-14,  10], [14,  10],
    [-14,  -1], [14,  -1],
    [0,   -12], [0,    10],
  ];

  plantPositions.forEach(([x, z]) => {
    const group = new THREE.Group();

    // Vaso
    const potMat = mat(COL.plantPot);
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.17, 0.28, 8),
      potMat
    );
    pot.position.y = 0.14;
    pot.castShadow = true;
    group.add(pot);

    // Terra
    const soilMat = mat(0x2a1a0a);
    const soil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.21, 0.03, 8),
      soilMat
    );
    soil.position.y = 0.27;
    group.add(soil);

    // Folhas (esferas verdes)
    const leafMat = mat(COL.plant);
    [[0, 0.62, 0], [-0.18, 0.52, 0], [0.18, 0.52, 0],
     [0, 0.52, -0.15], [0, 0.52, 0.15]].forEach(([lx, ly, lz]) => {
      const leaf = new THREE.Mesh(
        new THREE.SphereGeometry(0.16 + Math.random() * 0.08, 6, 6),
        leafMat
      );
      leaf.position.set(lx, ly, lz);
      leaf.castShadow = true;
      group.add(leaf);
    });

    group.position.set(x, 0, z);
    scene.add(group);
  });
}

// ─── Recepção ────────────────────────────────────────────────────────────

function addReception(scene) {
  const counterMat = mat(0x1e2238);
  const topMat     = mat(0x2a2e42);

  // Balcão em L
  const counter1 = box(4.0, 1.0, 0.8, counterMat, true, true);
  counter1.position.set(0, 0.5, 11.5);
  scene.add(counter1);

  const counterTop1 = box(4.0, 0.06, 0.8, topMat);
  counterTop1.position.set(0, 1.03, 11.5);
  scene.add(counterTop1);

  // Logo no balcão (disco emissivo)
  const logoMat = emissiveMat(0x1a2a4a, 0x4a9eff, 0.9);
  const logoDisk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.3, 0.3, 0.02, 16),
    logoMat
  );
  logoDisk.position.set(0, 1.06, 11.5);
  scene.add(logoDisk);

  // Cadeira de recepção
  createChair({ add: (o) => scene.add(o) }, -0.8, 0, 10.8);
  createChair({ add: (o) => scene.add(o) },  0.8, 0, 10.8);

  // Monitor de recepção
  const monGroup = new THREE.Group();
  createMonitor(monGroup, 0, 1.03, -0.1);
  monGroup.position.set(-0.4, 0, 11.5);
  scene.add(monGroup);
}
