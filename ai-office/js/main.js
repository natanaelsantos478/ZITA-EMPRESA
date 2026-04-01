/**
 * main.js — Ponto de entrada do AI Office
 * Inicializa Three.js, configura cena, câmera, iluminação,
 * e coordena todos os módulos do projeto.
 */

import * as THREE from 'three';
import { buildOffice } from './office.js';
import { Avatar } from './avatar.js';
import { AGENT_CONFIGS } from './agents.js';
import { Controls } from './controls.js';
import { UI } from './ui.js';
import { initSupabase, testSupabaseConnection } from './supabase.js';

// ─── Cena, câmera e renderer ───────────────────────────────────────────────

const canvas    = document.getElementById('canvas');
const scene     = new THREE.Scene();
const camera    = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
const renderer  = new THREE.WebGLRenderer({ canvas, antialias: true });

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
renderer.toneMapping       = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.4;

// Fundo da cena: cor escura (escritório interior à noite/ambiente)
scene.background = new THREE.Color(0x23263a);
scene.fog = new THREE.Fog(0x1a1c22, 30, 80);

// Posição inicial da câmera: no corredor central do escritório
camera.position.set(0, 1.65, 10);

// ─── Iluminação ────────────────────────────────────────────────────────────

// Luz ambiente suave
const ambientLight = new THREE.AmbientLight(0x8899cc, 1.4);
scene.add(ambientLight);

// Luz direcional principal (simula luz de teto)
const sunLight = new THREE.DirectionalLight(0xfff5e0, 1.6);
sunLight.position.set(5, 12, 8);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 0.5;
sunLight.shadow.camera.far  = 80;
sunLight.shadow.camera.left = -20;
sunLight.shadow.camera.right = 20;
sunLight.shadow.camera.top   = 20;
sunLight.shadow.camera.bottom = -20;
sunLight.shadow.bias = -0.001;
scene.add(sunLight);

// Luz de preenchimento suave (oposta)
const fillLight = new THREE.DirectionalLight(0x6688aa, 0.7);
fillLight.position.set(-8, 5, -5);
scene.add(fillLight);

// Luzes de teto tipo spot (uma para cada cluster de mesas)
const spotPositions = [
  [-8, 5, -5], [8, 5, -5],
  [-8, 5, 5],  [8, 5, 5],
  [0,  5,  0],
];
spotPositions.forEach(([x, y, z]) => {
  const spot = new THREE.SpotLight(0xffeedd, 1.4, 18, Math.PI / 5, 0.4, 1.2);
  spot.position.set(x, y, z);
  spot.castShadow = false; // spots secundários sem shadow para performance
  scene.add(spot);
  scene.add(spot.target);
  spot.target.position.set(x, 0, z);
});

// ─── Construção do escritório ──────────────────────────────────────────────

const { deskPositions } = buildOffice(scene);

// ─── Criação dos avatares/agentes ─────────────────────────────────────────

/** @type {Avatar[]} */
const avatars = [];

AGENT_CONFIGS.forEach((cfg, i) => {
  if (i >= deskPositions.length) return;
  const pos = deskPositions[i];
  const avatar = new Avatar(scene, {
    name:          cfg.name,
    role:          cfg.role,
    color:         cfg.color,
    emoji:         cfg.emoji,
    messages:      cfg.messages,
    defaultConfig: cfg.defaultConfig || null,
    position:      new THREE.Vector3(pos.x, 0, pos.z),
    deskAngle:     pos.angle,
  });
  avatars.push(avatar);
});

// ─── Controles FPS ────────────────────────────────────────────────────────

const controls = new Controls(camera, canvas, scene);

// ─── Interface do usuário ─────────────────────────────────────────────────

const ui = new UI(avatars, deskPositions, scene, camera, renderer);

// ─── Raycasting: clique em avatares ──────────────────────────────────────

const raycaster   = new THREE.Raycaster();
const pointer     = new THREE.Vector2();

canvas.addEventListener('click', (e) => {
  // Só processa clique se o pointer lock NÃO estiver ativo
  if (document.pointerLockElement === canvas) return;

  // Calcula posição normalizada do clique (desconta sidebar)
  const sidebarWidth = window.innerWidth > 700 ? 320 : 0;
  pointer.x = ((e.clientX / (window.innerWidth - sidebarWidth)) * 2 - 1);
  pointer.y = -(e.clientY / window.innerHeight) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);

  // Coleta todos os meshes dos avatares para teste
  const meshes = [];
  avatars.forEach(av => av.collectMeshes(meshes));

  const hits = raycaster.intersectObjects(meshes, true);
  if (hits.length > 0) {
    // Encontra o avatar dono do mesh clicado
    const hitObj = hits[0].object;
    const avatar = avatars.find(av => av.owns(hitObj));
    if (!avatar) return;

    // Agentes com API configurada abrem o chat diretamente ao clique
    const cfg = JSON.parse(localStorage.getItem('ai-office-agent-' + avatar.name) || '{}');
    if (cfg.provider) {
      ui.openChat(avatar);
    } else {
      ui.showAgentDetails(avatar);
    }
  }
});

// ─── Redimensionamento da janela ──────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Loop de animação ─────────────────────────────────────────────────────

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();

  // Atualiza controles FPS
  controls.update(delta);

  // Atualiza animações dos avatares
  avatars.forEach(av => av.update(delta, elapsed));

  // Atualiza UI (billboards dos balões de fala)
  ui.update(camera);

  renderer.render(scene, camera);
}

animate();

// ─── Inicializa Supabase e atualiza badge ─────────────────────────────────
(async () => {
  const badge = document.getElementById('supabase-badge');
  const ok = initSupabase();
  if (ok) {
    const connected = await testSupabaseConnection();
    if (connected) {
      badge.textContent = '🟢 Supabase';
      badge.classList.add('connected');
    } else {
      badge.textContent = '🟡 Sem tabelas';
      badge.title = 'Crie as tabelas no Supabase SQL Editor (veja js/supabase.js)';
    }
  }
})();

// ─── Exporta contexto global para uso nos outros módulos ──────────────────

export { scene, camera, renderer, avatars, deskPositions };
