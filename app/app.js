// Neon Palms Cover Studio — an offline web app that turns any photo and a
// caption into GTA 6-style cover art: multi-panel poster layouts, sunset and
// neon colour grades, bold lettering, PNG export in the common post sizes.
// Everything runs in the browser; photos are read on the machine and never
// uploaded. No network requests anywhere.

'use strict';

var SAMPLE_PHOTOS = [
  { id: 'boulevard', name: 'Boulevard', src: 'samples/boulevard.jpg' },
  { id: 'pier', name: 'Pier', src: 'samples/pier.jpg' }
];

var LAYOUTS = {
  grid9: { label: 'Nine panel', hint: 'The classic poster grid, title in the middle' },
  hero3: { label: 'Hero + three', hint: 'One big hero photo over three small panels' },
  hero: { label: 'Full bleed', hint: 'One photo, edge to edge, title over it' },
  diptych: { label: 'Diptych', hint: 'Two tall panels side by side' },
  triptych: { label: 'Triptych', hint: 'Three tall panels side by side' },
  tilt: { label: 'Tilted snaps', hint: 'Overlapping tilted snapshot cards' }
};

var GRADES = {
  sunset: { label: 'Sunset', filter: 'saturate(1.25) contrast(1.08) brightness(1.02) sepia(0.25) hue-rotate(-8deg)' },
  neon: { label: 'Neon', filter: 'saturate(1.6) contrast(1.15) brightness(1.05) hue-rotate(12deg)' },
  dusk: { label: 'Dusk', filter: 'saturate(0.9) contrast(1.1) brightness(0.9) sepia(0.15)' },
  mono: { label: 'Mono', filter: 'grayscale(1) contrast(1.15) brightness(1.05)' },
  vice: { label: 'Vice', filter: 'saturate(1.4) contrast(1.1) hue-rotate(-15deg)' }
};

var SIZES = {
  square: { label: 'Square', w: 1080, h: 1080 },
  portrait: { label: 'Portrait', w: 1080, h: 1350 },
  story: { label: 'Story', w: 1080, h: 1920 },
  wide: { label: 'Wide', w: 1920, h: 1080 }
};

function defaultState() {
  return {
    layout: 'grid9',
    grade: 'sunset',
    size: 'square',
    title: 'NEON PALMS',
    subtitle: 'a cover story',
    badge: 'LAUNCH WEEK',
    heat: 5,
    grain: true,
    vignette: true,
    selectedPanel: 0,
    // One panel entry per photo slot, in slot order; layouts use the first N.
    panels: [
      { photo: 'boulevard', zoom: 1, ox: 0, oy: 0 },
      { photo: 'pier', zoom: 1, ox: 0, oy: 0 },
      { photo: 'boulevard', zoom: 1.15, ox: 0, oy: 0 },
      { photo: 'pier', zoom: 1.1, ox: 0, oy: 0 },
      { photo: 'boulevard', zoom: 1.25, ox: 0.05, oy: 0 },
      { photo: 'pier', zoom: 1, ox: 0, oy: 0 },
      { photo: 'boulevard', zoom: 1, ox: 0, oy: 0 },
      { photo: 'pier', zoom: 1.2, ox: -0.05, oy: 0 },
      { photo: 'boulevard', zoom: 1, ox: 0, oy: 0 }
    ]
  };
}

var state = defaultState();
var photos = []; // {id, name, img, w, h}
var photoById = {};

