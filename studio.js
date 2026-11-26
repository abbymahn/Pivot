
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const $ = id => document.getElementById(id);
const value = id => Number($(id).value);
const status = message => { $('status').textContent = message; };
const sliderEditors = new Map();
for (const slider of document.querySelectorAll('.panel input[type="range"]')) {
  const label = slider.closest('label');
  const editor = document.createElement('input');
  editor.type = 'number';
  editor.className = 'slider-value';
  editor.setAttribute('aria-label', label.firstChild.textContent.trim() + ' exact value');
  for (const property of ['min', 'max', 'step']) editor[property] = slider[property];
  editor.value = slider.value;
  const row = document.createElement('span');
  row.className = 'slider-row';
  slider.before(row);
  row.append(slider, editor);
  sliderEditors.set(slider.id, editor);
  slider.addEventListener('input', () => syncSliderEditor(slider.id));
  editor.addEventListener('change', () => {
    if (Number.isFinite(editor.valueAsNumber)) {
      // The range control applies its own bounds and step to typed values.
      slider.value = editor.value;
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
    syncSliderEditor(slider.id);
  });
  editor.addEventListener('keydown', event => {
    if (event.key === 'Enter') editor.blur();
  });
}
function syncSliderEditor(id) {
  const editor = sliderEditors.get(id);
  if (editor) editor.value = $(id).value;
}
const sample = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><path fill-rule="evenodd" fill="#a69aff" d="M100 5 L135 65 L195 100 L135 135 L100 195 L65 135 L5 100 L65 65 Z M100 58 L115 85 L142 100 L115 115 L100 142 L85 115 L58 100 L85 85 Z"/></svg>';
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, 1, .1, 100);
const holder = new THREE.Group();
const motionGroup = new THREE.Group();
holder.add(motionGroup);
const up = new THREE.Vector3(0, 1, 0);
const spinAxes = { x: new THREE.Vector3(1, 0, 0), y: up, z: new THREE.Vector3(0, 0, 1) };
scene.add(holder);
const ambient = new THREE.HemisphereLight(0xffffff, 0x302743, .22);
const key = new THREE.DirectionalLight(0xfff4df, 3);
const rim = new THREE.DirectionalLight(0xaab8ff, 2.2);
const fill = new THREE.DirectionalLight(0xffffff, 0);
rim.position.set(-4, 2, -4);
scene.add(ambient, key, rim, fill);
const presets = {
  enamel: ['#a69aff', .24, .16],
  matte: ['#b7a9f0', .83, 0],
  chrome: ['#e9e9eb', .18, 1],
  metal: ['#c5c9d1', .28, 1],
  gold: ['#f9bc59', .19, 1],
  obsidian: ['#292437', .16, .38],
  stone: ['#bcb2a2', .9, 0],
  grass: ['#31451a', .94, 0]
};
function surface(finish) {
  const [tint, roughness, metalness] = presets[finish];
  return { finish, tint, roughness, metalness, repeat: 1, textureAngle: 0, detail: 1, grassLength: .13, grassDensity: 1, maps: {} };
}
const surfaces = { face: surface('chrome'), side: surface('metal') };
const materials = [new THREE.MeshPhysicalMaterial(), new THREE.MeshPhysicalMaterial()];
let renderer, artwork, shapes, bounds, backdrop, capturing = false;
const environments = {};
const bladeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
let grassMesh, grassOwner, grassSignature, stoneBump, sideStoneBump;
let phase = .08;
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let lastTime = performance.now();

