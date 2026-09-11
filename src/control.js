const $ = (id) => document.getElementById(id);

const els = {
  modeButtons: document.querySelectorAll('[data-mode]'),
  ratioPresets: $('ratioPresets'),
  ratioButtons: document.querySelectorAll('[data-ratio]'),
  regionEditRow: $('regionEditRow'),
  editRegionBtn: $('editRegionBtn'),
  regionStatus: $('regionStatus'),
  regionConfirmRow: $('regionConfirmRow'),
  regionConfirmBtn: $('regionConfirmBtn'),
  regionCancelBtn: $('regionCancelBtn'),
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
};

const state = {
  mode: 'fullscreen', // 'fullscreen' | 'region'
  presetRatio: 'free', // 'free' | '16:9' | '9:16' | '1:1'
  cropRect: null, // {x,y,w,h} en píxeles físicos de pantalla, o null = full frame
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
  timerInterval: null,
  elapsedMs: 0,
  timerStartedAt: 0,
};

const ctx = els.outputCanvas.getContext('2d');

function stopStream(stream) {
  if (stream) stream.getTracks().forEach((t) => t.stop());
}

// ---------- Preferencias persistentes ----------

const SETTINGS_KEY = 'powerzoid-settings-v1';

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
      mode: state.mode,
      presetRatio: state.presetRatio,
      webcamEnabled: state.webcamEnabled,
      webcamDeviceId: els.webcamDevice.value || null,
      pipPosition: state.pipPosition,
      pipSizeRatio: state.pipSizeRatio,
      pipShape: state.pipShape,
      micEnabled: state.micEnabled,
      micDeviceId: els.micDevice.value || null,
    }));
  } catch {
    // localStorage puede fallar (privado/deshabilitado); no es crítico.
  }
}

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

const saved = loadSettings();

// ---------- Selección de modo / preset de proporción ----------

function setActiveChip(buttons, matchFn) {
  buttons.forEach((b) => b.classList.toggle('active', matchFn(b)));
}

function updateRegionStatus() {
  if (state.mode === 'region' && state.cropRect) {
    els.regionStatus.textContent = `${state.cropRect.w}×${state.cropRect.h}`;
  } else {
    els.regionStatus.textContent = '';
  }
}

async function defineRegion() {
  els.regionConfirmRow.hidden = false;
  els.editRegionBtn.disabled = true;
  const result = await window.powerzoid.selectRegion(state.presetRatio);
  els.regionConfirmRow.hidden = true;
  els.editRegionBtn.disabled = state.recording;

  if (result) {
    state.cropRect = result;
    els.statusText.textContent = '';
  } else if (!state.cropRect) {
    els.statusText.textContent = 'Selección de región cancelada.';
  }
  updateRegionStatus();
}

els.regionConfirmBtn.addEventListener('click', () => window.powerzoid.requestRegionConfirm());
els.regionCancelBtn.addEventListener('click', () => window.powerzoid.requestRegionCancel());

els.modeButtons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    setActiveChip(els.modeButtons, (b) => b === btn);
    state.mode = btn.dataset.mode;
    els.ratioPresets.hidden = state.mode !== 'region';
    els.regionEditRow.hidden = state.mode !== 'region';
    saveSettings();
    if (state.mode === 'region') {
      await defineRegion();
    } else {
      state.cropRect = null;
    }
  });
});

els.ratioButtons.forEach((btn) => {
  btn.addEventListener('click', async () => {
    setActiveChip(els.ratioButtons, (b) => b === btn);
    state.presetRatio = btn.dataset.ratio;
    saveSettings();
    if (state.mode === 'region') {
      await defineRegion();
    }
  });
});

els.editRegionBtn.addEventListener('click', defineRegion);

// ---------- Webcam / mic UI ----------

async function startWebcamPreview() {
  stopStream(state.webcamStream);
  state.webcamStream = null;
  try {
    state.webcamStream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: els.webcamDevice.value ? { exact: els.webcamDevice.value } : undefined },
      audio: false,
    });
    els.webcamPreview.srcObject = state.webcamStream;
    await els.webcamPreview.play().catch(() => {});
    populateDevices();
  } catch (err) {
    els.statusText.textContent = 'No se pudo abrir la webcam.';
    state.webcamEnabled = false;
    els.webcamEnabled.checked = false;
  }
}

function stopWebcamPreview() {
  stopStream(state.webcamStream);
  state.webcamStream = null;
  els.webcamPreview.srcObject = null;
}

els.webcamEnabled.addEventListener('change', () => {
  state.webcamEnabled = els.webcamEnabled.checked;
  saveSettings();
  if (state.webcamEnabled) {
    startWebcamPreview();
  } else {
    stopWebcamPreview();
  }
});

els.webcamDevice.addEventListener('change', () => {
  saveSettings();
  if (state.webcamEnabled) startWebcamPreview();
});

els.posButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    setActiveChip(els.posButtons, (b) => b === btn);
    state.pipPosition = btn.dataset.pos;
    saveSettings();
  });
});

els.pipSize.addEventListener('input', () => {
  state.pipSizeRatio = Number(els.pipSize.value) / 100;
  saveSettings();
});