// Seeded random so grain is identical on every render of the same cover.
function mulberry32(seed) {
  var a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s) {
  var h = 2166136261;
  for (var i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

var noiseCanvas = null;
function makeNoisePattern(ctx) {
  if (noiseCanvas) return noiseCanvas;
  var c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  var g = c.getContext('2d');
  var img = g.createImageData(128, 128);
  var rnd = mulberry32(20261119);
  for (var i = 0; i < img.data.length; i += 4) {
    var v = Math.floor(rnd() * 255);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  noiseCanvas = c;
  return c;
}

// Layout geometry: photo slots as fractions of the inner cover rect.
// kind 'title' is the title cell (grid9 centre); 'overlay' layouts draw the
// title block on top of the photos instead.
function layoutSlots(layout, W, H) {
  var g = 0.012; // gutter, as a fraction of the inner width
  var gw = g * W, gh = g * H;
  if (layout === 'grid9') {
    var cw = (W - 2 * gw) / 3, ch = (H - 2 * gh) / 3;
    var slots = [];
    var p = 0;
    for (var r = 0; r < 3; r++) {
      for (var c = 0; c < 3; c++) {
        var s = { x: c * (cw + gw), y: r * (ch + gh), w: cw, h: ch };
        if (r === 1 && c === 1) { s.kind = 'title'; } else { s.kind = 'photo'; s.index = p++; }
        slots.push(s);
      }
    }
    return slots;
  }
  if (layout === 'hero3') {
    var heroH = H * 0.63;
    var bw = (W - 2 * gw) / 3, bh = H - heroH - gh;
    return [
      { x: 0, y: 0, w: W, h: heroH, kind: 'photo', index: 0 },
      { x: 0, y: heroH + gh, w: bw, h: bh, kind: 'photo', index: 1 },
      { x: bw + gw, y: heroH + gh, w: bw, h: bh, kind: 'photo', index: 2 },
      { x: 2 * (bw + gw), y: heroH + gh, w: bw, h: bh, kind: 'photo', index: 3 }
    ];
  }
  if (layout === 'hero') {
    return [{ x: 0, y: 0, w: W, h: H, kind: 'photo', index: 0 }];
  }
  if (layout === 'diptych') {
    var dw = (W - gw) / 2;
    return [
      { x: 0, y: 0, w: dw, h: H, kind: 'photo', index: 0 },
      { x: dw + gw, y: 0, w: dw, h: H, kind: 'photo', index: 1 }
    ];
  }
  if (layout === 'triptych') {
    var tw = (W - 2 * gw) / 3;
    return [
      { x: 0, y: 0, w: tw, h: H, kind: 'photo', index: 0 },
      { x: tw + gw, y: 0, w: tw, h: H, kind: 'photo', index: 1 },
      { x: 2 * (tw + gw), y: 0, w: tw, h: H, kind: 'photo', index: 2 }
    ];
  }
  // tilt: overlapping rotated snapshot cards on a graded background.
  var cw2 = W * 0.42, ch2 = H * 0.56;
  return [
    { x: W * 0.02, y: H * 0.30, w: cw2, h: ch2, kind: 'photo', index: 0, rot: -0.10 },
    { x: W * 0.30, y: H * 0.22, w: cw2, h: ch2, kind: 'photo', index: 1, rot: 0.03 },
    { x: W * 0.56, y: H * 0.30, w: cw2, h: ch2, kind: 'photo', index: 2, rot: 0.12 }
  ];
}

function photoSlots(layout) {
  return layoutSlots(layout, 1, 1).filter(function (s) { return s.kind === 'photo'; }).length;
}

function gradeOverlayStops(grade) {
  if (grade === 'sunset') return [['rgba(255,120,40,0.20)', 0], ['rgba(180,40,120,0.22)', 1]];
  if (grade === 'neon') return [['rgba(255,46,136,0.20)', 0], ['rgba(25,227,214,0.20)', 1]];
  if (grade === 'dusk') return [['rgba(40,60,140,0.20)', 0], ['rgba(10,10,40,0.32)', 1]];
  if (grade === 'vice') return [['rgba(255,46,136,0.16)', 0], ['rgba(25,227,214,0.16)', 1]];
  return null; // mono: the filter alone does it
}

function gradeBackground(grade) {
  if (grade === 'sunset') return ['#2b0f3a', '#ff7a2f'];
  if (grade === 'neon') return ['#12002e', '#ff2e88'];
  if (grade === 'dusk') return ['#0a0a24', '#2c3c8c'];
  if (grade === 'mono') return ['#111111', '#555555'];
  return ['#2a0a2e', '#19e3d6']; // vice
}

function loadPhoto(def) {
  return new Promise(function (resolve) {
    var img = new Image();
    img.onload = function () {
      var rec = { id: def.id, name: def.name, img: img, w: img.naturalWidth, h: img.naturalHeight };
      photos.push(rec);
      photoById[def.id] = rec;
      resolve(rec);
    };
    img.onerror = function () { resolve(null); };
    img.src = def.src;
  });
}

function loadSamples() {
  return Promise.all(SAMPLE_PHOTOS.map(loadPhoto)).then(function () { render(); refreshPhotoUI(); });
}

function addUploadedPhotos(files) {
  var readers = [];
  for (var i = 0; i < files.length; i++) {
    (function (file) {
      readers.push(new Promise(function (resolve) {
        var reader = new FileReader();
        reader.onload = function () {
          var img = new Image();
          img.onload = function () {
            var id = 'up' + Date.now() + '_' + Math.floor(Math.random() * 10000);
            var rec = { id: id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 18) || 'Photo', img: img, w: img.naturalWidth, h: img.naturalHeight };
            photos.push(rec);
            photoById[id] = rec;
            resolve(rec);
          };
          img.onerror = function () { resolve(null); };
          img.src = String(reader.result);
        };
        reader.onerror = function () { resolve(null); };
        reader.readAsDataURL(file);
      }));
    })(files[i]);
  }
  return Promise.all(readers).then(function () { render(); refreshPhotoUI(); });
}

// ---- Cover rendering: the same function draws the preview and the export ----

function fitFont(ctx, text, maxWidth, startPx, family, weight) {
  var px = startPx;
  while (px > 12) {
    ctx.font = weight + ' ' + px + 'px ' + family;
    if (ctx.measureText(text).width <= maxWidth) return px;
    px -= 2;
  }
  return px;
}

function drawStar(ctx, cx, cy, r, filled) {
  ctx.beginPath();
  for (var i = 0; i < 10; i++) {
    var ang = -Math.PI / 2 + i * Math.PI / 5;
    var rad = (i % 2 === 0) ? r : r * 0.45;
    var x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (filled) { ctx.fillStyle = '#ffb020'; ctx.fill(); }
  else { ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = Math.max(1, r * 0.12); ctx.stroke(); }
}

function drawPhotoPanel(ctx, slot, panel, grade, W, H) {
  var photo = photoById[panel.photo];
  ctx.save();
  // Move the origin to the panel's top-left corner, so the clip rect and the
  // photo are both drawn relative to the panel, not the canvas origin.
  ctx.translate(slot.x, slot.y);
  if (slot.rot) {
    ctx.translate(slot.w / 2, slot.h / 2);
    ctx.rotate(slot.rot);
    ctx.translate(-slot.w / 2, -slot.h / 2);
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = slot.w * 0.06;
    ctx.shadowOffsetY = slot.w * 0.03;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-slot.w * 0.03, -slot.w * 0.03, slot.w * 1.06, slot.h * 1.06);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
  }
  ctx.beginPath();
  ctx.rect(0, 0, slot.w, slot.h);
  ctx.clip();
  if (!photo || !photo.img) {
    ctx.fillStyle = '#1c1c2c';
    ctx.fillRect(0, 0, slot.w, slot.h);
    ctx.fillStyle = '#8888aa';
    ctx.font = Math.max(10, slot.w * 0.05) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No photo', slot.w / 2, slot.h / 2);
    ctx.textAlign = 'left';
    ctx.restore();
    return;
  }
  var scale = Math.max(slot.w / photo.w, slot.h / photo.h) * panel.zoom;
  var dw = photo.w * scale, dh = photo.h * scale;
  var dx = (slot.w - dw) / 2 + panel.ox * slot.w;
  var dy = (slot.h - dh) / 2 + panel.oy * slot.h;
  ctx.filter = GRADES[grade].filter;
  ctx.drawImage(photo.img, dx, dy, dw, dh);
  ctx.filter = 'none';
  var stops = gradeOverlayStops(grade);
  if (stops) {
    var grad = ctx.createLinearGradient(0, 0, slot.w * 0.3, slot.h);
    stops.forEach(function (s) { grad.addColorStop(s[1], s[0]); });
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, slot.w, slot.h);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

function drawTitleBlock(ctx, x, y, w, maxH, align) {
  var title = state.title || 'UNTITLED';
  var sub = state.subtitle || '';
  var titlePx = fitFont(ctx, title.toUpperCase(), w, Math.min(w * 0.16, maxH * 0.42), 'Anton', '400');
  var grad = ctx.createLinearGradient(x, y, x, y + titlePx * 1.1);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.55, '#ffe9b0');
  grad.addColorStop(1, '#ff7a2f');
  ctx.fillStyle = grad;
  ctx.font = '400 ' + titlePx + 'px Anton';
  ctx.textAlign = align || 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = titlePx * 0.12;
  ctx.shadowOffsetY = titlePx * 0.04;
  var tx = align === 'center' ? x + w / 2 : x;
  ctx.fillText(title.toUpperCase(), tx, y + titlePx);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  var cy = y + titlePx + titlePx * 0.42;
  if (sub) {
    var subPx = Math.max(10, titlePx * 0.34);
    ctx.fillStyle = '#19e3d6';
    ctx.font = subPx + 'px Pacifico';
    ctx.fillText(sub, tx, cy);
    cy += subPx * 1.1;
  }
  // Heat meter: five stars under the subtitle.
  var starR = Math.max(5, titlePx * 0.11);
  var sx = align === 'center' ? tx - (5 * starR * 2.4) / 2 : tx;
  for (var i = 0; i < 5; i++) {
    drawStar(ctx, sx + i * starR * 2.4 + starR, cy + starR, starR, i < state.heat);
  }
  ctx.textAlign = 'left';
  return cy + starR * 2.4;
}

function drawBadge(ctx, x, y, px) {
  var text = (state.badge || '').toUpperCase();
  if (!text) return;
  ctx.save();
  ctx.font = '400 ' + px + 'px Anton';
  var tw = ctx.measureText(text).width;
  var pad = px * 0.7;
  ctx.translate(x, y);
  ctx.rotate(-0.06);
  ctx.fillStyle = '#ff2e88';
  ctx.fillRect(-pad, -px * 0.95, tw + pad * 2, px * 1.5);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, tw / 2, -px * 0.18);
  ctx.restore();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function renderCover(ctx, W, H, st) {
  // White poster frame, then the inner cover area.
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  var f = Math.max(6, Math.round(W * 0.018));
  var ix = f, iy = f, iw = W - 2 * f, ih = H - 2 * f;
  var bg = gradeBackground(st.grade);
  var bgGrad = ctx.createLinearGradient(ix, iy, ix, iy + ih);
  bgGrad.addColorStop(0, bg[0]);
  bgGrad.addColorStop(1, bg[1]);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(ix, iy, iw, ih);

  var slots = layoutSlots(st.layout, iw, ih);
  var hasTitleCell = slots.some(function (s) { return s.kind === 'title'; });
  slots.forEach(function (slot) {
    var ax = ix + slot.x, ay = iy + slot.y;
    if (slot.kind === 'title') {
      var tg = ctx.createLinearGradient(ax, ay, ax + slot.w, ay + slot.h);
      tg.addColorStop(0, '#160a2e');
      tg.addColorStop(1, '#3a0f4d');
      ctx.fillStyle = tg;
      ctx.fillRect(ax, ay, slot.w, slot.h);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = Math.max(1, W * 0.0015);
      ctx.strokeRect(ax + 2, ay + 2, slot.w - 4, slot.h - 4);
      var inner = { x: ax + slot.w * 0.08, y: ay + slot.h * 0.10, w: slot.w * 0.84, h: slot.h * 0.80 };
      drawTitleBlock(ctx, inner.x, inner.y, inner.w, inner.h, 'left');
      return;
    }
    var panel = st.panels[slot.index] || { photo: 'boulevard', zoom: 1, ox: 0, oy: 0 };
    drawPhotoPanel(ctx, { x: ax, y: ay, w: slot.w, h: slot.h, rot: slot.rot }, panel, st.grade, W, H);
  });

  if (!hasTitleCell) {
    // Title block overlaid on the photos, with a scrim for legibility.
    var scrimH = ih * 0.42;
    var scrim = ctx.createLinearGradient(0, iy + ih - scrimH, 0, iy + ih);
    scrim.addColorStop(0, 'rgba(5,5,15,0)');
    scrim.addColorStop(1, 'rgba(5,5,15,0.72)');
    ctx.fillStyle = scrim;
    ctx.fillRect(ix, iy + ih - scrimH, iw, scrimH);
    var tx = ix + iw * 0.05;
    drawTitleBlock(ctx, tx, iy + ih - scrimH * 0.82, iw * 0.9, scrimH * 0.8, 'left');
    drawBadge(ctx, ix + iw * 0.72, iy + ih * 0.10, Math.max(11, W * 0.016));
  } else {
    drawBadge(ctx, ix + iw * 0.70, iy + ih * 0.055, Math.max(11, W * 0.016));
  }

  // Grain and vignette over the inner area.
  if (st.grain) {
    var pat = ctx.createPattern(makeNoisePattern(ctx), 'repeat');
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = pat;
    ctx.fillRect(ix, iy, iw, ih);
    ctx.restore();
  }
  if (st.vignette) {
    var vg = ctx.createRadialGradient(ix + iw / 2, iy + ih / 2, Math.min(iw, ih) * 0.42, ix + iw / 2, iy + ih / 2, Math.max(iw, ih) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vg;
    ctx.fillRect(ix, iy, iw, ih);
  }
  // Thin inner rule just inside the white frame.
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = Math.max(1, W * 0.0012);
  ctx.strokeRect(ix + 1, iy + 1, iw - 2, ih - 2);
}

// ---- Editor UI, export, shot mode ----

var canvas = document.getElementById('cover');
var ctx = canvas.getContext('2d');
var undoStack = [];
var redoStack = [];
var isShot = false;

function serializable() {
  return {
    layout: state.layout, grade: state.grade, size: state.size,
    title: state.title, subtitle: state.subtitle, badge: state.badge,
    heat: state.heat, grain: state.grain, vignette: state.vignette,
    selectedPanel: state.selectedPanel, panels: state.panels
  };
}

function applySnapshot(snap) {
  var sel = state.selectedPanel;
  state = Object.assign(defaultState(), JSON.parse(JSON.stringify(snap)));
  state.selectedPanel = sel;
  clampSelection();
  syncControls();
}

function commit() {
  undoStack.push(JSON.stringify(serializable()));
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
  syncUndoButtons();
}

function doUndo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(serializable()));
  applySnapshot(JSON.parse(undoStack.pop()));
  render();
  syncUndoButtons();
}

function doRedo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(serializable()));
  applySnapshot(JSON.parse(redoStack.pop()));
  render();
  syncUndoButtons();
}