function setup() {
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  $('viewport').append(renderer.domElement);
  const pmrem = new THREE.PMREMGenerator(renderer);
  environments.softbox = makeEnvironment(pmrem, 'softbox');
  environments.strip = makeEnvironment(pmrem, 'strip');
  environments.raking = makeEnvironment(pmrem, 'raking');
  pmrem.dispose();
  new ResizeObserver(resize).observe($('stage'));
  setLogo(sample, 'Sample mark');
  syncSurface();
  refreshLibrary().catch(() => libraryStatus('This browser could not open the saved material library.'));
  syncPlay();
  $('openExport').disabled = false;
  status('');
  requestAnimationFrame(tick);
}
function makeEnvironment(pmrem, mode) {
  const rig = new THREE.Scene();
  rig.background = new THREE.Color(0x45454b);
  const cards = [
    { position: [-4, 5, 6], size: [5, 2], color: 0xfff9f4, strength: 5 },
    { position: [5, 1, 3], size: [1.1, 7], color: 0xe8edff, strength: 4 },
    { position: [-5, 0, -3], size: [1.3, 6], color: 0xf6efff, strength: 5 },
    { position: [0, -5, 1], size: [5, 1.1], color: 0xe0e2f0, strength: 1.3 },
    { position: [1, 4, -6], size: [5, 3], color: 0xffe5c7, strength: 3 }
  ];
  for (const card of cards) {
    const [width, height] = card.size;
    const size = mode === 'strip' ? [width * .42, height] :
      mode === 'raking' ? [width * .7, height * .82] : card.size;
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(...size),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(card.color).multiplyScalar(card.strength)
      })
    );
    const [x, y, z] = card.position;
    panel.position.set(x, mode === 'raking' ? y * .2 : y, z);
    panel.lookAt(0, 0, 0);
    rig.add(panel);
  }
  const environment = pmrem.fromScene(rig, mode === 'strip' ? .015 : .045).texture;
  rig.children.forEach(panel => { panel.geometry.dispose(); panel.material.dispose(); });
  return environment;
}
function setLogo(svg, filename) {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (doc.documentElement.localName !== 'svg' || doc.querySelector('parsererror')) {
    throw new Error('Choose a valid SVG file.');
  }
  // Parse paths in a detached XML document. Never insert uploaded markup into the page.
  const parsed = new SVGLoader().parse(svg);
  const next = parsed.paths.filter(path => {
    const style = path.userData.style;
    return style.fill !== 'none' && style.visibility !== 'hidden' &&
      style.display !== 'none' && style.fillOpacity !== 0 &&
      !path.userData.node.closest('defs,clipPath,mask,pattern,symbol');
  }).flatMap(path => SVGLoader.createShapes(path));
  const nextBounds = new THREE.Box2();
  for (const shape of next) for (const point of shape.getPoints(24)) nextBounds.expandByPoint(point);
  const extent = nextBounds.getSize(new THREE.Vector2());
  const span = Math.max(extent.x, extent.y);
  if (!Number.isFinite(span) || span <= 0) {
    throw new Error('No filled outlines found. Outline text and expand strokes in your SVG editor.');
  }
  buildLogo(next, nextBounds);
  shapes = next;
  bounds = nextBounds;
  $('filename').textContent = filename;
}
function buildLogo(source = shapes, box = bounds) {
  const center = box.getCenter(new THREE.Vector2());
  const extent = box.getSize(new THREE.Vector2());
  const scale = 3.45 / Math.max(extent.x, extent.y);
  const depth = value('depth');
  const group = new THREE.Group();
  try {
    for (const shape of source) {
      const outline = new THREE.Box2().setFromPoints(shape.getPoints(24));
      const dimensions = outline.getSize(new THREE.Vector2()).multiplyScalar(scale);
      const bevel = Math.min(value('bevel'), depth * .48, Math.min(dimensions.x, dimensions.y) * .12);
      const geometry = new THREE.ExtrudeGeometry(shape, {
        depth: depth / scale, bevelEnabled: bevel > 0,
        bevelSize: bevel / scale, bevelThickness: bevel / scale,
        bevelSegments: 8, steps: 1, curveSegments: 32,
        UVGenerator: logoUVs(center, scale, bevel > 0 ? 17 : 1)
      });
      const position = geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        const x = (position.getX(i) - center.x) * scale;
        const y = (position.getY(i) - center.y) * scale;
        const z = position.getZ(i) * scale - depth / 2;
        position.setXYZ(i, x, y, z);
      }
      toCreasedNormals(geometry, Math.PI / 5);
      const mesh = new THREE.Mesh(geometry, materials);
      group.add(mesh);
    }
  } catch (error) {
    group.children.forEach(mesh => mesh.geometry.dispose());
    throw error;
  }
  group.rotation.z = Math.PI;
  group.rotation.y = Math.PI;
  replaceArtwork(group);
  updateGrass();
}
function logoUVs(center, scale, layers) {
  const factor = scale / 3.45;
  let cursor = 0;
  let edgeWidth = 0;
  let layer = 0;
  return {
    generateTopUV(_geometry, coordinates, ...indices) {
      return indices.map(i => new THREE.Vector2(
        (coordinates[i * 3] - center.x) * factor + .5,
        (coordinates[i * 3 + 1] - center.y) * factor + .5
      ));
    },
    generateSideWallUV(_geometry, coordinates, a, b, c, d) {
      const x = i => coordinates[i * 3];
      const y = i => coordinates[i * 3 + 1];
      const z = i => coordinates[i * 3 + 2] * factor;
      if (layer === 0) edgeWidth = Math.hypot(x(a) - x(b), y(a) - y(b)) * factor;
      const uv = [
        new THREE.Vector2(cursor, z(a)), new THREE.Vector2(cursor + edgeWidth, z(b)),
        new THREE.Vector2(cursor + edgeWidth, z(c)), new THREE.Vector2(cursor, z(d))
      ];
      layer++;
      if (layer === layers) {
        cursor += edgeWidth;
        layer = 0;
      }
      return uv;
    }
  };
}
function replaceArtwork(next) {
  if (artwork) {
    motionGroup.remove(artwork);
    artwork.traverse(node => node.geometry?.dispose());
  }
  artwork = next;
  motionGroup.add(artwork);
}
function resize() {
  if (capturing || !renderer) return;
  const ratio = value('ratio');
  const width = Math.floor(Math.min($('stage').clientWidth - 20, ($('stage').clientHeight - 20) * ratio));
  const height = Math.floor(width / ratio);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height);
  camera.aspect = ratio;
  camera.updateProjectionMatrix();
  $('frameLabel').textContent = ratio === 1 ? '1:1' : '9:16';
}
function draw(at, alpha = $('transparent').checked) {
  const t = at * Math.PI * 2 * value('direction');
  const motion = $('animation').value;
  if (motion === 'still' || usePosedAngle) {
    holder.rotation.set(...['poseX', 'poseY', 'poseZ'].map(id => THREE.MathUtils.degToRad(value(id))));
  } else {
    holder.rotation.set(0, motion === 'light' ? .22 : 0, 0);
  }
  motionGroup.quaternion.identity();
  if (motion === 'spin' || motion === 'rock') {
    const angle = motion === 'spin' ? t : Math.sin(t) * .55;
    motionGroup.quaternion.setFromAxisAngle(spinAxes[$('spinAxis').value], angle);
  }
  holder.scale.setScalar(value('size'));
  const tilt = THREE.MathUtils.degToRad(value('tilt'));
  const distance = 9.15 / Math.min(1, value('ratio'));
  camera.position.set(0, Math.sin(tilt) * distance, Math.cos(tilt) * distance);
  camera.lookAt(0, 0, 0);
  const rig = $('rig').value;
  const lightAngle = THREE.MathUtils.degToRad(value('lightAngle')) + (motion === 'light' ? Math.sin(t) * 1.2 : 0);
  scene.environment = environments[rig];
  scene.environmentRotation.y = lightAngle;
  key.position.set(3, rig === 'raking' ? .8 : 4, 4).applyAxisAngle(up, lightAngle);
  key.intensity = 1.6 * value('lighting');
  rim.intensity = 1.2 * value('lighting');
  const fillAmount = value('fillLight');
  fill.position.copy(camera.position).addScalar(.3);
  fill.intensity = fillAmount;
  ambient.intensity = .22 + fillAmount * .4;
  scene.environmentIntensity = value('lighting') * (1 + fillAmount * .45);
  const image = !alpha && backdrop;
  if (image) {
    const aspect = image.image.width / image.image.height;
    image.repeat.set(Math.min(1, camera.aspect / aspect), Math.min(1, aspect / camera.aspect));
    image.offset.set((1 - image.repeat.x) / 2, (1 - image.repeat.y) / 2);
  }
  scene.background = alpha ? null : image || new THREE.Color($('background').value);
  renderer.render(scene, camera);
}
function tick(now) {
  if (!capturing) {
    if (playing && $('animation').value !== 'still') {
      phase = (phase + Math.min(now - lastTime, 100) / 1000 / value('duration')) % 1;
    }
    $('scrub').value = phase;
    $('time').textContent = (phase * value('duration')).toFixed(1) + ' s';
    draw(phase);
  }
  lastTime = now;
  requestAnimationFrame(tick);
}
function syncPlay() {
  $('play').textContent = playing ? 'Pause' : 'Play';
  $('play').setAttribute('aria-label', playing ? 'Pause animation' : 'Play animation');
}
function selectedSurface() {
  return surfaces[$('matchSides').checked ? 'face' : $('surface').value];
}
function randomSequence(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function stoneTexture() {
  if (stoneBump) return stoneBump;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d');
  const random = randomSequence(18);
  const image = context.createImageData(512, 512);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const u = x * Math.PI / 256;
      const v = y * Math.PI / 256;
      const pore = 32 * Math.sin(13 * u + 2 * Math.sin(5 * v)) * Math.cos(11 * v);
      const grain = 24 * Math.cos(31 * u + 37 * v) + 43 * (random() - .5);
      const gray = 128 + pore + grain;
      const offset = (y * 512 + x) * 4;
      image.data.set([gray, gray, gray, 255], offset);
    }
  }
  context.putImageData(image, 0, 0);
  stoneBump = new THREE.CanvasTexture(canvas);
  stoneBump.wrapS = stoneBump.wrapT = THREE.RepeatWrapping;
  return stoneBump;
}
function updateGrass() {
  if (!artwork) return;
  const face = surfaces.face;
  const side = $('matchSides').checked ? face : surfaces.side;
  const signature = [face, side].map(config => config.finish === 'grass'
    ? [config.grassLength, config.grassDensity, config.tint].join('/') : '').join(':');
  if (grassOwner === artwork && grassSignature === signature) return;
  if (grassOwner === artwork && grassMesh) {
    artwork.remove(grassMesh);
    grassMesh.geometry.dispose();
  }
  grassOwner = artwork;
  grassSignature = signature;
  grassMesh = null;
  if (signature === ':') return;

  const positions = [];
  const colors = [];
  const random = randomSequence(711);
  const a = new THREE.Vector3(), b = a.clone(), c = a.clone();
  const ab = a.clone(), ac = a.clone(), normal = a.clone();
  const point = a.clone(), tangent = a.clone(), cross = a.clone();
  const baseLeft = a.clone(), baseRight = a.clone(), bend = a.clone(), tip = a.clone();
  const bladeColor = new THREE.Color();
  const push = (vertex, brightness) => {
    positions.push(vertex.x, vertex.y, vertex.z);
    colors.push(bladeColor.r * brightness, bladeColor.g * brightness, bladeColor.b * brightness);
  };
  let blades = 0;
  for (const mesh of artwork.children) {
    if (mesh.material !== materials) continue;
    const position = mesh.geometry.attributes.position;
    for (const group of mesh.geometry.groups) {
      const config = group.materialIndex === 0 ? face : side;
      if (config.finish !== 'grass') continue;
      for (let i = group.start; i < group.start + group.count && blades < 14000; i += 3) {
        a.fromBufferAttribute(position, i);
        b.fromBufferAttribute(position, i + 1);
        c.fromBufferAttribute(position, i + 2);
        ab.subVectors(b, a);
        ac.subVectors(c, a);
        normal.crossVectors(ab, ac);
        const twiceArea = normal.length();
        if (twiceArea < 1e-8) continue;
        normal.divideScalar(twiceArea);
        tangent.copy(ab).normalize();
        cross.crossVectors(normal, tangent);
        const count = Math.min(14000 - blades, Math.floor(twiceArea * 420 * config.grassDensity + random()));
        for (let j = 0; j < count; j++) {
          const u = Math.sqrt(random());
          const v = random();
          point.copy(a).addScaledVector(ab, u * (1 - v)).addScaledVector(ac, u * v).add(mesh.position);
          const length = config.grassLength * (.55 + random() * .95);
          const angle = random() * Math.PI * 2;
          const leanX = Math.cos(angle);
          const leanY = Math.sin(angle);
          const halfWidth = length * (.045 + .055 * random());
          baseLeft.copy(point).addScaledVector(tangent, leanY * halfWidth).addScaledVector(cross, -leanX * halfWidth);
          baseRight.copy(point).multiplyScalar(2).sub(baseLeft);
          bend.copy(point).addScaledVector(normal, length * .58).addScaledVector(tangent, leanX * length * .12).addScaledVector(cross, leanY * length * .12);
          tip.copy(point).addScaledVector(normal, length).addScaledVector(tangent, leanX * length * .46).addScaledVector(cross, leanY * length * .46);
          bladeColor.set(config.tint).multiplyScalar(1.2 + random() * 2.4);
          push(baseLeft, .48); push(baseRight, .48); push(bend, 1.25);
          push(baseLeft, .48); push(bend, 1.25); push(tip, 1.65);
          blades++;
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  grassMesh = new THREE.Mesh(geometry, bladeMaterial);
  artwork.add(grassMesh);
}
function syncSurface() {
  const settings = selectedSurface();
  for (const property of ['finish', 'tint', 'roughness', 'metalness', 'repeat', 'textureAngle', 'detail', 'grassLength', 'grassDensity']) {
    $(property).value = settings[property];
    syncSliderEditor(property);
  }
  $('grassControls').hidden = settings.finish !== 'grass';
  for (const [index, key] of ['face', 'side'].entries()) {
    const config = surfaces[$('matchSides').checked ? 'face' : key];
    const material = materials[index];
    material.color.set(config.tint);
    material.roughness = config.roughness;
    material.metalness = config.metalness;
    material.clearcoat = config.finish === 'enamel' || config.finish === 'obsidian' ? .85 : 0;
    material.clearcoatRoughness = .13;
    const normalDirection = /normal[_-]?dx/i.test(config.maps.normalMap?.name ?? '') ? -1 : 1;
    material.normalScale.set(config.detail, config.detail * normalDirection);
    material.bumpScale = .04 * config.detail;
    for (const map of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'bumpMap']) {
      material[map] = config.maps[map]?.texture ?? null;
      if (map === 'bumpMap' && !material[map] && config.finish === 'stone') {
        const stone = stoneTexture();
        sideStoneBump ??= stone.clone();
        material[map] = index === 0 ? stone : sideStoneBump;
      }
      if (material[map]) {
        material[map].repeat.setScalar(config.repeat);
        material[map].center.set(.5, .5);
        material[map].rotation = THREE.MathUtils.degToRad(config.textureAngle);
      }
    }
    if (config.finish === 'stone' && !config.maps.bumpMap) material.bumpScale = .013 * config.detail;
    material.needsUpdate = true;
  }
  for (const input of $('textures').querySelectorAll('input')) {
    input.nextElementSibling.textContent = settings.maps[input.dataset.map]?.name ?? '';
  }
  updateGrass();
}
async function readTexture(file, color) {
  if (!/\.(png|jpe?g|webp)$/i.test(file.name)) throw new Error('Choose a PNG, JPG, or WebP image.');
  const url = URL.createObjectURL(file);
  try {
    const texture = await new THREE.TextureLoader().loadAsync(url);
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    const image = texture.image;
    const limit = Math.min(4096, renderer?.capabilities.maxTextureSize ?? 4096);
    const shrink = limit / Math.max(image.width, image.height);
    if (shrink < 1) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * shrink));
      canvas.height = Math.max(1, Math.round(image.height * shrink));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      texture.image = canvas;
    }
    texture.anisotropy = Math.min(8, renderer?.capabilities.getMaxAnisotropy() ?? 1);
    return texture;
  } finally {
    URL.revokeObjectURL(url);
  }
}
const textureStatus = message => { $('textureStatus').textContent = message; };
const libraryStatus = message => { $('libraryStatus').textContent = message; };
let libraryDatabase;
function openLibrary() {
  libraryDatabase ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('mark-in-motion-materials', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('materials', { keyPath: 'name' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return libraryDatabase;
}
async function libraryRequest(mode, action) {
  const database = await openLibrary();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('materials', mode);
    const request = action(transaction.objectStore('materials'));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () => reject(transaction.error);
  });
}
async function refreshLibrary(preferred) {
  const saved = await libraryRequest('readonly', store => store.getAllKeys());
  const picker = $('savedMaterial');
  const selection = preferred ?? picker.value;
  picker.replaceChildren(new Option('Choose a saved material', ''));
  saved.forEach(name => picker.add(new Option(name, name)));
  if (saved.includes(selection)) picker.value = selection;
}
$('saveMaterial').onclick = async () => {
  const name = $('materialName').value.trim();
  if (!name) { libraryStatus('Give the material a name.'); return; }
  const { maps, ...settings } = selectedSurface();
  const files = Object.fromEntries(Object.entries(maps).map(([slot, entry]) => [
    slot, { file: entry.file, name: entry.name }
  ]));
  try {
    await libraryRequest('readwrite', store => store.add({ name, settings, files }));
    await refreshLibrary(name);
    libraryStatus('Saved ' + name + ' in this browser.');
  } catch (error) {
    libraryStatus(error?.name === 'ConstraintError' ? 'That name is already used. Choose another name.' :
      'Could not save the material. Browser storage may be full or unavailable.');
  }
};
$('savedMaterial').onchange = async () => {
  const picker = $('savedMaterial');
  if (!picker.value) return;
  const config = selectedSurface();
  const maps = {};
  picker.disabled = true;
  try {
    const record = await libraryRequest('readonly', store => store.get(picker.value));
    if (!record) throw new Error('Material is missing.');
    for (const [slot, entry] of Object.entries(record.files)) {
      const file = new File([entry.file], entry.name, { type: entry.file.type });
      const texture = await readTexture(file, slot === 'map');
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      maps[slot] = { texture, file, name: entry.name };
    }
    for (const entry of Object.values(config.maps)) entry.texture.dispose();
    Object.assign(config, record.settings, { maps });
    syncSurface();
    libraryStatus('Applied ' + record.name + '.');
  } catch {
    for (const entry of Object.values(maps)) entry.texture.dispose();
    libraryStatus('Could not load that saved material.');
  } finally {
    picker.disabled = false;
    picker.value = '';
  }
};
function assignTexture(config, slot, file, texture) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  config.maps[slot]?.texture.dispose();
  config.maps[slot] = { texture, name: file.name, file };
  config.finish = 'custom';
  if (slot === 'map') config.tint = '#ffffff';
  if (slot === 'roughnessMap') config.roughness = 1;
  if (slot === 'metalnessMap') config.metalness = 1;
}
const mapLabels = {
  map: 'Color texture', normalMap: 'Normal map', bumpMap: 'Bump map',
  roughnessMap: 'Roughness map', metalnessMap: 'Metalness map'
};
function identifyMap(name) {
  const stem = name.replace(/\.[^.]+$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  const tokens = stem.split(/[^a-z0-9]+/);
  if (tokens.some(token => ['orm', 'rma', 'mra', 'preview', 'thumbnail'].includes(token))) return;
  const matches = patterns => patterns.some(pattern => tokens.includes(pattern));
  if (matches(['normal', 'normalgl', 'normaldx', 'nrm', 'nor'])) return 'normalMap';
  if (matches(['roughness', 'rough', 'rgh'])) return 'roughnessMap';
  if (matches(['metalness', 'metallic', 'metalnessmap', 'mtl'])) return 'metalnessMap';
  if (matches(['displacement', 'disp', 'height', 'bump'])) return 'bumpMap';
  if (matches(['basecolor', 'basecolour', 'albedo', 'diffuse', 'diff', 'color', 'colour', 'col'])) return 'map';
}
let batchMaps = [];
function reviewTextureSet(selection) {
  const files = Array.from(selection).filter(file => /\.(png|jpe?g|webp)$/i.test(file.name));
  const assignments = $('mapAssignments');
  assignments.replaceChildren();
  const used = new Set();
  batchMaps = files.sort((a, b) => Number(/normal[_ -]?gl/i.test(b.name)) - Number(/normal[_ -]?gl/i.test(a.name)))
    .map(file => {
      const row = document.createElement('label');
      row.className = 'map-assignment';
      row.textContent = file.name;
      const select = document.createElement('select');
      select.add(new Option('Skip', ''));
      for (const [slot, label] of Object.entries(mapLabels)) select.add(new Option(label, slot));
      const guessed = identifyMap(file.name);
      if (guessed && !used.has(guessed)) {
        select.value = guessed;
        used.add(guessed);
      }
      row.append(select);
      assignments.append(row);
      return { file, select };
    });
  $('applyTextureSet').hidden = !batchMaps.length;
  textureStatus(batchMaps.length ? 'Review the map types, then apply the set.' : 'Choose PNG, JPG, or WebP images.');
}
$('textureSet').onchange = () => {
  $('textureFolder').value = '';
  reviewTextureSet($('textureSet').files);
};
$('textureFolder').onchange = () => {
  $('textureSet').value = '';
  reviewTextureSet($('textureFolder').files);
};
$('applyTextureSet').onclick = async () => {
  const slots = new Map();
  for (const { file, select } of batchMaps) {
    if (!select.value) continue;
    if (slots.has(select.value)) {
      textureStatus('Choose only one image for each map type.');
      return;
    }
    slots.set(select.value, file);
  }
  if (!slots.size) {
    textureStatus('Assign at least one image to a map type.');
    return;
  }
  const config = selectedSurface();
  const controls = [$('textureSet'), $('textureFolder'), $('applyTextureSet'), ...batchMaps.map(entry => entry.select)];
  controls.forEach(control => { control.disabled = true; });
  textureStatus('Loading texture maps…');
  let loaded = 0;
  const failed = [];
  try {
    for (const [slot, file] of slots) {
      try {
        const texture = await readTexture(file, slot === 'map');
        if (!loaded) {
          for (const entry of Object.values(config.maps)) entry.texture.dispose();
          Object.assign(config, { maps: {}, tint: '#ffffff', roughness: .6, metalness: 0 });
        }
        assignTexture(config, slot, file, texture);
        loaded++;
      } catch { failed.push(file.name); }
    }
    syncSurface();
    textureStatus([
      loaded ? 'Applied ' + loaded + ' texture map' + (loaded === 1 ? '.' : 's.') : '',
      failed.length ? 'Could not decode ' + failed.join(', ') + '.' : ''
    ].filter(Boolean).join(' '));
  } finally {
    controls.forEach(control => { control.disabled = false; });
  }
};
for (const [map, label] of Object.entries(mapLabels)) {
  const row = document.createElement('label');
  row.textContent = label;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp';
  input.dataset.map = map;
  const name = document.createElement('small');
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = 'Clear';
  remove.setAttribute('aria-label', 'Clear ' + label.toLowerCase());
  row.append(input, name);
  $('textures').append(row, remove);
  remove.style.marginBottom = '12px';
  remove.onclick = () => {
    const config = selectedSurface();
    config.maps[map]?.texture.dispose();
    delete config.maps[map];
    input.value = '';
    syncSurface();
  };
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const config = selectedSurface();
    try {
      const texture = await readTexture(file, map === 'map');
      if (map === 'map' && config.finish !== 'custom' && !config.maps.metalnessMap) {
        config.metalness = 0;
        config.roughness = .6;
      }
      assignTexture(config, map, file, texture);
      syncSurface();
      textureStatus('Applied ' + file.name + '.');
    } catch { textureStatus('Could not decode ' + file.name + '. Choose a valid PNG, JPG, or WebP.'); }
  };
}
for (const button of document.querySelectorAll('[data-panel]')) {
  button.onclick = () => document.querySelectorAll('[data-panel]').forEach(tab => {
    const active = tab === button;
    tab.setAttribute('aria-pressed', active);
    $(tab.dataset.panel).hidden = !active;
  });
}
$('logo').onchange = async () => {
  const file = $('logo').files[0];
  $('logo').value = '';
  if (!file) return;
  try {
    if (file.size > 4_000_000) throw new Error('Choose an SVG under 4 MB.');
    setLogo(await file.text(), file.name);
    status('');
  } catch (error) { status(error.message); }
};
$('backdrop').onchange = async () => {
  const file = $('backdrop').files[0];
  if (!file) return;
  try {
    const texture = await readTexture(file, true);
    backdrop?.dispose();
    backdrop = texture;
    $('transparent').checked = false;
    status('');
  } catch { status('Could not load the background image.'); }
};
$('clearBackdrop').onclick = () => {
  backdrop?.dispose();
  backdrop = null;
  $('backdrop').value = '';
};
$('surface').onchange = syncSurface;
$('matchSides').onchange = () => {
  const linked = $('matchSides').checked;
  $('surface').disabled = linked;
  if (linked) $('surface').value = 'face';
  syncSurface();
};
$('finish').onchange = () => {
  const finish = $('finish').value;
  const config = selectedSurface();
  config.finish = finish;
  if (finish !== 'custom') {
    for (const { texture } of Object.values(config.maps)) texture.dispose();
    Object.assign(config, surface(finish));
  }
  syncSurface();
};
for (const property of ['tint', 'roughness', 'metalness', 'repeat', 'textureAngle', 'detail', 'grassLength', 'grassDensity']) {
  $(property).oninput = () => {
    const config = selectedSurface();
    config[property] = property === 'tint' ? $(property).value : value(property);
    syncSurface();
  };
}
$('play').onclick = () => { playing = !playing; syncPlay(); };
$('scrub').oninput = () => { phase = value('scrub'); playing = false; syncPlay(); };
$('ratio').onchange = resize;
const poseAxes = ['poseX', 'poseY', 'poseZ'];
let lastVideoMotion = $('animation').value;
let usePosedAngle = false;
let lastPreviewMode = lastVideoMotion;
function showMotionControls() {
  const still = $('animation').value === 'still';
  if (!still) {
    lastVideoMotion = $('animation').value;
    if (lastPreviewMode === 'still') {
      usePosedAngle = true;
      phase = 0;
    }
  }
  lastPreviewMode = $('animation').value;
  $('poseControls').hidden = !still;
  $('loopControls').hidden = still;
  $('spinAxisControl').hidden = still || $('animation').value === 'light';
  $('play').disabled = still;
  $('scrub').disabled = still;
  $('poseButton').textContent = still ? 'Back to video' : 'Pose for PNG';
  $('viewport').classList.toggle('posing', still);
}
function switchPreviewMode() {
  $('animation').value = $('animation').value === 'still' ? lastVideoMotion : 'still';
  document.querySelector('[data-panel="motion"]').click();
  showMotionControls();
}
function updatePoseLabels() {
  for (const id of poseAxes) {
    $(id + 'Degrees').textContent = value(id) + '°';
    syncSliderEditor(id);
  }
}
$('animation').onchange = showMotionControls;
$('poseButton').onclick = switchPreviewMode;
for (const id of poseAxes) $(id).oninput = updatePoseLabels;
$('resetPose').onclick = () => {
  for (const id of poseAxes) $(id).value = 0;
  updatePoseLabels();
};
let poseDrag;
const viewport = $('viewport');
viewport.addEventListener('pointerdown', event => {
  if ($('animation').value !== 'still' || event.button !== 0 || poseDrag) return;
  poseDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  viewport.setPointerCapture(event.pointerId);
});
viewport.addEventListener('pointermove', event => {
  if (poseDrag?.id !== event.pointerId) return;
  const wrap = degrees => ((degrees % 360 + 540) % 360) - 180;
  $('poseY').value = wrap(value('poseY') + (event.clientX - poseDrag.x) * .65);
  $('poseX').value = wrap(value('poseX') + (event.clientY - poseDrag.y) * .65);
  poseDrag.x = event.clientX;
  poseDrag.y = event.clientY;
  updatePoseLabels();
});
viewport.addEventListener('lostpointercapture', () => { poseDrag = null; });
function openExportDialog() {
  const still = $('animation').value === 'still';
  const transparent = $('transparent').checked;
  $('format').value = still ? (transparent ? 'png' : 'png-scene') : (transparent ? 'alpha' : 'mp4');
  $('format').onchange();
  $('exportDialog').showModal();
}
$('poseExport').onclick = openExportDialog;
for (const id of ['depth', 'bevel']) $(id).oninput = () => buildLogo();
$('openExport').onclick = openExportDialog;
$('exportDialog').addEventListener('cancel', event => { if (capturing) event.preventDefault(); });
function save(blob, extension) {
  if (!blob?.size) throw new Error('The browser produced an empty file.');
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = $('filename').textContent.replace(/\.svg$/i, '') + '.' + extension;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
async function record(mimeType, alpha) {
  const stream = renderer.domElement.captureStream(30);
  let frame;
  let recorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 12000000 });
    const chunks = [];
    const result = new Promise((resolve, reject) => {
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType }));
      recorder.onerror = () => reject(new Error('Video encoding failed.'));
    });
    const start = performance.now();
    const duration = value('duration') * 1000;
    recorder.start();
    const advance = now => {
      const progress = (now - start) / duration;
      if (progress >= 1) {
        if (recorder.state !== 'inactive') recorder.stop();
        return;
      }
      draw(Math.max(0, progress), alpha);
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
    return await result;
  } finally {
    cancelAnimationFrame(frame);
    stream.getTracks().forEach(track => track.stop());
  }
}
$('download').onclick = async () => {
  const format = $('format').value;
  const still = format === 'png' || format === 'png-scene';
  const alpha = format === 'alpha' || format === 'png';
  const candidates = format === 'mp4' ? ['video/mp4;codecs=avc1.420034', 'video/mp4'] :
    alpha ? ['video/webm;codecs=vp9'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  const mime = candidates.find(type => globalThis.MediaRecorder?.isTypeSupported(type));
  if (!still && (!mime || !renderer.domElement.captureStream)) {
    $('exportInfo').textContent = 'This browser cannot record that format. Try another format or browser.';
    return;
  }
  capturing = true;
  const dialog = $('exportDialog');
  dialog.querySelectorAll('button, select').forEach(control => { control.disabled = true; });
  $('exportInfo').textContent = still ? 'Rendering still…' : 'Recording one loop. Keep this tab visible.';
  try {
    renderer.setPixelRatio(1);
    const ratio = value('ratio');
    renderer.setSize(1080, ratio === 1 ? 1080 : 1920, false);
    draw(still ? phase : 0, alpha);
    if (still) {
      save(await new Promise(resolve => renderer.domElement.toBlob(resolve, 'image/png')), 'png');
    } else {
      save(await record(mime, alpha), format === 'mp4' ? 'mp4' : 'webm');
    }
    $('exportInfo').textContent = alpha && format !== 'png' ?
      'Download started. Check transparency in your editor before using the clip.' : 'Download started.';
  } catch (error) {
    $('exportInfo').textContent = error.message;
  } finally {
    capturing = false;
    dialog.querySelectorAll('button, select').forEach(control => { control.disabled = false; });
    resize();
  }
};
$('format').onchange = () => {
  const format = $('format').value;
  $('exportInfo').textContent = format.startsWith('png') ? 'Exports the current angle, material, and lighting as a still image.' : format === 'alpha' ?
    'Transparent WebM depends on the browser encoder and your editor. PNG preserves transparency for a still.' :
    'Video records one full loop. Keep this tab visible during export.';
};
try { setup(); } catch (error) { status('Could not start the 3D preview. ' + error.message); }







