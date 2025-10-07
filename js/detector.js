// Face & Age detection utilities (no DOM assumptions)
export const WEIGHTS =
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@0.22.2/weights";
export const MAX_SIDE = 1280;
export const EMA_ALPHA = 0.3;

export function ema(prev, value, alpha = EMA_ALPHA) {
  return prev == null ? value : alpha * value + (1 - alpha) * prev;
}

export async function loadModels() {
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri(WEIGHTS),
    faceapi.nets.ageGenderNet.loadFromUri(WEIGHTS),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri(WEIGHTS),
  ]);
}

export function getInputSize(width) {
  if (width >= 1200) return 512;
  if (width >= 900) return 416;
  return 320;
}

export async function detectAll(el, canvasWidth, canvasHeight) {
  const opts = new faceapi.TinyFaceDetectorOptions({
    inputSize: getInputSize(canvasWidth || 640),
    scoreThreshold: 0.5,
  });

  const raw = await faceapi
    .detectAllFaces(el, opts)
    .withFaceLandmarks(true)
    .withAgeAndGender();

  return faceapi.resizeResults(raw, {
    width: canvasWidth,
    height: canvasHeight,
  });
}

export function downscaleImage(img, maxSide = MAX_SIDE) {
  const w0 = img.naturalWidth,
    h0 = img.naturalHeight;
  const s = Math.min(1, maxSide / Math.max(w0, h0));
  const w = Math.round(w0 * s),
    h = Math.round(h0 * s);
  const off = document.createElement("canvas");
  off.width = w;
  off.height = h;
  off.getContext("2d").drawImage(img, 0, 0, w, h);
  return { dataUrl: off.toDataURL("image/jpeg", 0.92), w, h };
}

export async function ensureVideoReady(video, timeout = 2500) {
  if (video.readyState < 1)
    await new Promise((res) => (video.onloadedmetadata = res));
  const t0 = performance.now();
  while (
    (video.videoWidth === 0 || video.videoHeight === 0) &&
    performance.now() - t0 < timeout
  ) {
    await new Promise((r) => setTimeout(r, 50));
  }
  return video.videoWidth > 0 && video.videoHeight > 0;
}

export async function enumerateCameras() {
  const map = { user: null, environment: null };
  try {
    const devs = await navigator.mediaDevices.enumerateDevices();
    const vids = devs.filter((d) => d.kind === "videoinput");
    for (const d of vids) {
      const l = (d.label || "").toLowerCase();
      if (/back|rear|environment/.test(l)) map.environment = d.deviceId;
      if (/front|user|face/.test(l)) map.user = d.deviceId;
    }
    if (!map.user && vids[0]) map.user = vids[0].deviceId;
    if (!map.environment && vids[1]) map.environment = vids[1].deviceId;
  } catch {}
  return map;
}

export async function getStream(dir, deviceMap) {
  const devId = deviceMap?.[dir];
  const tries = [
    {
      video: {
        ...(devId ? { deviceId: { exact: devId } } : {}),
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
    {
      video: {
        facingMode: { ideal: dir },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
    { video: true, audio: false },
  ];
  let err = null;
  for (const c of tries) {
    try {
      return await navigator.mediaDevices.getUserMedia(c);
    } catch (e) {
      err = e;
    }
  }
  throw err || new Error("No camera available");
}