function syncUndoButtons() {
  document.getElementById('undoBtn').disabled = undoStack.length === 0;
  document.getElementById('redoBtn').disabled = redoStack.length === 0;
}

function clampSelection() {
  var n = photoSlots(state.layout);
  if (state.selectedPanel >= n) state.selectedPanel = n - 1;
  if (state.selectedPanel < 0) state.selectedPanel = 0;
}

function previewDims() {
  var s = SIZES[state.size];
  var long = 900;
  if (s.w >= s.h) return { w: long, h: Math.round(long * s.h / s.w) };
  return { w: Math.round(long * s.w / s.h), h: long };
}

function render() {
  if (isShot) {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    renderCover(ctx, canvas.width, canvas.height, state);
    return;
  }
  var d = previewDims();
  canvas.width = d.w;
  canvas.height = d.h;
  renderCover(ctx, d.w, d.h, state);
  syncPanelUI();
}

function buildChoices(elId, defs, current, onPick) {
  var el = document.getElementById(elId);
  el.innerHTML = '';
  Object.keys(defs).forEach(function (key) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = defs[key].label;
    b.title = defs[key].hint || defs[key].label;
    if (key === current) b.classList.add('on');
    b.addEventListener('click', function () { onPick(key); });
    el.appendChild(b);
  });
}

