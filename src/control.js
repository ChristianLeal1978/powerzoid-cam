const $ = (id) => document.getElementById(id);

const els = {
  modeButtons: document.querySelectorAll('[data-mode]'),
  ratioPresets: $('ratioPresets'),
  ratioButtons: document.querySelectorAll('[data-ratio]'),
  webcamEnabled: $('webcamEnabled'),
  webcamDevice: $('webcamDevice'),
  posButtons: document.querySelectorAll('[data-pos]'),
  pipSize: $('pipSize'),
  shapeButtons: document.querySelectorAll('[data-shape]'),
  switchMainBtn: $('switchMainBtn'),
  micEnabled: $('micEnabled'),
  micDevice: $('micDevice'),
  outputCanvas: $('outputCanvas'),
  timer: $('timer'),
  startBtn: $('startBtn'),
  pauseBtn: $('pauseBtn'),
  stopBtn: $('stopBtn'),
  statusText: $('statusText'),
  screenPreview: $('screenPreview'),
  webcamPreview: $('webcamPreview'),
  regionModal: $('regionModal'),
  regionVideo: $('regionVideo'),
  regionStage: $('regionStage'),
  regionRect: $('regionRect'),
  regionConfirm: $('regionConfirm'),
  regionCancel: $('regionCancel'),
};

const state = {
  mode: 'fullscreen', // 'fullscreen' | 'region'
  presetRatio: 'free', // 'free' | '16:9' | '9:16' | '1:1'
  cropRect: null, // {x,y,w,h} en píxeles del stream de pantalla, o null = full frame
  mainSource: 'screen', // 'screen' | 'webcam'
  screenEnabled: true,
  webcamEnabled: false,
  pipPosition: 'br',
  pipSizeRatio: 0.28,
  pipShape: 'rect',
  micEnabled: true,

  screenStream: null,
  webcamStream: null,
  micStream: null,
  recording: false,
  paused: false,
  recorder: null,
  renderInterval: null,
  timerInterval: null,
  elapsedMs: 0,
  timerStartedAt: 0,
};

const ctx = els.outputCanvas.getContext('2d');

// ---------- Selección de modo / preset de proporción ----------

els.modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    els.modeButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.mode;
    els.ratioPresets.hidden = state.mode !== 'region';
  });
});

els.ratioButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    els.ratioButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.presetRatio = btn.dataset.ratio;
  });
});

function ratioValue() {
  switch (state.presetRatio) {
    case '16:9': return 16 / 9;
    case '9:16': return 9 / 16;
    case '1:1': return 1;
    default: return null;
  }
}

// ---------- Webcam / mic UI ----------

els.webcamEnabled.addEventListener('change', () => {
  state.webcamEnabled = els.webcamEnabled.checked;
});

els.posButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    els.posButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.pipPosition = btn.dataset.pos;
  });
});

els.pipSize.addEventListener('input', () => {
  state.pipSizeRatio = Number(els.pipSize.value) / 100;
});

els.shapeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    els.shapeButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.pipShape = btn.dataset.shape;
  });
});

els.switchMainBtn.addEventListener('click', () => {
  state.mainSource = state.mainSource === 'screen' ? 'webcam' : 'screen';
});

els.micEnabled.addEventListener('change', () => {
  state.micEnabled = els.micEnabled.checked;
});

async function populateDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();

  const fill = (select, kind, emptyLabel) => {
    const previous = select.value;
    select.innerHTML = '';
    const filtered = devices.filter((d) => d.kind === kind);
    if (filtered.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = emptyLabel;
      select.appendChild(opt);
      return;
    }
    filtered.forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `${kind} ${i + 1}`;
      select.appendChild(opt);
    });
    if (filtered.some((d) => d.deviceId === previous)) select.value = previous;
  };

  fill(els.webcamDevice, 'videoinput', 'Sin cámaras detectadas');
  fill(els.micDevice, 'audioinput', 'Sin micrófonos detectados');
}

navigator.mediaDevices.addEventListener('devicechange', populateDevices);
populateDevices();

// ---------- Selección de región personalizada ----------

let dragState = null;

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function initRegionRect() {
  const stageW = els.regionVideo.clientWidth;
  const stageH = els.regionVideo.clientHeight;
  const ratio = ratioValue();

  let w = stageW * 0.7;
  let h = ratio ? w / ratio : stageH * 0.7;
  if (h > stageH * 0.9) {
    h = stageH * 0.9;
    w = ratio ? h * ratio : w;
  }

  const rect = { x: (stageW - w) / 2, y: (stageH - h) / 2, w, h };
  applyRegionRect(rect);
}

