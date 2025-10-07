// UI helpers (DOM-specific)
export function setCanvasSize(canvas, stage, w, h) {
  canvas.width = w;
  canvas.height = h;
  stage.style.aspectRatio = `${w} / ${h}`;
}

export function setCanvasToMedia(canvas, stage, video, photo, media) {
  let w = 0,
    h = 0;
  if (media === video) {
    w = video.videoWidth;
    h = video.videoHeight;
  } else {
    w = photo.naturalWidth;
    h = photo.naturalHeight;
  }
  if (w && h) setCanvasSize(canvas, stage, w, h);
}

export function drawDetections(ctx, canvas, dets) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  dets.forEach((r) => {
    const { x, y, width, height } = r.detection.box;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0, 210, 255, .95)";
    ctx.strokeRect(x, y, width, height);

    const age = typeof r.age === "number" ? Math.round(r.age) : "?";
    const label = `Age ≈ ${age}`;
    ctx.font = "16px ui-sans-serif, system-ui, -apple-system, Segoe UI, Inter";
    const tw = ctx.measureText(label).width,
      pad = 8,
      bx = x,
      by = Math.max(0, y - 26);
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(bx, by, tw + pad * 2, 22);
    ctx.fillStyle = "#fff";
    ctx.fillText(label, bx + pad, by + 16);
  });
}

export function toggleFlipVisibility(flipBtn) {
  const mobile = window.innerWidth <= 768;
  flipBtn.style.display = mobile ? "" : "none";
  if (!mobile) flipBtn.disabled = true;
}
