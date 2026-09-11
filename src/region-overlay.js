const rectEl = document.getElementById('rect');

let stageW = window.innerWidth;
let stageH = window.innerHeight;
let scaleFactor = 1;
let ratio = 'free';
let hasRect = false;
let rect = { x: 0, y: 0, w: 0, h: 0 };
let drag = null;

const MIN_SIZE = 40;
const HOVER_MARGIN = 12;

// La ventana overlay es transparente pero por defecto sigue capturando TODOS
// los clics de la pantalla, incluidos los que caen sobre la ventana principal
// de Powerzoid Cam que se ve a través suyo (por ejemplo, el botón "Confirmar
// región"). Para que esos clics lleguen a la app, dejamos pasar el mouse
// (click-through) en todo el overlay excepto justo sobre el rectángulo/las
// esquinas, que es lo único que necesita capturar clics acá.
let overlayInteractive = true;

function setInteractive(interactive) {
  if (interactive === overlayInteractive) return;
  overlayInteractive = interactive;
  window.powerzoid.setOverlayInteractive(interactive);
}

function isNearRect(x, y) {
  if (!hasRect) return false;
  return (
    x >= rect.x - HOVER_MARGIN &&
    x <= rect.x + rect.w + HOVER_MARGIN &&
    y >= rect.y - HOVER_MARGIN &&
    y <= rect.y + rect.h + HOVER_MARGIN
  );
}

// En modo "libre" sin rectángulo todavía, todo el overlay debe seguir siendo
// interactivo (hay que poder empezar a dibujar en cualquier punto).
function refreshInteractive(x, y) {
  if (drag) return;
  setInteractive(!hasRect || isNearRect(x, y));
}

function ratioValue() {
  switch (ratio) {
    case '16:9': return 16 / 9;
    case '9:16': return 9 / 16;
    case '1:1': return 1;
    default: return null;
  }
}

function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

function render() {
  rectEl.classList.toggle('active', hasRect);
  if (!hasRect) return;
  rectEl.style.left = `${rect.x}px`;
  rectEl.style.top = `${rect.y}px`;
  rectEl.style.width = `${rect.w}px`;
  rectEl.style.height = `${rect.h}px`;
}

function showInitialRect() {
  const lockedRatio = ratioValue();
  let w = stageW * 0.6;
  let h = lockedRatio ? w / lockedRatio : stageH * 0.6;
  if (h > stageH * 0.9) {
    h = stageH * 0.9;
    w = lockedRatio ? h * lockedRatio : w;
  }
  rect = { x: (stageW - w) / 2, y: (stageH - h) / 2, w, h };
  hasRect = true;
  render();
}

window.powerzoid.onRegionInit((data) => {
  ratio = data.ratio;
  stageW = data.width;
  stageH = data.height;
  scaleFactor = data.scaleFactor || 1;

  document.body.classList.toggle('mode-free', ratio === 'free');
  document.body.classList.toggle('mode-locked', ratio !== 'free');

  if (ratio === 'free') {
    hasRect = false;
    render();
  } else {
    showInitialRect();
  }
  refreshInteractive(-1, -1);
});

function startMove(e) {
  setInteractive(true);
  drag = { mode: 'move', startX: e.clientX, startY: e.clientY, rect: { ...rect } };
}

function startResize(handle, e) {
  setInteractive(true);
  drag = { mode: handle, startX: e.clientX, startY: e.clientY, rect: { ...rect } };
}

function startDraw(e) {
  setInteractive(true);
  hasRect = true;
  rect = { x: e.clientX, y: e.clientY, w: 1, h: 1 };
  drag = { mode: 'draw', originX: e.clientX, originY: e.clientY };
  render();
}

rectEl.addEventListener('pointerdown', (e) => {
  const handle = e.target.classList.contains('handle')
    ? e.target.className.match(/\b(nw|ne|sw|se)\b/)[0]
    : null;
  if (handle) {
    startResize(handle, e);
  } else {
    startMove(e);
  }
  e.preventDefault();
  e.stopPropagation();
});

document.body.addEventListener('pointerdown', (e) => {
  if (ratio === 'free') startDraw(e);
});

window.addEventListener('pointermove', (e) => {
  if (!drag) {
    refreshInteractive(e.clientX, e.clientY);
    return;
  }
  const lockedRatio = ratioValue();

  if (drag.mode === 'move') {
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    rect.x = clamp(drag.rect.x + dx, 0, stageW - rect.w);
    rect.y = clamp(drag.rect.y + dy, 0, stageH - rect.h);
  } else if (drag.mode === 'draw') {
    const x0 = drag.originX;
    const y0 = drag.originY;
    let x1 = e.clientX;
    let y1 = e.clientY;

    if (lockedRatio) {
      const dx = x1 - x0;
      const dy = y1 - y0;
      const w = Math.max(Math.abs(dx), Math.abs(dy) * lockedRatio);
      x1 = x0 + Math.sign(dx || 1) * w;
      y1 = y0 + Math.sign(dy || 1) * (w / lockedRatio);
    }

    rect.x = clamp(Math.min(x0, x1), 0, stageW);
    rect.y = clamp(Math.min(y0, y1), 0, stageH);
    rect.w = clamp(Math.abs(x1 - x0), 1, stageW - rect.x);
    rect.h = clamp(Math.abs(y1 - y0), 1, stageH - rect.y);
  } else {
    // resize desde una esquina
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const anchorRight = drag.mode.includes('w') ? drag.rect.x + drag.rect.w : drag.rect.x;
    const anchorBottom = drag.mode.includes('n') ? drag.rect.y + drag.rect.h : drag.rect.y;
    const dirW = drag.mode.includes('w') ? -1 : 1;
    const dirN = drag.mode.includes('n') ? -1 : 1;

    let w = clamp(drag.rect.w + dx * dirW, MIN_SIZE, stageW);
    let h = lockedRatio ? w / lockedRatio : clamp(drag.rect.h + dy * dirN, MIN_SIZE, stageH);

    let x = drag.mode.includes('w') ? anchorRight - w : drag.rect.x;
    let y = drag.mode.includes('n') ? anchorBottom - h : drag.rect.y;

    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > stageW) w = stageW - x;
    if (y + h > stageH) h = stageH - y;

    rect.x = x;
    rect.y = y;
    rect.w = w;
    rect.h = h;
  }

  render();
});

window.addEventListener('pointerup', (e) => {
  if (drag && drag.mode === 'draw' && rect.w < MIN_SIZE && rect.h < MIN_SIZE) {
    hasRect = false;
    render();
  }
  drag = null;
  refreshInteractive(e.clientX, e.clientY);
});

function confirm() {
  if (!hasRect || rect.w < MIN_SIZE || rect.h < MIN_SIZE) return;
  window.powerzoid.confirmRegion({
    x: Math.round(rect.x * scaleFactor),
    y: Math.round(rect.y * scaleFactor),
    w: Math.round(rect.w * scaleFactor),
    h: Math.round(rect.h * scaleFactor),
  });
}

function cancel() {
  window.powerzoid.cancelRegion();
}

// Los botones de confirmar/cancelar viven en la ventana principal de
// Powerzoid Cam, no flotando sobre el escritorio. Cuando el usuario los usa
// ahí, el proceso principal reenvía la orden hasta acá.
window.powerzoid.onRegionConfirmRequest(confirm);
window.powerzoid.onRegionCancelRequest(cancel);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirm();
  if (e.key === 'Escape') cancel();
});
