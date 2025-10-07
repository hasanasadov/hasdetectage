import {
  loadModels,
  detectAll,
  ensureVideoReady,
  enumerateCameras,
  getStream,
  downscaleImage,
  ema,
} from "./detector.js";
import {
  setCanvasSize,
  setCanvasToMedia,
  drawDetections,
  toggleFlipVisibility,
} from "./ui.js";

// ------- Elements -------
const video = document.getElementById("cam");
const photo = document.getElementById("photo");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

const startBtn = document.getElementById("startBtn");
const flipBtn = document.getElementById("flipBtn");
const stopBtn = document.getElementById("stopBtn");
const uploadEl = document.getElementById("uploader");
const clearBtn = document.getElementById("clearBtn");

const statusEl = document.getElementById("status");
const navAgeEl = document.getElementById("navAge");
const stage = document.getElementById("stage");
document.getElementById("year").textContent = new Date().getFullYear();

// ------- State -------
let stream = null;
let runningCam = false;
let runningVid = false;
let rafId = null;
let currentFacing = "user"; // 'user' | 'environment'
let deviceMap = { user: null, environment: null };
let emaAge = null;

// ------- Responsiveness -------
toggleFlipVisibility(flipBtn);
window.addEventListener("resize", () => toggleFlipVisibility(flipBtn));

// ------- Boot: load models -------
(async () => {
  try {
    statusEl.textContent = "Loading models…";
    await loadModels();
    statusEl.textContent = "Models ready. Start camera or upload.";
    startBtn.disabled = false;
    clearBtn.disabled = false;
  } catch (e) {
    console.error(e);
    statusEl.textContent = "Failed to load models.";
  }
})();

// ------- Detection -------
async function detectOnSource(sourceEl) {
  const sized =
    sourceEl === video
      ? video.videoWidth > 0 && video.videoHeight > 0
      : photo.naturalWidth > 0 && photo.naturalHeight > 0;
  if (!sized || !canvas.width || !canvas.height) return;

  const dets = await detectAll(sourceEl, canvas.width, canvas.height);
  drawDetections(ctx, canvas, dets);

  if (dets.length === 1 && typeof dets[0].age === "number") {
    emaAge = ema(emaAge, dets[0].age);
    navAgeEl.textContent = String(Math.round(emaAge));
  } else {
    emaAge = null;
    navAgeEl.textContent = "—";
  }
}

async function camLoop() {
  if (!runningCam) return;
  await detectOnSource(video);
  rafId = requestAnimationFrame(camLoop);
}

async function fileVideoLoop() {
  if (!runningVid) return;
  await detectOnSource(video);
  rafId = requestAnimationFrame(fileVideoLoop);
}

// ------- Camera control -------
async function startCamera(dir = currentFacing) {
  stopCamera(); // clean

  // Try to bind a real camera (cascade constraints)
  deviceMap = await enumerateCameras();
  let s = await getStream(dir, deviceMap);
  stream = s;
  video.srcObject = s;
  photo.style.display = "none";
  video.style.display = "";
  await video.play();

  // Wait for dimensions; fallback to generic stream if needed
  const ok = await ensureVideoReady(video, 2500);
  if (!ok) {
    try {
      s.getTracks().forEach((t) => t.stop());
      s = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      stream = s;
      video.srcObject = s;
      await video.play();
      await ensureVideoReady(video, 2500);
    } catch {}
  }

  setCanvasToMedia(canvas, stage, video, photo, video);
  runningCam = true;
  statusEl.textContent = `Detecting… (${dir === "user" ? "Front" : "Rear"})`;

  startBtn.disabled = true;
  stopBtn.disabled = false;
  clearBtn.disabled = false;
  const mobile = window.innerWidth <= 768;
  flipBtn.disabled = !mobile;

  camLoop();
}

function stopCamera() {
  runningCam = false;
  runningVid = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  startBtn.disabled = false;
  stopBtn.disabled = true;
  flipBtn.disabled = true;
}

// ------- Uploads -------
async function handleUpload(file) {
  stopCamera();
  emaAge = null;
  navAgeEl.textContent = "—";
  if (!file) return;

  const url = URL.createObjectURL(file);

  if (file.type.startsWith("image/")) {
    const tmp = new Image();
    tmp.onload = async () => {
      const { dataUrl, w, h } = downscaleImage(tmp);
      photo.src = dataUrl;
      photo.style.display = "";
      video.style.display = "none";
      photo.onload = async () => {
        setCanvasSize(canvas, stage, w, h);
        statusEl.textContent = "Detecting…";
        await detectOnSource(photo);
        statusEl.textContent = "Done. (Upload another or start camera)";
      };
      URL.revokeObjectURL(url);
    };
    tmp.onerror = () => {
      URL.revokeObjectURL(url);
      alert("Could not load image.");
    };
    tmp.src = url;
  } else if (file.type.startsWith("video/")) {
    photo.style.display = "none";
    video.style.display = "";
    video.srcObject = null;
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    setCanvasToMedia(canvas, stage, video, photo, video);
    runningVid = true;
    statusEl.textContent = "Detecting…";
    fileVideoLoop();
    video.onended = () => {
      runningVid = false;
      statusEl.textContent = "Video ended. (Upload another or start camera)";
      URL.revokeObjectURL(url);
    };
  } else {
    URL.revokeObjectURL(url);
    alert("Unsupported file type.");
  }
}

// ------- Events -------
startBtn.addEventListener("click", async () => {
  try {
    statusEl.textContent = "Starting camera…";
    await startCamera(currentFacing);
  } catch (e) {
    console.error(e);
    statusEl.textContent =
      "Camera error: " +
      (e?.message || "unknown") +
      " (Use HTTPS or localhost)";
  }
});

flipBtn.addEventListener("click", async () => {
  currentFacing = currentFacing === "user" ? "environment" : "user";
  try {
    statusEl.textContent = `Switching to ${
      currentFacing === "user" ? "Front" : "Rear"
    }…`;
    await startCamera(currentFacing);
  } catch (e) {
    console.error(e);
    statusEl.textContent = "Flip failed: " + (e?.message || "unknown");
  }
});

stopBtn.addEventListener("click", () => {
  stopCamera();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  statusEl.textContent = "Stopped. (Upload or start camera)";
  emaAge = null;
  navAgeEl.textContent = "—";
});

uploadEl.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  clearBtn.disabled = true;
  statusEl.textContent = "Loading file…";
  await handleUpload(file);
  clearBtn.disabled = false;
  uploadEl.value = "";
});

clearBtn.addEventListener("click", () => {
  runningVid = false;
  if (rafId) cancelAnimationFrame(rafId);
  video.pause();
  video.removeAttribute("src");
  video.load();
  photo.removeAttribute("src");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  statusEl.textContent = "Cleared. (Start camera or upload again)";
  emaAge = null;
  navAgeEl.textContent = "—";
});