function syncControls() {
  buildChoices('layoutChoices', LAYOUTS, state.layout, function (k) { commit(); state.layout = k; clampSelection(); render(); syncControls(); });
  buildChoices('gradeChoices', GRADES, state.grade, function (k) { commit(); state.grade = k; render(); syncControls(); });
  buildChoices('sizeChoices', SIZES, state.size, function (k) { commit(); state.size = k; render(); syncControls(); });
  document.getElementById('titleInput').value = state.title;
  document.getElementById('subtitleInput').value = state.subtitle;
  document.getElementById('badgeInput').value = state.badge;
  document.getElementById('heatInput').value = state.heat;
  document.getElementById('heatLabel').textContent = state.heat + (state.heat === 1 ? ' star' : ' stars');
  refreshPhotoUI();
  syncPanelUI();
}

function refreshPhotoUI() {
  var list = document.getElementById('photoList');
  list.innerHTML = '';
  photos.forEach(function (p) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'thumb';
    b.title = p.name;
    var img = document.createElement('img');
    img.src = p.img.src;
    img.alt = p.name;
    var span = document.createElement('span');
    span.textContent = p.name;
    b.appendChild(img);
    b.appendChild(span);
    var sel = state.panels[state.selectedPanel];
    if (sel && sel.photo === p.id) b.classList.add('on');
    b.addEventListener('click', function () {
      commit();
      state.panels[state.selectedPanel].photo = p.id;
      render();
      refreshPhotoUI();
    });
    list.appendChild(b);
  });
  var sel2 = document.getElementById('panelPhoto');
  sel2.innerHTML = '';
  photos.forEach(function (p) {
    var o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.name;
    sel2.appendChild(o);
  });
  var cur = state.panels[state.selectedPanel];
  if (cur) sel2.value = cur.photo;
}

