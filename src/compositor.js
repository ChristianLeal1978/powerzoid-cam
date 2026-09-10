// Dibuja cada frame en el canvas de salida combinando la pantalla (recortada,
// opcionalmente) y la webcam como picture-in-picture. Cambiar layoutState en
// caliente (mainSource, screenEnabled, webcamEnabled, pipPosition, pipSizeRatio,
// pipShape) afecta inmediatamente al siguiente frame dibujado, incluso mientras
// se está grabando.

function drawCover(ctx, video, dx, dy, dw, dh, cropRect) {
  const sx = cropRect ? cropRect.x : 0;
  const sy = cropRect ? cropRect.y : 0;
  const sw = cropRect ? cropRect.w : video.videoWidth;
  const sh = cropRect ? cropRect.h : video.videoHeight;
  if (!sw || !sh) return;

  const srcRatio = sw / sh;
  const dstRatio = dw / dh;
  let cx = sx;
  let cy = sy;
  let cw = sw;
  let ch = sh;

  if (srcRatio > dstRatio) {
    cw = sh * dstRatio;
    cx = sx + (sw - cw) / 2;
  } else {
    ch = sw / dstRatio;
    cy = sy + (sh - ch) / 2;
  }

  ctx.drawImage(video, cx, cy, cw, ch, dx, dy, dw, dh);
}

function drawFrame(ctx, canvas, layoutState) {
  const { screenVideo, webcamVideo, cropRect, mainSource, screenEnabled, webcamEnabled, pipPosition, pipSizeRatio, pipShape } = layoutState;

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const showScreen = screenEnabled && screenVideo && screenVideo.readyState >= 2;
  const showWebcam = webcamEnabled && webcamVideo && webcamVideo.readyState >= 2;

  let mainVideo = null;
  let mainCrop = null;
  let pipVideo = null;
  let pipCrop = null;

  if (mainSource === 'webcam' && showWebcam) {
    mainVideo = webcamVideo;
    if (showScreen) {
      pipVideo = screenVideo;
      pipCrop = cropRect;
    }
  } else if (showScreen) {
    mainVideo = screenVideo;
    mainCrop = cropRect;
    if (showWebcam) {
      pipVideo = webcamVideo;
    }
  } else if (showWebcam) {
    mainVideo = webcamVideo;
  }

  if (mainVideo) {
    drawCover(ctx, mainVideo, 0, 0, canvas.width, canvas.height, mainCrop);
  }

  if (pipVideo) {
    const pipW = canvas.width * pipSizeRatio;
    const pipH = (pipVideo.videoHeight / pipVideo.videoWidth) * pipW || pipW;
    const margin = canvas.width * 0.02;
    let px = margin;
    let py = margin;
    if (pipPosition === 'tr' || pipPosition === 'br') px = canvas.width - pipW - margin;
    if (pipPosition === 'bl' || pipPosition === 'br') py = canvas.height - pipH - margin;

    ctx.save();
    if (pipShape === 'circle') {
      const r = Math.min(pipW, pipH) / 2;
      ctx.beginPath();
      ctx.arc(px + pipW / 2, py + pipH / 2, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      drawCover(ctx, pipVideo, px + pipW / 2 - r, py + pipH / 2 - r, r * 2, r * 2, pipCrop);
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      drawCover(ctx, pipVideo, px, py, pipW, pipH, pipCrop);
      ctx.strokeRect(px, py, pipW, pipH);
    }
    ctx.restore();
  }
}
