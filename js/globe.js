// =====================================================================
// GLOBE — globo 3D interativo (Three.js) com marcadores por país
// =====================================================================
import { CONFIG } from "./config.js";
import { COUNTRY_COORDS } from "./coords.js";

let scene, camera, renderer, controls, raycaster, pointer, THREE_NS = null;
let markerGroup, earthMesh, container;
let onPick = null;               // callback(iso)
let autoRotateSpeed = 0.35;
let focusAnim = null;
const DISPOSED = () => false;

function latLngToVec3(lat, lng, r) {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (lng + 180) * Math.PI / 180;
  return new THREE_NS.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

export async function initGlobe(el, { onCountryPick } = {}) {
  container = el;
  onPick = onCountryPick || (() => {});

  THREE_NS = await import(CONFIG.cdn.three);
  const { OrbitControls } = await import(`${CONFIG.cdn.orbit}controls/OrbitControls.js`);
  setup(THREE_NS, OrbitControls);
  animate();
}

function setup(THREE, OrbitControls) {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(38, container.clientWidth / Math.max(container.clientHeight, 1), 0.1, 100);
  camera.position.set(0, 0.35, 3.1);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  // Terra
  const texture = new THREE.TextureLoader().load(CONFIG.earthTexture);
  earthMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 64, 64),
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9, metalness: 0.05 })
  );
  scene.add(earthMesh);

  // Luzes
  scene.add(new THREE.AmbientLight(0xffffff, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-2, 1.2, 1.4);
  scene.add(sun);

  // Estrelas
  const starGeo = new THREE.BufferGeometry();
  const pos = [];
  for (let i = 0; i < 1200; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(18 + Math.random() * 10);
    pos.push(v.x, v.y, v.z);
  }
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0x8fa3c8, size: 0.035, sizeAttenuation: true })));

  // Marcadores
  markerGroup = new THREE.Group();
  scene.add(markerGroup);

  // Controles
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.7;
  controls.maxDistance = 6;
  controls.autoRotate = true;
  controls.autoRotateSpeed = autoRotateSpeed;
  renderer.domElement.addEventListener("pointerdown", () => (controls.autoRotate = false));

  // Interação (clique vs. drag)
  raycaster = new THREE.Raycaster();
  pointer = new THREE.Vector2();
  let down = null;
  renderer.domElement.addEventListener("pointerdown", e => (down = { x: e.clientX, y: e.clientY, t: performance.now() }));
  renderer.domElement.addEventListener("pointerup", e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const dt = performance.now() - down.t;
    down = null;
    if (moved > 6 || dt > 600) return;
    pickAt(e.clientX, e.clientY);
  });
  renderer.domElement.addEventListener("pointermove", e => {
    const hit = raycastAt(e.clientX, e.clientY);
    renderer.domElement.style.cursor = hit ? "pointer" : "grab";
  });

  window.addEventListener("resize", onResize);
}

function pickAt(cx, cy) {
  const hit = raycastAt(cx, cy);
  if (hit && hit.iso) {
    controls.autoRotate = false;
    onPick(hit.iso);
  }
}

function raycastAt(cx, cy) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((cx - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((cy - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  // Inclui a Terra para ocultar marcadores do lado oposto do globo
  const hits = raycaster.intersectObjects([earthMesh, ...markerGroup.children], false);
  if (!hits.length) return null;
  const first = hits[0].object;
  return first === earthMesh ? null : first;
}

export function setMarkers(countries) {
  if (!THREE_NS || !markerGroup) return;
  markerGroup.clear();
  for (const c of countries) {
    const coord = COUNTRY_COORDS[c.iso];
    if (!coord || !c.count) continue;
    const [lat, lng] = coord;
    const size = 0.012 + Math.min(0.024, Math.sqrt(c.count) * 0.0022);
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(size, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x4fd1c5 })
    );
    marker.position.copy(latLngToVec3(lat, lng, 1.02));
    marker.userData.iso = c.iso;
    marker.userData.name = c.name;
    markerGroup.add(marker);
  }
}

/** Anima câmera até o país selecionado */
export function focusCountry(iso) {
  if (!THREE_NS || !camera || !controls) return;
  const coord = COUNTRY_COORDS[iso];
  if (!coord) return;
  controls.autoRotate = false;
  const target = latLngToVec3(coord[0], coord[1], 0);
  const from = camera.position.clone();
  const fromDir = from.clone().normalize();
  const toDir = target.clone().normalize();
  const dist = Math.max(2.0, from.length());
  focusAnim = { t: 0, fromDir, toDir, dist };
}

function animate() {
  requestAnimationFrame(animate);
  if (!renderer) return;
  if (focusAnim) {
    const { t, fromDir, toDir, dist } = focusAnim;
    const step = Math.min(1, t + 0.06);
    const eased = step * step * (3 - 2 * step);
    const dir = fromDir.clone().lerp(toDir, eased).normalize();
    camera.position.copy(dir.multiplyScalar(dist));
    focusAnim.t = step;
    if (step >= 1) focusAnim = null;
  }
  controls.update();
  renderer.render(scene, camera);
}

function onResize() {
  if (!container || !renderer) return;
  camera.aspect = container.clientWidth / Math.max(container.clientHeight, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

export function resetGlobeView() {
  if (!camera || !controls) return;
  camera.position.set(0, 0.35, 3.1);
  controls.autoRotate = true;
}

export function disposeGlobe() {
  if (DISPOSED()) return;
  window.removeEventListener("resize", onResize);
  if (renderer) { renderer.dispose(); renderer.domElement.remove(); renderer = null; }
  scene = null; camera = null; controls = null; markerGroup = null;
}
