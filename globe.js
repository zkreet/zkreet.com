// ── RENDERER ─────────────────────────────────────────────────
const canvas   = document.getElementById('globe');
const section  = document.getElementById('globe-section');
const mainSite = document.getElementById('main-site');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 3.2;

// ── LIGHTS ───────────────────────────────────────────────────
// Ambient — deep blue space fill
scene.add(new THREE.AmbientLight(0x112244, 0.6));

// Sun — warm directional
const sun = new THREE.DirectionalLight(0xfff5e0, 2.2);
sun.position.set(6, 3, 4);
scene.add(sun);

// Rim light from the dark side
const rim = new THREE.DirectionalLight(0x2244aa, 0.4);
rim.position.set(-6, -2, -4);
scene.add(rim);

// ── TEXTURES ─────────────────────────────────────────────────
const loader = new THREE.TextureLoader();

// High-res NASA Blue Marble + night lights + normal map
const earthDay    = loader.load('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg');
const earthSpec   = loader.load('https://unpkg.com/three-globe/example/img/earth-water.png');
const earthNight  = loader.load('https://unpkg.com/three-globe/example/img/earth-night.jpg');
const earthClouds = loader.load('https://unpkg.com/three-globe/example/img/earth-topology.png');

// ── EARTH ────────────────────────────────────────────────────
const earthGeo = new THREE.SphereGeometry(1, 128, 128);
const earthMat = new THREE.MeshPhongMaterial({
  map:          earthDay,
  specularMap:  earthSpec,
  specular:     new THREE.Color(0x4488bb),
  shininess:    35,
  bumpMap:      earthClouds,
  bumpScale:    0.012,
});
const earth = new THREE.Mesh(earthGeo, earthMat);
scene.add(earth);

// ── CLOUD LAYER ──────────────────────────────────────────────
const cloudGeo = new THREE.SphereGeometry(1.005, 64, 64);
const cloudMat = new THREE.MeshPhongMaterial({
  map:         loader.load('https://unpkg.com/three-globe/example/img/earth-clouds.png'),
  transparent: true,
  opacity:     0.35,
  depthWrite:  false,
});
const clouds = new THREE.Mesh(cloudGeo, cloudMat);
scene.add(clouds);

// ── ATMOSPHERE ───────────────────────────────────────────────
const atmGeo = new THREE.SphereGeometry(1.06, 64, 64);
const atmMat = new THREE.ShaderMaterial({
  vertexShader: `
    varying vec3 vNormal;
    void main() {
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    varying vec3 vNormal;
    void main() {
      float intensity = pow(0.65 - dot(vNormal, vec3(0,0,1.0)), 3.0);
      gl_FragColor = vec4(0.1, 0.4, 1.0, 1.0) * intensity;
    }
  `,
  blending: THREE.AdditiveBlending,
  side: THREE.FrontSide,
  transparent: true,
  depthWrite: false,
});
scene.add(new THREE.Mesh(atmGeo, atmMat));

// ── STARS ────────────────────────────────────────────────────
function makeStars(count, spread, size) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * spread;
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size, transparent: true, opacity: 0.85 }));
}
scene.add(makeStars(4000, 300, 0.18));
scene.add(makeStars(800,  300, 0.35));  // brighter sparse stars

// ── LAT/LON → Vec3 ───────────────────────────────────────────
function latLonToVec3(lat, lon, r = 1) {
  const phi   = (90 - lat)  * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
     r * Math.cos(phi),
     r * Math.sin(phi) * Math.sin(theta)
  );
}

// ── TARGET: 25.485140, 50.839598 (Qatar) ─────────────────────
const TARGET_LAT =  25.485140;
const TARGET_LON =  50.839598;

// Three.js SphereGeometry places lon=0° at +X axis.
// Camera is at +Z. To bring +X to face +Z, rotation.y = -PI/2.
// So to bring any longitude to face camera:
//   rotation.y = -(lon + 90) * PI/180
const TARGET_ROT_Y = -(TARGET_LON + 90) * (Math.PI / 180);  // ≈ -2.458 rad

// Positive rotation.x tilts north pole TOWARD camera.
// For lat=25.485°N we tilt +lat to center it on screen:
//   rotation.x = +lat * PI/180
const TARGET_ROT_X = +(TARGET_LAT) * (Math.PI / 180);  // ≈ +0.445 rad


// ── STATE ────────────────────────────────────────────────────
let autoRotate  = true;
let zooming     = false;
let zoomDone    = false;
let phase       = 0;  // 0=idle, 1=rotating, 2=zooming, 3=done
let rotT        = 0;
let zoomT       = 0;

// Store starting rotation for interpolation
let startRotY = 0;
let startRotX = 0;

let absoluteTargetRotY = 0;
let absoluteTargetRotX = 0;

canvas.addEventListener('click', () => {
  if (phase !== 0) return;
  phase = 1;
  autoRotate = false;
  startRotY = earth.rotation.y;
  startRotX = earth.rotation.x;

  // Normalize startRotY into [-PI, PI] then find shortest delta to target
  let norm = ((startRotY % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (norm > Math.PI) norm -= Math.PI * 2;
  let dy = TARGET_ROT_Y - norm;
  if (dy >  Math.PI) dy -= Math.PI * 2;
  if (dy < -Math.PI) dy += Math.PI * 2;
  absoluteTargetRotY = startRotY + dy;
  absoluteTargetRotX = TARGET_ROT_X;

  document.getElementById('click-hint').style.transition = 'opacity 0.5s';
  document.getElementById('click-hint').style.opacity = '0';
});

// ── EASING ───────────────────────────────────────────────────
function easeInOut(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; }
function lerp(a, b, t) { return a + (b - a) * t; }

// ── CLOCK ────────────────────────────────────────────────────
const clock = new THREE.Clock();

// ── ANIMATE ──────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  const t  = clock.getElapsedTime();

  // Idle auto-rotate
  if (autoRotate) {
    earth.rotation.y += 0.0012;
    clouds.rotation.y += 0.0014;
  }

  // Phase 1: Rotate Earth so target faces camera
  if (phase === 1) {
    rotT = Math.min(1, rotT + dt * 0.55);
    const e = easeInOut(rotT);
    earth.rotation.y = lerp(startRotY, absoluteTargetRotY, e);
    earth.rotation.x = lerp(startRotX, absoluteTargetRotX, e);
    clouds.rotation.y = earth.rotation.y + 0.01;
    if (rotT >= 1) phase = 2;
  }

  // Phase 2: Zoom camera toward Earth
  if (phase === 2) {
    zoomT = Math.min(1, zoomT + dt * 0.38);
    const e = easeInOut(zoomT);

    camera.position.z = lerp(3.2, 0.14, e);
    // Slight shift to center on Qatar's screen position
    camera.position.x = lerp(0,  0.04, e);
    camera.position.y = lerp(0,  0.06, e);

    if (zoomT >= 1 && !zoomDone) {
      zoomDone = true;
      phase = 3;
      section.classList.add('fade-out');
      mainSite.classList.remove('hidden');
      setTimeout(() => {
        mainSite.classList.add('visible');
        section.style.display = 'none';
        // Trigger scroll reveals on hero
        document.querySelectorAll('.hero-content .reveal').forEach(el => el.classList.add('visible'));
      }, 900);
    }
  }

  // Clouds slow drift
  if (phase === 0) clouds.rotation.y += 0.0002;

  renderer.render(scene, camera);
}

animate();

// ── RESIZE ───────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