function syncPanelUI() {
  var n = photoSlots(state.layout);
  var panel = state.panels[state.selectedPanel] || { photo: '', zoom: 1, ox: 0, oy: 0 };
  document.getElementById('panelNote').textContent = 'Panel ' + (state.selectedPanel + 1) + ' of ' + n + ' — ' + LAYOUTS[state.layout].label;
  document.getElementById('zoomInput').value = panel.zoom;
  document.getElementById('panXInput').value = panel.ox;
  document.getElementById('panYInput').value = panel.oy;
  var sel = document.getElementById('panelPhoto');
  if (sel) sel.value = panel.photo;
  var thumbs = document.querySelectorAll('#photoList .thumb');
  thumbs.forEach(function (t, i) {
    t.classList.toggle('on', photos[i] && photos[i].id === panel.photo);
  });
}

function exportPNG(sizeName) {
  var s = SIZES[sizeName || state.size];
  var off = document.createElement('canvas');
  off.width = s.w;
  off.height = s.h;
  var octx = off.getContext('2d');
  renderCover(octx, s.w, s.h, state);
  return new Promise(function (resolve, reject) {
    off.toBlob(function (blob) {
      if (!blob) { reject(new Error('export produced no PNG')); return; }
      resolve({ blob: blob, width: s.w, height: s.h });
    }, 'image/png');
  });
}

