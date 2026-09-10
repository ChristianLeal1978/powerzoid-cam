// Envoltorio simple sobre MediaRecorder: arranca, pausa/reanuda, detiene y
// guarda el archivo resultante a través del proceso principal.

function pickMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) || '';
}

class RecorderEngine {
  constructor(stream) {
    const mimeType = pickMimeType();
    this.mimeType = mimeType;
    this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];

    this.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.chunks.push(event.data);
    };
  }

  start() {
    this.chunks = [];
    this.recorder.start(1000);
  }

  pause() {
    this.recorder.pause();
  }

  resume() {
    this.recorder.resume();
  }

  // Resuelve con la ruta final del archivo guardado en ~/Videos/PowerzoidCam.
  stop() {
    return new Promise((resolve, reject) => {
      this.recorder.onstop = async () => {
        try {
          const blob = new Blob(this.chunks, { type: this.mimeType || 'video/webm' });
          const buffer = await blob.arrayBuffer();
          const filename = `powerzoid-cam-${timestamp()}.webm`;
          const fullPath = await window.powerzoid.saveRecording(buffer, filename);
          resolve(fullPath);
        } catch (err) {
          reject(err);
        }
      };
      this.recorder.stop();
    });
  }
}

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}
