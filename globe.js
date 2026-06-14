// ── GLOBE SETUP ──────────────────────────────────────────────
const canvas   = document.getElementById('globe');
const section  = document.getElementById('globe-section');
const mainSite = document.getElementById('main-site');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 2.8;

// ── LIGHTS ───────────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(5, 3, 5);
scene.add(sun);

// ── EARTH ────────────────────────────────────────────────────
const geo     = new THREE.SphereGeometry(1, 64, 64);
const loader  = new THREE.TextureLoader();

// Use a reliable earth texture
const earthMat = new THREE.MeshPhongMaterial({
  map:          loader.load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'),
  specularMap:  loader.load('https://unpkg.com/three-globe/example/img/earth-water.png'),
  specular:     new THREE.Color(0x333333),
  shininess:    20,
});

const earth = new THREE.Mesh(geo, earthMat);
scene.add(earth);

// ── ATMOSPHERE GLOW ──────────────────────────────────────────
const atmGeo = new THREE.SphereGeometry(1.02, 64, 64);
const atmMat = new THREE.MeshPhongMaterial({
  color:       0x0099ff,
  transparent: true,
  opacity:     0.08,
  side:        THREE.FrontSide,
});
scene.add(new THREE.Mesh(atmGeo, atmMat));

// ── STARS ────────────────────────────────────────────────────
const starGeo = new THREE.BufferGeometry();
const starCount = 3000;
const starPos = new Float32Array(starCount * 3);
for (let i = 0; i < starCount * 3; i++) {
  starPos[i] = (Math.random() - 0.5) * 200;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.12 });
scene.add(new THREE.Points(starGeo, starMat));

// ── QATAR PIN ─────────────────────────────────────────────────
// Qatar lat: 25.3°N, lon: 51.2°E
function latLonToVec3(lat, lon, r) {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

const qatarPos = latLonToVec3(25.3, 51.2, 1.02);

// Glowing dot on Qatar
const pinGeo = new THREE.SphereGeometry(0.025, 16, 16);
const pinMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc });
const pin    = new THREE.Mesh(pinGeo, pinMat);
pin.position.copy(qatarPos);
earth.add(pin);

// Outer pulse ring
const ringGeo = new THREE.RingGeometry(0.03, 0.05, 32);
const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
const ring    = new THREE.Mesh(ringGeo, ringMat);
ring.position.copy(qatarPos);
ring.lookAt(new THREE.Vector3(0, 0, 0));
earth.add(ring);

// ── TARGET ROTATION (Qatar facing camera) ────────────────────
// Qatar lon 51.2°E → we want that side facing us
// Earth rotates around Y. When rotationY=0, lon=0 (Greenwich) faces +Z (camera).
// To bring lon=51.2 to front: rotationY = -51.2 * PI/180
const targetRotY = -51.2 * (Math.PI / 180);
const targetRotX =  25.3 * (Math.PI / 180) * 0.3; // slight tilt

// ── STATE ────────────────────────────────────────────────────
let autoRotate  = true;
let zooming     = false;
let zoomDone    = false;
let rotProgress = 0;  // 0→1 for rotating to Qatar
let zoomStep    = 0;  // 0→1 for camera zoom

// ── CLICK ────────────────────────────────────────────────────
canvas.addEventListener('click', () => {
  if (zoomDone || zooming) return;
  zooming    = true;
  autoRotate = false;
  document.getElementById('click-hint').style.opacity = '0';
});

// ── ANIMATE ──────────────────────────────────────────────────
const clock = new THREE.Clock();

function lerp(a, b, t) { return a + (b - a) * t; }
function easeInOut(t)   { return t < 0.5 ? 2*t*t : -1+(4-2*t)*t; }

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (autoRotate) {
    earth.rotation.y += 0.0015;
  }

  if (zooming && !zoomDone) {
    // Phase 1: rotate Earth so Qatar faces camera (rotProgress 0→1 over ~1.5s)
    if (rotProgress < 1) {
      rotProgress = Math.min(1, rotProgress + delta * 0.7);
      const e = easeInOut(rotProgress);
      earth.rotation.y = lerp(earth.rotation.y % (Math.PI * 2), targetRotY, e * 0.06);
      earth.rotation.x = lerp(earth.rotation.x, targetRotX, e * 0.04);
    }

    // Phase 2: zoom camera in toward Earth (zoomStep 0→1 over ~2s)
    if (rotProgress > 0.3) {
      zoomStep = Math.min(1, zoomStep + delta * 0.45);
      const e  = easeInOut(zoomStep);
      camera.position.z = lerp(2.8, 0.18, e);

      // Shift camera slightly toward Qatar's screen position
      camera.position.x = lerp(0,  0.05, e);
      camera.position.y = lerp(0,  0.08, e);
    }

    // Phase 3: when fully zoomed, trigger transition
    if (zoomStep >= 1 && !zoomDone) {
      zoomDone = true;
      section.classList.add('fade-out');
      mainSite.classList.remove('hidden');
      setTimeout(() => {
        mainSite.classList.add('visible');
        section.style.display = 'none';
      }, 900);
    }
  }

  // Pulse the ring
  const t = clock.getElapsedTime();
  const s = 1 + 0.4 * Math.abs(Math.sin(t * 2));
  ring.scale.set(s, s, s);
  ringMat.opacity = 0.6 - 0.4 * Math.abs(Math.sin(t * 2));

  renderer.render(scene, camera);
}

animate();

// ── RESIZE ───────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