function downloadExport(sizeName) {
  var note = document.getElementById('exportNote');
  note.textContent = 'Rendering ' + SIZES[sizeName].w + ' × ' + SIZES[sizeName].h + '…';
  exportPNG(sizeName).then(function (r) {
    var url = URL.createObjectURL(r.blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'neon-palms-cover-' + sizeName + '.png';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    note.textContent = 'Exported ' + r.width + ' × ' + r.height + ' PNG (' + Math.round(r.blob.size / 1024) + ' KB).';
  }).catch(function (e) {
    note.textContent = 'Export failed: ' + e.message;
  });
}

function canvasPoint(ev) {
  var rect = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - rect.left) * canvas.width / rect.width,
    y: (ev.clientY - rect.top) * canvas.height / rect.height
  };
}

function panelAt(x, y) {
  var f = Math.max(6, Math.round(canvas.width * 0.018));
  var ix = f, iy = f, iw = canvas.width - 2 * f, ih = canvas.height - 2 * f;
  if (x < ix || y < iy || x > ix + iw || y > iy + ih) return -1;
  var slots = layoutSlots(state.layout, iw, ih);
  for (var i = slots.length - 1; i >= 0; i--) {
    var s = slots[i];
    if (s.kind !== 'photo') continue;
    var rot = s.rot || 0;
    var cx = ix + s.x + s.w / 2, cy = iy + s.y + s.h / 2;
    var dx = x - cx, dy = y - cy;
    var rx = dx * Math.cos(-rot) - dy * Math.sin(-rot);
    var ry = dx * Math.sin(-rot) + dy * Math.cos(-rot);
    if (Math.abs(rx) <= s.w / 2 && Math.abs(ry) <= s.h / 2) return s.index;
  }
  return -1;
}