function applyRegionRect(rect) {
  els.regionRect.style.left = `${rect.x}px`;
  els.regionRect.style.top = `${rect.y}px`;
  els.regionRect.style.width = `${rect.w}px`;
  els.regionRect.style.height = `${rect.h}px`;
}

function currentRegionRect() {
  return {
    x: parseFloat(els.regionRect.style.left),
    y: parseFloat(els.regionRect.style.top),
    w: parseFloat(els.regionRect.style.width),
    h: parseFloat(els.regionRect.style.height),
  };
}

els.regionRect.addEventListener('pointerdown', (e) => {
  const isHandle = e.target.classList.contains('handle');
  const rect = currentRegionRect();
  dragState = {
    mode: isHandle ? e.target.className.match(/\b(nw|ne|sw|se)\b/)[0] : 'move',
    startX: e.clientX,
    startY: e.clientY,
    rect,
  };
  e.preventDefault();
  e.stopPropagation();
});

window.addEventListener('pointermove', (e) => {
  if (!dragState || els.regionModal.hidden) return;

  const stageW = els.regionVideo.clientWidth;
  const stageH = els.regionVideo.clientHeight;
  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;
  const ratio = ratioValue();
  let { x, y, w, h } = dragState.rect;

  if (dragState.mode === 'move') {
    x = clamp(dragState.rect.x + dx, 0, stageW - w);
    y = clamp(dragState.rect.y + dy, 0, stageH - h);
  } else {
    const anchorRight = dragState.mode.includes('w') ? dragState.rect.x + dragState.rect.w : dragState.rect.x;
    const anchorBottom = dragState.mode.includes('n') ? dragState.rect.y + dragState.rect.h : dragState.rect.y;
    const dir = { n: dragState.mode.includes('n') ? -1 : 1, w: dragState.mode.includes('w') ? -1 : 1 };

    w = clamp(dragState.rect.w + dx * dir.w, 40, stageW);
    if (ratio) {
      h = w / ratio;
    } else {
      h = clamp(dragState.rect.h + dy * dir.n, 40, stageH);
    }

    x = dragState.mode.includes('w') ? anchorRight - w : dragState.rect.x;
    y = dragState.mode.includes('n') ? anchorBottom - h : dragState.rect.y;

    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > stageW) w = stageW - x;
    if (y + h > stageH) h = stageH - y;
  }

  applyRegionRect({ x, y, w, h });
});

window.addEventListener('pointerup', () => {
  dragState = null;
});

function stopStream(stream) {
  if (stream) stream.getTracks().forEach((t) => t.stop());
}

function openRegionModal() {
  return new Promise((resolve, reject) => {
    els.regionModal.hidden = false;

    const onReady = () => {
      els.regionVideo.removeEventListener('loadedmetadata', onReady);
      initRegionRect();
    };
    els.regionVideo.addEventListener('loadedmetadata', onReady);

    const cleanup = () => {
      els.regionModal.hidden = true;
      els.regionConfirm.removeEventListener('click', onConfirm);
      els.regionCancel.removeEventListener('click', onCancel);
    };

    const onConfirm = () => {
      const cssRect = currentRegionRect();
      const scale = els.regionVideo.videoWidth / els.regionVideo.clientWidth;
      cleanup();
      resolve({
        x: Math.round(cssRect.x * scale),
        y: Math.round(cssRect.y * scale),
        w: Math.round(cssRect.w * scale),
        h: Math.round(cssRect.h * scale),
      });
    };

    const onCancel = () => {
      cleanup();
      reject(new Error('cancelled'));
    };

    els.regionConfirm.addEventListener('click', onConfirm);
    els.regionCancel.addEventListener('click', onCancel);
  });
}

// ---------- Cronómetro ----------