els.shapeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    setActiveChip(els.shapeButtons, (b) => b === btn);
    state.pipShape = btn.dataset.shape;
    saveSettings();
  });
});

els.switchMainBtn.addEventListener('click', () => {
  state.mainSource = state.mainSource === 'screen' ? 'webcam' : 'screen';
});

els.micEnabled.addEventListener('change', () => {
  state.micEnabled = els.micEnabled.checked;
  saveSettings();
});

els.micDevice.addEventListener('change', saveSettings);

async function populateDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();

  const fill = (select, kind, emptyLabel, preferredId) => {
    const previous = select.value || preferredId;
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

  fill(els.webcamDevice, 'videoinput', 'Sin cámaras detectadas', saved.webcamDeviceId);
  fill(els.micDevice, 'audioinput', 'Sin micrófonos detectados', saved.micDeviceId);
}

navigator.mediaDevices.addEventListener('devicechange', populateDevices);

// ---------- Aplicar preferencias guardadas ----------

function applySavedSettings() {
  if (saved.mode) {
    const btn = [...els.modeButtons].find((b) => b.dataset.mode === saved.mode);
    if (btn) {
      setActiveChip(els.modeButtons, (b) => b === btn);
      state.mode = saved.mode;
      els.ratioPresets.hidden = state.mode !== 'region';
      els.regionEditRow.hidden = state.mode !== 'region';
    }
  }
  if (saved.presetRatio) {
    const btn = [...els.ratioButtons].find((b) => b.dataset.ratio === saved.presetRatio);
    if (btn) {
      setActiveChip(els.ratioButtons, (b) => b === btn);
      state.presetRatio = saved.presetRatio;
    }
  }
  if (saved.pipPosition) {
    const btn = [...els.posButtons].find((b) => b.dataset.pos === saved.pipPosition);
    if (btn) {
      setActiveChip(els.posButtons, (b) => b === btn);
      state.pipPosition = saved.pipPosition;
    }
  }
  if (saved.pipShape) {
    const btn = [...els.shapeButtons].find((b) => b.dataset.shape === saved.pipShape);
    if (btn) {
      setActiveChip(els.shapeButtons, (b) => b === btn);
      state.pipShape = saved.pipShape;
    }
  }
  if (typeof saved.pipSizeRatio === 'number') {
    state.pipSizeRatio = saved.pipSizeRatio;
    els.pipSize.value = String(Math.round(saved.pipSizeRatio * 100));
  }
  if (typeof saved.micEnabled === 'boolean') {
    state.micEnabled = saved.micEnabled;
    els.micEnabled.checked = saved.micEnabled;
  }
  if (typeof saved.webcamEnabled === 'boolean') {
    state.webcamEnabled = saved.webcamEnabled;
    els.webcamEnabled.checked = saved.webcamEnabled;
  }
}

applySavedSettings();
populateDevices().then(() => {
  // La webcam recién puede previsualizarse una vez el selector tiene sus
  // opciones cargadas. La región personalizada, en cambio, no se reabre sola
  // al iniciar la app (sería una ventana a pantalla completa sorpresiva) —
  // queda pendiente de "Editar región" o se pide al darle a Grabar.
  if (state.webcamEnabled) startWebcamPreview();
  updateRegionStatus();
});

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
  [...els.modeButtons, ...els.ratioButtons, els.webcamDevice, els.micDevice, els.editRegionBtn].forEach((el) => {
    el.disabled = recordingActive;
  });
}

// El loop de dibujo corre siempre (no solo mientras se graba), para que la
// vista previa de la webcam se vea de inmediato al activarla. Usamos
// setInterval en vez de requestAnimationFrame: rAF depende de que el
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

renderLoop();
setInterval(renderLoop, 1000 / 30);

els.startBtn.addEventListener('click', async () => {
  els.statusText.textContent = '';
  try {
    state.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (err) {
    els.statusText.textContent = 'No se compartió la pantalla.';
    return;
  }

  els.screenPreview.srcObject = state.screenStream;
  await els.screenPreview.play().catch(() => {});

  if (state.mode === 'region' && !state.cropRect) {
    await defineRegion();
    if (!state.cropRect) {
      stopStream(state.screenStream);
      state.screenStream = null;
      return;
    }
  }

  if (state.webcamEnabled && !state.webcamStream) {
    await startWebcamPreview();
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

  const outW = state.mode === 'region' && state.cropRect ? state.cropRect.w : els.screenPreview.videoWidth;
  const outH = state.mode === 'region' && state.cropRect ? state.cropRect.h : els.screenPreview.videoHeight;
  els.outputCanvas.width = outW || 1280;
  els.outputCanvas.height = outH || 720;

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

  stopTimer();

  const fullPath = await state.recorder.stop();

  // La webcam sigue activa después de grabar: es una vista previa en vivo,
  // no algo atado únicamente a la grabación.
  stopStream(state.screenStream);
  stopStream(state.micStream);
  state.screenStream = null;
  state.micStream = null;
  els.screenPreview.srcObject = null;
  state.recording = false;
  state.paused = false;

  setControlsEnabled(false);
  els.statusText.textContent = `Guardado en ${fullPath}`;
  window.powerzoid.showInFolder(fullPath);
});