var drag = null;

function bindEditor() {
  document.getElementById('undoBtn').addEventListener('click', doUndo);
  document.getElementById('redoBtn').addEventListener('click', doRedo);
  document.getElementById('sampleBtn').addEventListener('click', function () {
    commit();
    state = defaultState();
    loadSamples();
    syncControls();
    render();
  });
  document.getElementById('exportBtn').addEventListener('click', function () { downloadExport(state.size); });
  document.getElementById('exportAllBtn').addEventListener('click', function () {
    var keys = Object.keys(SIZES);
    var i = 0;
    (function next() {
      if (i >= keys.length) return;
      downloadExport(keys[i++]);
      setTimeout(next, 600);
    })();
  });
  document.getElementById('titleInput').addEventListener('input', function (e) { state.title = e.target.value; render(); });
  document.getElementById('titleInput').addEventListener('change', commit);
  document.getElementById('subtitleInput').addEventListener('input', function (e) { state.subtitle = e.target.value; render(); });
  document.getElementById('subtitleInput').addEventListener('change', commit);
  document.getElementById('badgeInput').addEventListener('input', function (e) { state.badge = e.target.value; render(); });
  document.getElementById('badgeInput').addEventListener('change', commit);
  document.getElementById('heatInput').addEventListener('input', function (e) {
    state.heat = parseInt(e.target.value, 10);
    document.getElementById('heatLabel').textContent = state.heat + (state.heat === 1 ? ' star' : ' stars');
    render();
  });
  document.getElementById('heatInput').addEventListener('change', commit);
  document.getElementById('fileInput').addEventListener('change', function (e) {
    if (e.target.files.length) addUploadedPhotos(e.target.files);
    e.target.value = '';
  });
  document.getElementById('panelPhoto').addEventListener('change', function (e) {
    commit();
    state.panels[state.selectedPanel].photo = e.target.value;
    render();
  });
  function panelSlider(id, key) {
    var el = document.getElementById(id);
    el.addEventListener('input', function () {
      state.panels[state.selectedPanel][key] = parseFloat(el.value);
      render();
    });
    el.addEventListener('change', commit);
  }
  panelSlider('zoomInput', 'zoom');
  panelSlider('panXInput', 'ox');
  panelSlider('panYInput', 'oy');
  document.getElementById('fitBtn').addEventListener('click', function () {
    commit();
    var p = state.panels[state.selectedPanel];
    p.zoom = 1; p.ox = 0; p.oy = 0;
    render();
    syncPanelUI();
  });

  canvas.addEventListener('pointerdown', function (e) {
    var pt = canvasPoint(e);
    var idx = panelAt(pt.x, pt.y);
    if (idx < 0) return;
    state.selectedPanel = idx;
    syncPanelUI();
    canvas.setPointerCapture(e.pointerId);
    drag = { x: pt.x, y: pt.y, ox: state.panels[idx].ox, oy: state.panels[idx].oy };
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var pt = canvasPoint(e);
    var p = state.panels[state.selectedPanel];
    var slots = layoutSlots(state.layout, canvas.width, canvas.height);
    var slot = null;
    slots.forEach(function (s) { if (s.kind === 'photo' && s.index === state.selectedPanel) slot = s; });
    if (!slot) return;
    p.ox = Math.max(-0.5, Math.min(0.5, drag.ox + (pt.x - drag.x) / slot.w));
    p.oy = Math.max(-0.5, Math.min(0.5, drag.oy + (pt.y - drag.y) / slot.h));
    render();
  });
  canvas.addEventListener('pointerup', function () {
    if (drag) { commit(); drag = null; }
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var p = state.panels[state.selectedPanel];
    p.zoom = Math.max(1, Math.min(3, p.zoom * (e.deltaY < 0 ? 1.08 : 0.93)));
    render();
    syncPanelUI();
  }, { passive: false });
  canvas.addEventListener('dblclick', function (e) {
    var pt = canvasPoint(e);
    var idx = panelAt(pt.x, pt.y);
    if (idx < 0 || photos.length < 2) return;
    commit();
    var p = state.panels[idx];
    var cur = photos.findIndex(function (ph) { return ph.id === p.photo; });
    p.photo = photos[(cur + 1) % photos.length].id;
    render();
  });
  window.addEventListener('resize', function () { if (isShot) render(); });
}