function formatTime(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const s = String(totalSec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function startTimer() {
  state.timerStartedAt = Date.now();
  state.timerInterval = setInterval(() => {
    const now = state.paused ? state.timerStartedAt : Date.now();
    els.timer.textContent = formatTime(state.elapsedMs + (now - state.timerStartedAt));
  }, 250);
}

function stopTimer() {
  clearInterval(state.timerInterval);
  state.timerInterval = null;
  state.elapsedMs = 0;
  els.timer.textContent = '00:00';
}

// ---------- Controles de grabación ----------

function setControlsEnabled(recordingActive) {
  els.startBtn.disabled = recordingActive;
  els.pauseBtn.disabled = !recordingActive;
  els.stopBtn.disabled = !recordingActive;
  [...els.modeButtons, ...els.ratioButtons, els.webcamDevice, els.micDevice].forEach((el) => {
    el.disabled = recordingActive;
  });
}

// Usamos setInterval en vez de requestAnimationFrame: rAF depende de que el
// compositor esté presentando la ventana en pantalla, así que se detiene en
// cuanto la ventana de control pierde el foco o queda tapada por la app que
// se está grabando (el caso de uso normal de un tutorial). setInterval sigue
// disparando en segundo plano gracias a backgroundThrottling:false en main.js.
function renderLoop() {
  drawFrame(ctx, els.outputCanvas, {
    screenVideo: els.screenPreview,
    webcamVideo: els.webcamPreview,
    cropRect: state.cropRect,
    mainSource: state.mainSource,
    screenEnabled: state.screenEnabled,
    webcamEnabled: state.webcamEnabled,
    pipPosition: state.pipPosition,
    pipSizeRatio: state.pipSizeRatio,
    pipShape: state.pipShape,
  });
}

els.startBtn.addEventListener('click', async () => {
  els.statusText.textContent = '';
  try {
    state.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (err) {
    els.statusText.textContent = 'No se compartió la pantalla.';
    return;
  }

  els.screenPreview.srcObject = state.screenStream;
  els.regionVideo.srcObject = state.screenStream;
  await els.screenPreview.play().catch(() => {});

  state.cropRect = null;
  if (state.mode === 'region') {
    try {
      state.cropRect = await openRegionModal();
    } catch {
      stopStream(state.screenStream);
      state.screenStream = null;
      els.statusText.textContent = 'Selección de región cancelada.';
      return;
    }
  }

  if (state.webcamEnabled) {
    try {
      state.webcamStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: els.webcamDevice.value ? { exact: els.webcamDevice.value } : undefined },
        audio: false,
      });
      els.webcamPreview.srcObject = state.webcamStream;
      await els.webcamPreview.play().catch(() => {});
    } catch (err) {
      els.statusText.textContent = 'No se pudo abrir la webcam, continuando sin ella.';
      state.webcamEnabled = false;
      els.webcamEnabled.checked = false;
    }
  }

  if (state.micEnabled) {
    try {
      state.micStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: els.micDevice.value ? { exact: els.micDevice.value } : undefined },
      });
    } catch (err) {
      els.statusText.textContent = 'No se pudo abrir el micrófono, continuando sin audio.';
    }
  }

  populateDevices();

  const outW = state.cropRect ? state.cropRect.w : els.screenPreview.videoWidth;
  const outH = state.cropRect ? state.cropRect.h : els.screenPreview.videoHeight;
  els.outputCanvas.width = outW || 1280;
  els.outputCanvas.height = outH || 720;

  renderLoop();
  state.renderInterval = setInterval(renderLoop, 1000 / 30);

  const outputStream = els.outputCanvas.captureStream(30);
  if (state.micStream) {
    state.micStream.getAudioTracks().forEach((t) => outputStream.addTrack(t));
  }

  state.recorder = new RecorderEngine(outputStream);
  state.recorder.start();

  state.recording = true;
  state.paused = false;
  state.elapsedMs = 0;
  startTimer();
  setControlsEnabled(true);
  els.pauseBtn.textContent = 'Pausar';
});

els.pauseBtn.addEventListener('click', () => {
  if (!state.recording) return;
  if (!state.paused) {
    state.recorder.pause();
    state.elapsedMs += Date.now() - state.timerStartedAt;
    state.paused = true;
    els.pauseBtn.textContent = 'Reanudar';
  } else {
    state.recorder.resume();
    state.timerStartedAt = Date.now();
    state.paused = false;
    els.pauseBtn.textContent = 'Pausar';
  }
});

els.stopBtn.addEventListener('click', async () => {
  if (!state.recording) return;
  els.stopBtn.disabled = true;
  els.pauseBtn.disabled = true;
  els.statusText.textContent = 'Guardando...';

  clearInterval(state.renderInterval);
  stopTimer();

  const fullPath = await state.recorder.stop();

  stopStream(state.screenStream);
  stopStream(state.webcamStream);
  stopStream(state.micStream);
  state.screenStream = null;
  state.webcamStream = null;
  state.micStream = null;
  state.recording = false;
  state.paused = false;

  setControlsEnabled(false);
  els.statusText.textContent = `Guardado en ${fullPath}`;
  window.powerzoid.showInFolder(fullPath);
});
