// Flexible Flyer Configurator — ES module
// - Imports Three.js and OrbitControls via ESM
// - Provides parameter UI, exports, save/load, OpenSCAD integration hooks

import * as THREE from 'three';
import { OrbitControls as OrbitControlsClass } from 'three/examples/jsm/controls/OrbitControls.js';

(function () {
  const state = {
    three: {
      scene: null,
      camera: null,
      renderer: null,
      modelGroup: null,
      animationId: null,
      controls: null,
    },
    openscad: {
      module: null,
      loading: false,
      loaded: false,
      unavailable: false,
      modelsLoaded: false,
    },
  };

  function $(sel) {
    return document.querySelector(sel);
  }

  function bindSliderValue(sliderId, valueId) {
    const slider = document.getElementById(sliderId);
    const valueEl = document.getElementById(valueId);
    if (!slider || !valueEl) return;
    const set = () => (valueEl.textContent = slider.value);
    slider.addEventListener('input', set);
    set();
  }

  // readParameters is defined later with validation

  function setStatus(msg) {
    const el = $('#status-text');
    if (el) el.textContent = msg;
  }

  // --- Three.js Setup ---
  function initThree() {
    const container = $('#viewport');
    if (!container) {
      console.warn('Viewport container not found');
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0c10);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    camera.position.set(220, 180, 220);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const rect = container.getBoundingClientRect();
    renderer.setSize(rect.width, rect.height);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(1, 2, 1);
    scene.add(dir);

    // Grid + axes
    const grid = new THREE.GridHelper(600, 30, 0x334155, 0x1f2937);
    grid.position.y = -0.01;
    scene.add(grid);
    const axes = new THREE.AxesHelper(100);
    scene.add(axes);

    const modelGroup = new THREE.Group();
    scene.add(modelGroup);

    // Placeholder cube for testing
    const cubeGeo = new THREE.BoxGeometry(40, 40, 40);
    const cubeMat = new THREE.MeshStandardMaterial({ color: 0x58a6ff, metalness: 0.1, roughness: 0.5 });
    const cube = new THREE.Mesh(cubeGeo, cubeMat);
    cube.position.set(0, 20, 0);
    modelGroup.add(cube);

    // OrbitControls (fallback to simple custom controls if not available)
    let controls = null;
    if (OrbitControlsClass) {
      controls = new OrbitControlsClass(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.target.set(0, 20, 0);
    } else {
      console.warn('OrbitControls not found. Using SimpleOrbitControls.');
      controls = new SimpleOrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.target.set(0, 20, 0);
    }

    state.three = { scene, camera, renderer, modelGroup, animationId: null, controls };

    // Handle resize
    window.addEventListener('resize', () => onResize(container));
    onResize(container);

    animate();
  }

  function onResize(container) {
    const { camera, renderer } = state.three;
    if (!camera || !renderer) return;
    const rect = container.getBoundingClientRect();
    camera.aspect = (rect.width || 1) / (rect.height || 1);
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height);
  }

  function animate() {
    const { scene, camera, renderer, modelGroup, controls } = state.three;
    if (!scene || !camera || !renderer) return;
    state.three.animationId = requestAnimationFrame(animate);

    // Update controls for damping
    if (controls && controls.update) controls.update();

    renderer.render(scene, camera);
  }

  // --- Simple fallback OrbitControls ---
  function SimpleOrbitControls(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = new THREE.Vector3(0, 0, 0);
    this.enableDamping = false;
    this.dampingFactor = 0.05;
    this.rotateSpeed = 0.005;
    this.panSpeed = 0.002;
    this.zoomSpeed = 0.2;

    const scope = this;
    let isRotating = false;
    let isPanning = false;
    let lastX = 0, lastY = 0;
    let spherical = new THREE.Spherical();
    const offset = new THREE.Vector3();

    function updateSpherical() {
      offset.copy(scope.camera.position).sub(scope.target);
      spherical.setFromVector3(offset);
    }

    function applySpherical() {
      offset.setFromSpherical(spherical).add(scope.target);
      scope.camera.position.copy(offset);
      scope.camera.lookAt(scope.target);
    }

    function onPointerDown(e) {
      if (e.button === 0) isRotating = true;
      if (e.button === 2 || e.button === 1) isPanning = true;
      lastX = e.clientX; lastY = e.clientY;
      updateSpherical();
      scope.domElement.setPointerCapture(e.pointerId || 0);
    }
    function onPointerMove(e) {
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      if (isRotating) {
        spherical.theta -= dx * scope.rotateSpeed;
        spherical.phi -= dy * scope.rotateSpeed;
        const eps = 1e-3;
        spherical.phi = Math.max(eps, Math.min(Math.PI - eps, spherical.phi));
      } else if (isPanning) {
        const pan = new THREE.Vector3();
        const panX = -dx * scope.panSpeed;
        const panY = dy * scope.panSpeed;
        // Pan in screen space relative to camera
        const te = scope.camera.matrix.elements;
        // camera X axis
        pan.set(te[0], te[1], te[2]).multiplyScalar(panX);
        // camera Y axis
        pan.add(new THREE.Vector3(te[4], te[5], te[6]).multiplyScalar(panY));
        scope.target.add(pan);
      }
      applySpherical();
    }
    function onPointerUp(e) {
      isRotating = false;
      isPanning = false;
      try { scope.domElement.releasePointerCapture(e.pointerId || 0); } catch (_) {}
    }
    function onWheel(e) {
      e.preventDefault();
      updateSpherical();
      const delta = e.deltaY * scope.zoomSpeed * 0.01;
      spherical.radius *= (1 + delta);
      spherical.radius = Math.max(1, Math.min(5000, spherical.radius));
      applySpherical();
    }

    this.update = function () {
      // basic impl; damping not applied to spherical now
    };
    this.dispose = function () {
      this.domElement.removeEventListener('pointerdown', onPointerDown);
      this.domElement.removeEventListener('pointermove', onPointerMove);
      this.domElement.removeEventListener('pointerup', onPointerUp);
      this.domElement.removeEventListener('wheel', onWheel);
    };
    this.target.set(0, 0, 0);
    updateSpherical();
    applySpherical();

    this.domElement.addEventListener('pointerdown', onPointerDown);
    this.domElement.addEventListener('pointermove', onPointerMove);
    this.domElement.addEventListener('pointerup', onPointerUp);
    this.domElement.addEventListener('wheel', onWheel, { passive: false });
  }

  // --- STL parsing helpers (ASCII + Binary) ---
  function bufferGeometryFromSTL(data) {
    if (typeof data === 'string') {
      return bufferGeometryFromAsciiSTL(data);
    }
    // data is Uint8Array or ArrayBuffer
    const arrBuf = data.buffer ? data.buffer : data;
    if (looksLikeASCII(arrBuf)) {
      const text = new TextDecoder('utf-8').decode(new Uint8Array(arrBuf));
      return bufferGeometryFromAsciiSTL(text);
    }
    return bufferGeometryFromBinarySTL(arrBuf);
  }

  function looksLikeASCII(arrayBuffer) {
    if (arrayBuffer.byteLength < 84) return false; // binary min size
    const head = new TextDecoder('utf-8').decode(new Uint8Array(arrayBuffer, 0, Math.min(80, arrayBuffer.byteLength)));
    return head.trim().toLowerCase().startsWith('solid');
  }

  function bufferGeometryFromAsciiSTL(text) {
    const patternVertex = /vertex\s+([\-+eE0-9\.]+)\s+([\-+eE0-9\.]+)\s+([\-+eE0-9\.]+)/g;
    const vertices = [];
    let match;
    while ((match = patternVertex.exec(text)) !== null) {
      vertices.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]));
    }
    const posArray = new Float32Array(vertices);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    return geometry;
  }

  function bufferGeometryFromBinarySTL(arrayBuffer) {
    const dv = new DataView(arrayBuffer);
    const faces = dv.getUint32(80, true);
    const dataOffset = 84;
    const stride = 50; // 12*4 (norm + 3 verts) + 2 attr
    const positions = new Float32Array(faces * 9);
    const normals = new Float32Array(faces * 9);
    let offsetPos = 0;
    let offsetNor = 0;
    for (let i = 0; i < faces; i++) {
      const off = dataOffset + i * stride;
      const nx = dv.getFloat32(off + 0, true);
      const ny = dv.getFloat32(off + 4, true);
      const nz = dv.getFloat32(off + 8, true);
      for (let v = 0; v < 3; v++) {
        const vx = dv.getFloat32(off + 12 + v * 12 + 0, true);
        const vy = dv.getFloat32(off + 12 + v * 12 + 4, true);
        const vz = dv.getFloat32(off + 12 + v * 12 + 8, true);
        positions[offsetPos++] = vx;
        positions[offsetPos++] = vy;
        positions[offsetPos++] = vz;
        normals[offsetNor++] = nx;
        normals[offsetNor++] = ny;
        normals[offsetNor++] = nz;
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.computeBoundingBox();
    return geometry;
  }

  function replaceModelWithGeometry(geometry) {
    const { modelGroup } = state.three;
    if (!modelGroup) return;
    while (modelGroup.children.length) {
      const obj = modelGroup.children.pop();
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) obj.material.dispose();
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0x7ee787, metalness: 0.1, roughness: 0.6 });
    // Center geometry around origin, then lift to grid
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox;
    if (bb) {
      const center = bb.getCenter(new THREE.Vector3());
      geometry.translate(-center.x, -center.y, -center.z);
      geometry.computeBoundingBox();
    }
    const mesh = new THREE.Mesh(geometry, mat);
    geometry.computeBoundingBox();
    const bb2 = geometry.boundingBox;
    const lift = bb2 ? -bb2.min.y : 0;
    mesh.position.set(0, lift, 0);
    modelGroup.add(mesh);
    // Reset controls target to model center
    if (state.three.controls) {
      state.three.controls.target.set(0, lift, 0);
    }
  }

  function buildPreviewGeometryFromParameters(p) {
    const width = Math.max(1, Number(p.palm_width) || 70);
    const length = Math.max(1, Number(p.palm_length) || 100);
    const height = 12; // simple fixed thickness preview
    const geo = new THREE.BoxGeometry(width, height, length);
    return geo;
  }

  // --- OpenSCAD WASM integration ---
  async function ensureOpenSCADModule() {
    if (state.openscad.unavailable) return null;
    if (state.openscad.loaded && state.openscad.module) return state.openscad.module;
    if (state.openscad.loading) {
      // Wait until it loads
      return new Promise((resolve) => {
        const check = () => {
          if (state.openscad.loaded && state.openscad.module) resolve(state.openscad.module);
          else setTimeout(check, 50);
        };
        check();
      });
    }
    state.openscad.loading = true;
    setStatus('Loading OpenSCAD WASM…');
    try {
      // Try to load loader script dynamically if not present
      if (typeof window.OpenSCAD === 'undefined') {
        await loadScript('/libs/openscad.js');
      }
      if (typeof window.OpenSCAD === 'undefined') {
        throw new Error('openscad.js loader not found in /libs');
      }
      const mod = await window.OpenSCAD({ locateFile: (p) => (p.endsWith('.wasm') ? 'libs/openscad.wasm' : p) });
      state.openscad.module = mod;
      state.openscad.loaded = true;
      setStatus('OpenSCAD loaded.');
      return mod;
    } catch (e) {
      console.error('OpenSCAD load error:', e);
      setStatus('OpenSCAD not available.');
      state.openscad.loading = false;
      state.openscad.loaded = false;
      state.openscad.module = null;
      state.openscad.unavailable = true;
      return null;
    }
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load script: ' + src));
      document.head.appendChild(s);
    });
  }

  async function ensureScadModels(mod) {
    if (state.openscad.modelsLoaded) return;
    try { mod.FS.mkdir('models'); } catch (_) {}
    const files = [
      'pipe.scad',
      'segmented_pipe_tensor.scad',
      'fingerator.scad',
      'paraglider_palm_left.scad',
      'paraglider_palm_unlimbited_v3.scad',
      'thermo_gauntlet.scad',
      'UnLimbited_Arm_paraglider_v2.1.scad',
    ];
    for (const name of files) {
      const url = `/models/${name}`;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        mod.FS.writeFile(`models/${name}`, text);
      } catch (e) {
        console.warn(`Failed to load model file: ${url}`, e);
      }
    }
    state.openscad.modelsLoaded = true;
  }

  async function compileSCADToSTL(scadSource) {
    const mod = await ensureOpenSCADModule();
    if (!mod) throw new Error('OpenSCAD module not loaded');
    await ensureScadModels(mod);
    const inName = 'model.scad';
    const outName = 'model.stl';
    try {
      // Clean previous files if exist
      try { mod.FS.unlink(inName); } catch (_) {}
      try { mod.FS.unlink(outName); } catch (_) {}
      mod.FS.writeFile(inName, scadSource);
      if (typeof mod.callMain === 'function') {
        mod.callMain(['-o', outName, inName]);
      } else if (typeof mod._main === 'function') {
        // Fallback: some builds expose _main; cannot easily call with args in JS
        // Try running via callMain if present; otherwise, throw
        throw new Error('OpenSCAD main entry not exposed');
      }
      const out = mod.FS.readFile(outName); // Uint8Array
      return out;
    } catch (e) {
      console.error('OpenSCAD compile error:', e);
      throw e;
    }
  }

  function scadStringLiteral(s, fallback) {
    const v = (s == null || s === '') ? fallback : String(s);
    return '"' + v.replace(/"/g, '\\"').slice(0, 15) + '"';
  }

  function buildPalmScadFromParameters(p) {
    const overall_scale = ((Number(p.palm_width) || 70) / 56).toFixed(4);
    const mirrored = !!p.mirrored;
    const serial_line1 = scadStringLiteral(p.serial_line1, 'Pedro');
    const serial_line2 = scadStringLiteral(p.serial_line2, 'TestHand');
    const today = new Date().toISOString().slice(0, 10);
    const serial_line3 = scadStringLiteral(p.serial_line3, today);
    const include_wrist_stamping_die = p.include_wrist_stamping_die !== undefined ? !!p.include_wrist_stamping_die : true;
    const pivot_size = (Number(p.pivot_size) || 1.5875);
    const pivot_extra_clearance = Number.isFinite(p.pivot_extra_clearance) ? p.pivot_extra_clearance : 0.0;
    const pins = p.pins !== undefined ? !!p.pins : true;
    const plugs = p.plugs !== undefined ? !!p.plugs : true;
    const include_mesh = p.include_mesh !== undefined ? (p.include_mesh ? 1 : 0) : 1;
    const include_knuckle_covers = p.include_knuckle_covers !== undefined ? !!p.include_knuckle_covers : true;
    const string_channel_scale = Number.isFinite(p.string_channel_scale) ? p.string_channel_scale : 0.9;
    const elastic_channel_scale = Number.isFinite(p.elastic_channel_scale) ? p.elastic_channel_scale : 0.9;
    const old_style_wrist = p.old_style_wrist !== undefined ? !!p.old_style_wrist : false;

    const header = `overall_scale = ${overall_scale};
mirrored = ${mirrored};
serial_line1 = ${serial_line1};
serial_line2 = ${serial_line2};
serial_line3 = ${serial_line3};
include_wrist_stamping_die = ${include_wrist_stamping_die};
pivot_size = ${pivot_size};
pivot_extra_clearance = ${pivot_extra_clearance};
pins = ${pins};
plugs = ${plugs};
include_mesh = ${include_mesh};
include_knuckle_covers = ${include_knuckle_covers};
string_channel_scale = ${string_channel_scale};
elastic_channel_scale = ${elastic_channel_scale};
old_style_wrist = ${old_style_wrist};

include <models/pipe.scad>;
include <models/segmented_pipe_tensor.scad>;
include <models/fingerator.scad>;
include <models/paraglider_palm_left.scad>;

scaled_palm();
`;
    return header;
  }

  // --- Update Model: compile OpenSCAD and display ---
  function updateModel() {
    const parameters = readParameters();
    console.log('Parameters:', parameters);
    const scad = buildPalmScadFromParameters(parameters);
    setStatus('Compiling OpenSCAD…');

    ensureOpenSCADModule()
      .then((mod) => {
        if (!mod) {
          setStatus('OpenSCAD engine not available. Add libs/openscad.js and libs/openscad.wasm');
          return Promise.reject(new Error('OpenSCAD not available'));
        }
        return compileSCADToSTL(scad);
      })
      .then((stl) => {
        let geometry;
        try {
          geometry = bufferGeometryFromSTL(stl);
        } catch (parseErr) {
          // Try decoding as text and re-parse
          try {
            const text = new TextDecoder('utf-8').decode(stl);
            geometry = bufferGeometryFromSTL(text);
          } catch (e) {
            throw parseErr;
          }
        }
        replaceModelWithGeometry(geometry);
        setStatus('Model updated.');
      })
      .catch((err) => {
        console.error('Compilation failed:', err);
        console.log('SCAD source used:\n' + scad);
        // Fallback: build a preview geometry so users still see updates
        const preview = buildPreviewGeometryFromParameters(parameters);
        replaceModelWithGeometry(preview);
        setStatus('Preview updated (OpenSCAD not available).');
      });
  }

  // --- STL Export (ASCII) ---
  function exportAsciiSTL() {
    const { modelGroup } = state.three;
    if (!modelGroup) return;

    const triangles = [];

    modelGroup.traverse((obj) => {
      if (!obj.isMesh) return;
      const geometry = obj.geometry;
      const matrixWorld = obj.matrixWorld;
      const posAttr = geometry.getAttribute('position');
      const indexAttr = geometry.getIndex();

      const vA = new THREE.Vector3();
      const vB = new THREE.Vector3();
      const vC = new THREE.Vector3();
      const n = new THREE.Vector3();

      const pushTri = (aIdx, bIdx, cIdx) => {
        vA.fromBufferAttribute(posAttr, aIdx).applyMatrix4(matrixWorld);
        vB.fromBufferAttribute(posAttr, bIdx).applyMatrix4(matrixWorld);
        vC.fromBufferAttribute(posAttr, cIdx).applyMatrix4(matrixWorld);
        // normal
        n.subVectors(vB, vA).cross(vC.clone().sub(vA)).normalize();
        triangles.push({ n: n.clone(), a: vA.clone(), b: vB.clone(), c: vC.clone() });
      };

      if (indexAttr) {
        for (let i = 0; i < indexAttr.count; i += 3) {
          pushTri(indexAttr.getX(i), indexAttr.getX(i + 1), indexAttr.getX(i + 2));
        }
      } else {
        for (let i = 0; i < posAttr.count; i += 3) {
          pushTri(i, i + 1, i + 2);
        }
      }
    });

    let stl = 'solid model\n';
    for (const t of triangles) {
      stl += `  facet normal ${t.n.x} ${t.n.y} ${t.n.z}\n`;
      stl += '    outer loop\n';
      stl += `      vertex ${t.a.x} ${t.a.y} ${t.a.z}\n`;
      stl += `      vertex ${t.b.x} ${t.b.y} ${t.b.z}\n`;
      stl += `      vertex ${t.c.x} ${t.c.y} ${t.c.z}\n`;
      stl += '    endloop\n';
      stl += '  endfacet\n';
    }
    stl += 'endsolid model\n';

    const blob = new Blob([stl], { type: 'model/stl' });
    downloadBlob(blob, 'flexible_flyer.stl');
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // --- STL Export helpers ---
  function buildTrianglesFromObject(object3d) {
    const triangles = [];
    object3d.updateMatrixWorld(true);
    object3d.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return;
      const geometry = obj.geometry;
      const matrixWorld = obj.matrixWorld;
      const posAttr = geometry.getAttribute('position');
      if (!posAttr) return;
      const indexAttr = geometry.getIndex();
      const vA = new THREE.Vector3();
      const vB = new THREE.Vector3();
      const vC = new THREE.Vector3();
      const n = new THREE.Vector3();
      const pushTri = (aIdx, bIdx, cIdx) => {
        vA.fromBufferAttribute(posAttr, aIdx).applyMatrix4(matrixWorld);
        vB.fromBufferAttribute(posAttr, bIdx).applyMatrix4(matrixWorld);
        vC.fromBufferAttribute(posAttr, cIdx).applyMatrix4(matrixWorld);
        n.subVectors(vB, vA).cross(vC.clone().sub(vA)).normalize();
        triangles.push({ n: n.clone(), a: vA.clone(), b: vB.clone(), c: vC.clone() });
      };
      if (indexAttr) {
        for (let i = 0; i < indexAttr.count; i += 3) {
          pushTri(indexAttr.getX(i), indexAttr.getX(i + 1), indexAttr.getX(i + 2));
        }
      } else {
        for (let i = 0; i < posAttr.count; i += 3) {
          pushTri(i, i + 1, i + 2);
        }
      }
    });
    return triangles;
  }

  function trianglesToAsciiSTL(triangles, name = 'model') {
    let stl = `solid ${name}\n`;
    for (const t of triangles) {
      stl += `  facet normal ${t.n.x} ${t.n.y} ${t.n.z}\n`;
      stl += '    outer loop\n';
      stl += `      vertex ${t.a.x} ${t.a.y} ${t.a.z}\n`;
      stl += `      vertex ${t.b.x} ${t.b.y} ${t.b.z}\n`;
      stl += `      vertex ${t.c.x} ${t.c.y} ${t.c.z}\n`;
      stl += '    endloop\n';
      stl += '  endfacet\n';
    }
    stl += `endsolid ${name}\n`;
    return stl;
  }

  function exportSTLCombined() {
    const { modelGroup } = state.three;
    if (!modelGroup) return;
    console.log('Exporting STL…');
    setStatus('Exporting STL…');
    const tris = buildTrianglesFromObject(modelGroup);
    if (!tris.length) {
      setStatus('No geometry to export.');
      return;
    }
    const stl = trianglesToAsciiSTL(tris, 'prosthesis_model');
    const blob = new Blob([stl], { type: 'model/stl' });
    downloadBlob(blob, 'prosthesis_model.stl');
    console.log('Exporting STL… done');
    setStatus('Exporting STL… done');
  }

  async function ensureJSZip() {
    if (window.JSZip) return window.JSZip;
    try {
      await loadScript('/libs/jszip.min.js');
      return window.JSZip || null;
    } catch (_) {
      return null;
    }
  }

  async function exportSTLComponentsZip() {
    const { modelGroup } = state.three;
    if (!modelGroup) return;
    console.log('Exporting STL components to ZIP…');
    setStatus('Exporting STL components…');
    const JSZip = await ensureJSZip();
    if (!JSZip) {
      alert('Component ZIP export requires JSZip; please include it in libs/ as jszip.min.js');
      console.warn('Exporting STL components… not available (JSZip missing)');
      return;
    }
    const zip = new JSZip();
    modelGroup.updateMatrixWorld(true);
    let count = 0;
    modelGroup.children.forEach((child, idx) => {
      if (!child.isMesh && !child.isGroup) return;
      const tris = buildTrianglesFromObject(child);
      if (!tris.length) return;
      const name = child.name || (child.isGroup ? `component_group_${idx}` : `component_${idx}`);
      const stl = trianglesToAsciiSTL(tris, name);
      zip.file(`${name}.stl`, stl);
      count++;
    });
    if (count === 0) {
      const tris = buildTrianglesFromObject(modelGroup);
      if (!tris.length) {
        setStatus('No geometry to export.');
        return;
      }
      zip.file('component_0.stl', trianglesToAsciiSTL(tris, 'component_0'));
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, 'prosthesis_components.zip');
    console.log('Exporting STL components… done');
    setStatus('Exporting STL components… done');
  }

  function onExportSTLClick() {
    const separate = confirm('Export separate components as ZIP?\nOK = Separate components (ZIP)\nCancel = Single STL');
    if (separate) exportSTLComponentsZip();
    else exportSTLCombined();
  }

  // --- STEP Export wrapper ---
  async function ensureOpenCascade() {
    const g = window;
    if (g.oc || g.opencascade) return g.oc || g.opencascade;
    try {
      await loadScript('/libs/opencascade.wasm.js');
      return g.oc || g.opencascade || null;
    } catch (_) {
      try {
        await loadScript('/libs/opencascade.js');
        return g.oc || g.opencascade || null;
      } catch (__) {
        return null;
      }
    }
  }

  async function exportSTEP() {
    console.log('Exporting STEP…');
    setStatus('Exporting STEP…');
    const oc = await ensureOpenCascade();
    if (!oc) {
      alert('STEP export requires OpenCascade.js; please include it in libs/');
      console.warn('Exporting STEP… not available');
      setStatus('Exporting STEP… not available');
      return;
    }
    try {
      // Placeholder: convert current STL triangles into a STEP solid would require
      // meshing-to-BRep which is non-trivial. This is a stub to illustrate flow.
      alert('STEP export is integrated but conversion implementation is pending.');
      console.log('Exporting STEP… done (stub)');
      setStatus('Exporting STEP… done (stub)');
    } catch (e) {
      console.error('STEP export failed:', e);
      setStatus('STEP export failed. See console.');
    }
  }

  // --- OpenSCAD WASM loader (placeholder) ---
  // Step 3 integrated above.

  // --- Wire UI ---
  function initUI() {
    bindSliderValue('palm_width', 'palm_width_val');
    bindSliderValue('palm_length', 'palm_length_val');
    bindSliderValue('finger_length_index', 'finger_length_index_val');
    bindSliderValue('finger_length_middle', 'finger_length_middle_val');
    bindSliderValue('finger_length_ring', 'finger_length_ring_val');
    bindSliderValue('finger_length_pinky', 'finger_length_pinky_val');
    bindSliderValue('joint_clearance', 'joint_clearance_val');
    bindSliderValue('pivot_extra_clearance', 'pivot_extra_clearance_val');
    bindSliderValue('string_channel_scale', 'string_channel_scale_val');
    bindSliderValue('elastic_channel_scale', 'elastic_channel_scale_val');

    $('#updateBtn').addEventListener('click', updateModel);
    $('#exportStlBtn').addEventListener('click', onExportSTLClick);
    $('#exportStepBtn').addEventListener('click', exportSTEP);
    $('#saveConfigBtn').addEventListener('click', saveConfig);
    $('#loadConfigBtn').addEventListener('click', triggerLoadConfig);
  }

  // --- Save/Load Config ---
  function clampToRange(val, min, max) {
    const v = Number(val);
    if (Number.isNaN(v)) return min;
    return Math.min(max, Math.max(min, v));
  }

  function readSliderValue(id) {
    const el = document.getElementById(id);
    const min = Number(el.min);
    const max = Number(el.max);
    let v = Number(el.value);
    v = clampToRange(v, min, max);
    if (v !== Number(el.value)) el.value = String(v);
    const valEl = document.getElementById(id + '_val');
    if (valEl) valEl.textContent = String(v);
    return v;
  }

  function readParameters() {
    return {
      palm_width: readSliderValue('palm_width'),
      palm_length: readSliderValue('palm_length'),
      finger_length_index: readSliderValue('finger_length_index'),
      finger_length_middle: readSliderValue('finger_length_middle'),
      finger_length_ring: readSliderValue('finger_length_ring'),
      finger_length_pinky: readSliderValue('finger_length_pinky'),
      joint_clearance: readSliderValue('joint_clearance'),
      mirrored: !!document.getElementById('mirrored').checked,
      serial_line1: String(document.getElementById('serial_line1').value || '').slice(0, 15),
      serial_line2: String(document.getElementById('serial_line2').value || '').slice(0, 15),
      serial_line3: String(document.getElementById('serial_line3').value || '').slice(0, 15),
      include_wrist_stamping_die: !!document.getElementById('include_wrist_stamping_die').checked,
      pivot_size: parseFloat(document.getElementById('pivot_size').value || '1.5875'),
      pivot_extra_clearance: readSliderValue('pivot_extra_clearance'),
      pins: !!document.getElementById('pins').checked,
      plugs: !!document.getElementById('plugs').checked,
      include_mesh: !!document.getElementById('include_mesh').checked,
      include_knuckle_covers: !!document.getElementById('include_knuckle_covers').checked,
      old_style_wrist: !!document.getElementById('old_style_wrist').checked,
      string_channel_scale: readSliderValue('string_channel_scale'),
      elastic_channel_scale: readSliderValue('elastic_channel_scale'),
    };
  }

  function setSliderValue(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    const min = Number(el.min);
    const max = Number(el.max);
    const v = clampToRange(value, min, max);
    el.value = String(v);
    const valEl = document.getElementById(id + '_val');
    if (valEl) valEl.textContent = String(v);
  }

  function saveConfig() {
    const config = readParameters();
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    downloadBlob(blob, 'prosthesis_config.json');
    setStatus('Config saved.');
  }

  function triggerLoadConfig() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const cfg = JSON.parse(String(fr.result || '{}'));
          applyConfig(cfg);
          setStatus('Config loaded.');
          updateModel();
        } catch (e) {
          console.error('Invalid config JSON:', e);
          alert('Invalid config file.');
        }
      };
      fr.readAsText(file);
    });
    input.click();
  }

  function applyConfig(cfg) {
    const sliderKeys = [
      'palm_width',
      'palm_length',
      'finger_length_index',
      'finger_length_middle',
      'finger_length_ring',
      'finger_length_pinky',
      'joint_clearance',
      'pivot_extra_clearance',
      'string_channel_scale',
      'elastic_channel_scale',
    ];
    for (const k of sliderKeys) {
      if (cfg[k] !== undefined) setSliderValue(k, cfg[k]);
    }
    // Booleans
    const bools = [
      'mirrored',
      'include_wrist_stamping_die',
      'pins',
      'plugs',
      'include_mesh',
      'include_knuckle_covers',
      'old_style_wrist',
    ];
    for (const b of bools) {
      if (cfg[b] !== undefined) {
        const el = document.getElementById(b);
        if (el) el.checked = !!cfg[b];
      }
    }
    // Text
    const texts = ['serial_line1', 'serial_line2', 'serial_line3'];
    for (const t of texts) {
      if (cfg[t] !== undefined) {
        const el = document.getElementById(t);
        if (el) el.value = String(cfg[t]).slice(0, 15);
      }
    }
    // Selects
    if (cfg.pivot_size !== undefined) {
      const el = document.getElementById('pivot_size');
      if (el) el.value = String(cfg.pivot_size);
    }
  }

  // --- Boot ---
  window.addEventListener('DOMContentLoaded', async () => {
    try {
      if (typeof THREE === 'undefined') {
        setStatus('Three.js not found. Place three.min.js in /libs.');
        console.error('Three.js not found.');
        return;
      }
      initThree();
      initUI();
      setStatus('Ready.');
    } catch (e) {
      console.error(e);
      setStatus('Initialization error. Check console.');
    }
  });
})();