function readParams() {
  var q = new URLSearchParams(window.location.search);
  if (q.get('layout') && LAYOUTS[q.get('layout')]) state.layout = q.get('layout');
  if (q.get('grade') && GRADES[q.get('grade')]) state.grade = q.get('grade');
  if (q.get('size') && SIZES[q.get('size')]) state.size = q.get('size');
  if (q.get('title') !== null) state.title = q.get('title');
  if (q.get('subtitle') !== null) state.subtitle = q.get('subtitle');
  if (q.get('badge') !== null) state.badge = q.get('badge');
  return q;
}

function init() {
  var q = readParams();
  isShot = q.get('shot') === 'cover';
  if (isShot) document.body.classList.add('shot');
  bindEditor();
  syncControls();
  syncUndoButtons();
  var fontsReady = Promise.all([
    document.fonts.load('100px Anton'),
    document.fonts.load('40px Pacifico'),
    document.fonts.ready
  ]).catch(function () { return null; });
  Promise.all([fontsReady, loadSamples()]).then(function () {
    render();
    if (isShot) window.__shotReady = true;
  });
  render();
}

// Test hook for the maker's own browser checks: export a real PNG in-page.
window.__coverStudio = {
  getState: function () { return JSON.parse(JSON.stringify(serializable())); },
  exportPNG: function (sizeName) {
    return exportPNG(sizeName).then(function (r) {
      return r.blob.arrayBuffer().then(function (buf) {
        return { type: r.blob.type, byteLength: buf.byteLength, width: r.width, height: r.height };
      });
    });
  },
  render: render,
  loadSamples: loadSamples
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
