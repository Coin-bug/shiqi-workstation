const { cardSlots, promptCards } = window;

const entryPage = document.querySelector("#entryPage");
const workspacePage = document.querySelector("#workspacePage");
const startButton = document.querySelector("#startButton");
const uploadButton = document.querySelector("#uploadButton");
const modalLayer = document.querySelector("#modalLayer");
const closeModal = document.querySelector("#closeModal");
const dropZone = document.querySelector("#dropZone");
const fileInput = document.querySelector("#fileInput");
const previewImage = document.querySelector("#previewImage");
const uploadError = document.querySelector("#uploadError");
const loadingText = document.querySelector("#loadingText");
const loadingCopy = document.querySelector("#loadingCopy");
const progressBar = document.querySelector("#progressBar");
const resultPanel = document.querySelector("#resultPanel");
const titleInput = document.querySelector("#titleInput");
const tagsInput = document.querySelector("#tagsInput");
const chinesePrompt = document.querySelector("#chinesePrompt");
const englishPrompt = document.querySelector("#englishPrompt");
const savePrompt = document.querySelector("#savePrompt");
const copyChinese = document.querySelector("#copyChinese");
const copyEnglish = document.querySelector("#copyEnglish");
const toast = document.querySelector("#toast");
const cardHotzones = document.querySelector("#cardHotzones");
const savedCards = document.querySelector("#savedCards");
const workspaceScroll = document.querySelector("#workspaceScroll");

const stages = [
  { max: 30, text: "正在识别画面主体" },
  { max: 60, text: "正在拆解风格与构图" },
  { max: 100, text: "正在生成完整 Prompt" }
];

let progressTimer = null;
let toastTimer = null;
let resultScrollTimer = null;
let loadingTextTimer = null;
let currentPreviewUrl = "";
let savedIndex = 0;
let cardLayoutFrame = 0;

function fitStage() {
  const entryScale = Math.min(window.innerWidth / 1440, window.innerHeight / 900);
  document.documentElement.style.setProperty("--stage-scale", entryScale.toString());
  scheduleCardLayout();
}

window.addEventListener("resize", fitStage);
fitStage();
renderCardHotzones();
initEntryShiqEffect();

startButton.addEventListener("click", () => {
  if (entryPage.classList.contains("is-exiting")) return;
  entryPage.classList.add("is-exiting");
  window.setTimeout(() => {
    entryPage.classList.remove("is-active", "is-exiting");
    workspacePage.classList.add("is-active");
    document.documentElement.classList.add("is-workspace");
    document.body.classList.add("is-workspace");
    scheduleCardLayout();
  }, 260);
});

document.querySelectorAll(".menu-hit").forEach((button) => {
  button.addEventListener("click", (event) => event.preventDefault());
});

uploadButton.addEventListener("click", () => {
  resetUploadState();
  fileInput.click();
});
closeModal.addEventListener("click", closeUploadModal);

function openModal() {
  modalLayer.className = "modal-layer is-open is-idle";
  modalLayer.setAttribute("aria-hidden", "false");
  resetUploadState();
}

function closeUploadModal() {
  modalLayer.className = "modal-layer";
  modalLayer.setAttribute("aria-hidden", "true");
  stopProgress();
  if (resultScrollTimer) window.clearTimeout(resultScrollTimer);
  resultScrollTimer = null;
  resultPanel.classList.remove("is-scrolling");
}

function resetUploadState() {
  stopProgress();
  progressBar.style.width = "0%";
  setLoadingStage(stages[0].text, true);
  dropZone.classList.remove("has-image", "has-error", "is-dragover");
  resultPanel.classList.remove("is-scrolling");
  uploadError.style.display = "";
  previewImage.removeAttribute("src");
  if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
  currentPreviewUrl = "";
  fileInput.value = "";
}

dropZone.addEventListener("click", () => {
  if (dropZone.classList.contains("has-error")) resetUploadState();
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("is-dragover");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragover");
  const file = event.dataTransfer.files?.[0];
  if (file) handleFile(file);
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) handleFile(file);
});

document.addEventListener("dragover", (event) => {
  if (event.dataTransfer?.types?.includes("Files")) {
    event.preventDefault();
  }
});

document.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files?.[0];
  if (file) {
    event.preventDefault();
    handleFile(file);
  }
});

async function handleFile(file) {
  if (!file.type.startsWith("image/")) {
    showError();
    return;
  }

  if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
  currentPreviewUrl = URL.createObjectURL(file);
  previewImage.src = currentPreviewUrl;
  modalLayer.setAttribute("aria-hidden", "false");
  dropZone.classList.add("has-image");
  dropZone.classList.remove("has-error");
  modalLayer.className = "modal-layer is-open is-loading";

  startProgress();

  try {
    const result = await analyzeImage(file);
    finishProgress();
    await wait(360);
    showResult(result);
  } catch {
    showError();
  }
}

function startProgress() {
  stopProgress();
  let value = 0;
  progressTimer = window.setInterval(() => {
    value = Math.min(value + Math.random() * 4.2 + 1.2, 94);
    updateProgress(value);
  }, 180);
}

function finishProgress() {
  stopProgress();
  updateProgress(100);
}

function stopProgress() {
  if (progressTimer) window.clearInterval(progressTimer);
  progressTimer = null;
}

function updateProgress(value) {
  progressBar.style.width = `${value}%`;
  const stage = stages.find((item) => value <= item.max) || stages[2];
  setLoadingStage(stage.text);
}

function setLoadingStage(text, immediate = false) {
  if (!loadingText || loadingText.textContent === text) return;
  if (loadingTextTimer) window.clearTimeout(loadingTextTimer);
  if (immediate || !loadingCopy) {
    loadingText.textContent = text;
    return;
  }

  loadingCopy.classList.add("is-changing");
  loadingTextTimer = window.setTimeout(() => {
    loadingText.textContent = text;
    loadingCopy.classList.remove("is-changing");
    loadingTextTimer = null;
  }, 120);
}

function showResult(result) {
  modalLayer.className = "modal-layer is-open is-complete";
  titleInput.value = result.title || "静谧之中听见野性";
  tagsInput.value = (result.tags || []).slice(0, 3).join("；") || "野性静音；可爱拟人；高端耳机";
  chinesePrompt.value = result.chinesePrompt || chinesePrompt.value;
  englishPrompt.value = result.englishPrompt || englishPrompt.value;
  resultPanel.scrollTop = 0;
  resultPanel.classList.remove("is-scrolling");
}

function showError() {
  stopProgress();
  modalLayer.className = "modal-layer is-open is-error";
  modalLayer.setAttribute("aria-hidden", "false");
  dropZone.classList.remove("has-image");
  dropZone.classList.add("has-error");
  uploadError.style.display = "block";
  showToast("上传失败，请重新上传");
}

async function analyzeImage(file) {
  await wait(880);
  return mockResult(file);
}

function mockResult(file) {
  const seedSource = `${file.name}-${file.size}-${savedIndex}`;
  let hash = 0;
  for (const char of seedSource) {
    hash = (hash * 31 + char.charCodeAt(0)) % 2147483647;
  }

  const preset = promptCards[hash % promptCards.length] || promptCards[0];
  const cleanName = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const fallbackTitle = preset?.title || "橙衣工业潮玩人物肖像";
  const title = cleanName ? cleanName.slice(0, 18) : fallbackTitle;

  return {
    title,
    tags: [...(preset?.tags || ["潮玩肖像", "橙黑撞色", "厚重服装"])].slice(0, 3),
    chinesePrompt:
      preset?.prompt ||
      "竖版近景人物肖像，一个工业潮玩风格的3D角色穿厚重橙色充气夹克，身体比例圆润夸张，脖颈被高领包裹，只露出冷酷眼神与鼻梁。角色戴深灰棒球帽，帽檐压低，一只手扶住帽檐，胸前有金属拉链、背带、徽章、身份牌和小型装饰标识，整体呈工装机能感。背景为纯黑低调空间，后方隐约出现巨大深灰字母作为层次。橙色服装与黑灰配件形成强烈撞色，材质为柔软充气布料、哑光塑料与金属，棚拍硬光，边缘高光清晰，潮流玩具海报质感。",
    englishPrompt:
      "A stylized industrial designer-toy portrait in a vertical composition, featuring a rounded 3D character wearing a bulky orange padded jacket, dark cap, layered straps, metallic zipper details, identity badge and utility accessories. The figure is framed against a deep black background with subtle oversized typography, creating a bold orange-and-charcoal contrast. Materials feel like soft inflatable fabric, matte plastic and brushed metal, lit with crisp studio highlights for a premium collectible poster look."
  };
}

copyChinese.addEventListener("click", () => copyText(chinesePrompt.value, "中文 Prompt 已复制"));
copyEnglish.addEventListener("click", () => copyText(englishPrompt.value, "英文 Prompt 已复制"));
resultPanel.addEventListener("scroll", showResultScrollbar);

savePrompt.addEventListener("click", () => {
  const result = {
    title: titleInput.value.trim() || "未命名 Prompt",
    tags: tagsInput.value
      .split(/[;；,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 3),
    chinesePrompt: chinesePrompt.value,
    englishPrompt: englishPrompt.value,
    image: currentPreviewUrl
  };
  addSavedCard(result);
  currentPreviewUrl = "";
  showToast("保存成功");
  closeUploadModal();
});

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast(message);
}

function addSavedCard(result) {
  savedIndex += 1;
  [...savedCards.children].forEach((card, index) => {
    card.style.transform = `translateY(${(index + 1) * 22}px) scale(${Math.max(0.88, 1 - (index + 1) * 0.035)})`;
    card.style.opacity = String(Math.max(0.24, 0.74 - index * 0.12));
  });

  const card = document.createElement("article");
  card.className = "saved-card";
  card.style.left = "0px";
  card.style.top = "0px";
  card.style.zIndex = String(20 + savedIndex);

  if (result.image) {
    const image = document.createElement("img");
    image.src = result.image;
    image.alt = result.title;
    card.appendChild(image);
  }

  const caption = document.createElement("div");
  caption.className = "saved-caption";
  caption.textContent = result.title;
  card.appendChild(caption);

  savedCards.prepend(card);
}

function renderCardHotzones() {
  cardHotzones.innerHTML = "";
  promptCards.forEach((card, index) => {
    const slot = cardSlots[index];
    if (!slot) return;

    const item = document.createElement("article");
    item.className = "card-hotzone";
    item.tabIndex = 0;
    item.dataset.ratio = String(slot.height / slot.width);
    item.style.setProperty("--enter-order", String(index));
    item.setAttribute("aria-label", card.title);

    item.innerHTML = `
      <img class="card-base" src="${card.image}" alt="${card.title}" />
      <div class="card-info">
        <h2>${card.title}</h2>
        <div class="card-tags">${card.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>
        <p>${card.prompt}</p>
        <button class="card-copy" type="button" aria-label="复制中文 Prompt">
          <img class="copy-default" src="assets/figma/copy-default.svg" alt="" />
          <img class="copy-done" src="assets/figma/copy-done.svg" alt="" />
        </button>
      </div>
    `;

    item.querySelector(".card-copy").addEventListener("click", async (event) => {
      event.stopPropagation();
      await copyText(card.prompt, "中文 Prompt 已复制");
      const button = event.currentTarget;
      button.classList.add("is-done");
      window.setTimeout(() => button.classList.remove("is-done"), 1200);
    });

    cardHotzones.appendChild(item);
  });
  scheduleCardLayout();
}

function scheduleCardLayout() {
  if (!cardHotzones) return;
  if (cardLayoutFrame) window.cancelAnimationFrame(cardLayoutFrame);
  cardLayoutFrame = window.requestAnimationFrame(layoutCards);
}

function layoutCards() {
  cardLayoutFrame = 0;
  const cards = [...cardHotzones.querySelectorAll(".card-hotzone")];
  if (!cards.length) return;

  const gap = 16;
  const designCardWidth = 282;
  const availableWidth = Math.max(cardHotzones.clientWidth, 1);
  const columnCount = Math.max(1, Math.floor((availableWidth + gap) / (designCardWidth + gap)));
  const columnWidth = Math.floor((availableWidth - gap * (columnCount - 1)) / columnCount);
  const columns = Array.from({ length: columnCount }, () => 0);

  cards.forEach((card) => {
    const ratio = Number(card.dataset.ratio || 1);
    const columnIndex = columns.indexOf(Math.min(...columns));
    const left = columnIndex * (columnWidth + gap);
    const top = columns[columnIndex];
    const height = Math.max(180, Math.round(columnWidth * ratio));
    const promptLines = Math.max(2, Math.floor((height - 198) / 20));

    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    card.style.width = `${columnWidth}px`;
    card.style.height = `${height}px`;
    card.style.setProperty("--prompt-lines", String(promptLines));
    columns[columnIndex] += height + gap;
  });

  const contentHeight = Math.max(...columns) - gap;
  cardHotzones.style.height = `${Math.max(0, contentHeight)}px`;
  if (workspaceScroll) workspaceScroll.style.setProperty("--content-height", `${contentHeight}px`);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-show");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-show"), 1800);
}

function showResultScrollbar() {
  resultPanel.classList.add("is-scrolling");
  if (resultScrollTimer) window.clearTimeout(resultScrollTimer);
  resultScrollTimer = window.setTimeout(() => {
    resultPanel.classList.remove("is-scrolling");
  }, 760);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function initEntryShiqEffect() {
  const root = document.querySelector("#entryShiqEffect");
  const beamCanvas = document.querySelector("#entryShiqBeam");
  const fogCanvas = document.querySelector("#entryShiqFog");
  const logo = root?.querySelector(".entry-shiq-logo");
  if (!root || !beamCanvas || !fogCanvas || !logo || !window.Path2D) return;

  const beamCtx = beamCanvas.getContext("2d", { alpha: true });
  const fogCtx = fogCanvas.getContext("2d", { alpha: true });
  if (!beamCtx || !fogCtx) return;

  const logoBounds = { x: 0, y: 0, width: 0, height: 0 };
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return;
  const logoPaths = [...logo.querySelectorAll("path")].map((path) => new Path2D(path.getAttribute("d") || ""));
  const fogPuffs = Array.from({ length: 32 }, (_, index) => ({
    seed: index * 91.7,
    baseX: (index % 9) / 8,
    baseY: 0.24 + ((index * 37) % 100) / 190,
    radius: 0.16 + ((index * 17) % 100) / 850,
    speed: 0.42 + ((index * 13) % 100) / 260,
    alpha: 0.11 + ((index * 19) % 100) / 1000
  }));
  const anchorPuffs = [
    { x: -0.42, y: 0.08, radius: 0.66, phase: 0.2 },
    { x: -0.2, y: -0.2, radius: 0.58, phase: 1.4 },
    { x: 0.08, y: 0.18, radius: 0.72, phase: 2.1 },
    { x: 0.32, y: -0.1, radius: 0.64, phase: 3.2 },
    { x: 0.48, y: 0.12, radius: 0.54, phase: 4.4 }
  ];
  let renderScale = 1;
  let maskIsDirty = true;

  function resizeShiqCanvas() {
    const rect = fogCanvas.getBoundingClientRect();
    renderScale = Math.min(window.devicePixelRatio || 1, 1.5);
    beamCanvas.width = Math.round(rect.width * renderScale);
    beamCanvas.height = Math.round(rect.height * renderScale);
    fogCanvas.width = Math.round(rect.width * renderScale);
    fogCanvas.height = Math.round(rect.height * renderScale);
    beamCtx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    fogCtx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    updateShiqBounds();
    pointer.x = pointer.targetX = logoBounds.x + logoBounds.width * 0.18;
    pointer.y = pointer.targetY = logoBounds.y - logoBounds.height * 0.2;
    maskIsDirty = true;
  }

  function updateShiqBounds() {
    const canvasRect = fogCanvas.getBoundingClientRect();
    const logoRect = logo.getBoundingClientRect();
    logoBounds.width = logoRect.width;
    logoBounds.height = logoRect.height;
    logoBounds.x = logoRect.left - canvasRect.left + logoRect.width / 2;
    logoBounds.y = logoRect.top - canvasRect.top + logoRect.height / 2;
  }

  function drawPuff(ctx, x, y, radius, alpha, colorStops) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    colorStops.forEach(([stop, color]) => gradient.addColorStop(stop, color));
    ctx.fillStyle = gradient;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawLogoShape(ctx, x, y, scaleX, scaleY, alpha, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scaleX, scaleY);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    logoPaths.forEach((path) => ctx.fill(path));
    ctx.restore();
  }

  function drawBeam() {
    const width = beamCanvas.clientWidth;
    const height = beamCanvas.clientHeight;
    const dx = pointer.x - logoBounds.x;
    const dy = pointer.y - logoBounds.y;
    const distance = Math.hypot(dx, dy) || 1;
    const axis = { x: dx / distance, y: dy / distance };
    const side = { x: -axis.y, y: axis.x };
    const logoLeft = logoBounds.x - logoBounds.width / 2;
    const logoTop = logoBounds.y - logoBounds.height / 2;
    const scaleX = logoBounds.width / 423;
    const scaleY = logoBounds.height / 151;

    beamCtx.clearRect(0, 0, width, height);
    beamCtx.save();
    beamCtx.globalCompositeOperation = "lighter";
    for (let step = 1; step <= 12; step += 1) {
      const layer = step / 12;
      const spread = Math.max(0, (layer - 0.18) / 0.82);
      const axisOffset = logoBounds.width * spread * 0.62;
      const sideOffset = logoBounds.height * spread * 0.62;
      const alpha = (1 - layer) ** 1.55;
      const stretchX = 1 + spread * (Math.abs(axis.x) * 0.16 + Math.abs(side.x) * 0.92);
      const stretchY = 1 + spread * (Math.abs(axis.y) * 0.16 + Math.abs(side.y) * 0.92);
      beamCtx.filter = `blur(${7 + layer * 16}px)`;
      [0, -1, 1].forEach((sideIndex) => {
        if (sideIndex !== 0 && step % 4 !== 0) return;
        const sideAlpha = sideIndex === 0 ? 1 : 0.22;
        const offsetX = axis.x * axisOffset + side.x * sideIndex * sideOffset;
        const offsetY = axis.y * axisOffset + side.y * sideIndex * sideOffset;
        drawLogoShape(
          beamCtx,
          logoLeft + offsetX - (logoBounds.width * (stretchX - 1)) / 2,
          logoTop + offsetY - (logoBounds.height * (stretchY - 1)) / 2,
          scaleX * stretchX,
          scaleY * stretchY,
          alpha * sideAlpha * 0.12,
          "rgb(255, 112, 18)"
        );
      });
    }
    beamCtx.filter = "blur(9px)";
    drawLogoShape(beamCtx, logoLeft, logoTop, scaleX, scaleY, 0.18, "rgb(255, 164, 52)");
    beamCtx.globalCompositeOperation = "destination-out";
    beamCtx.filter = "blur(2px)";
    drawLogoShape(beamCtx, logoLeft, logoTop, scaleX, scaleY, 1, "#000");
    beamCtx.globalCompositeOperation = "lighter";
    beamCtx.filter = "blur(22px)";
    const radial = beamCtx.createRadialGradient(
      logoBounds.x - axis.x * logoBounds.width * 0.08,
      logoBounds.y - axis.y * logoBounds.height * 0.12,
      0,
      logoBounds.x,
      logoBounds.y,
      logoBounds.width * 0.68
    );
    radial.addColorStop(0, "rgba(255, 128, 24, 0.16)");
    radial.addColorStop(0.42, "rgba(255, 76, 8, 0.07)");
    radial.addColorStop(1, "rgba(255, 91, 10, 0)");
    beamCtx.fillStyle = radial;
    beamCtx.fillRect(0, 0, width, height);
    beamCtx.restore();
  }

  function drawWarmPuff(x, y, radius, alpha, phase) {
    const swayX = Math.cos(phase) * radius * 0.13;
    const swayY = Math.sin(phase * 1.2) * radius * 0.08;
    drawPuff(fogCtx, x - swayX, y - swayY, radius * 1.28, alpha * 0.34, [
      [0, "rgba(255, 164, 42, 0.48)"],
      [0.48, "rgba(255, 100, 15, 0.2)"],
      [1, "rgba(255, 100, 15, 0)"]
    ]);
    drawPuff(fogCtx, x, y, radius, alpha * 0.82, [
      [0, "rgba(255, 184, 65, 0.82)"],
      [0.34, "rgba(255, 122, 24, 0.48)"],
      [0.72, "rgba(255, 86, 12, 0.18)"],
      [1, "rgba(255, 86, 12, 0)"]
    ]);
  }

  function drawDarkPuff(x, y, radius, alpha) {
    drawPuff(fogCtx, x, y, radius, alpha, [
      [0, "rgba(55, 17, 2, 0.58)"],
      [0.46, "rgba(92, 31, 3, 0.2)"],
      [1, "rgba(92, 31, 3, 0)"]
    ]);
  }

  function drawMask(width, height) {
    const scaleX = logoBounds.width / 423;
    const scaleY = logoBounds.height / 151;
    const left = logoBounds.x - logoBounds.width / 2;
    const top = logoBounds.y - logoBounds.height / 2;
    maskCanvas.width = Math.round(width * renderScale);
    maskCanvas.height = Math.round(height * renderScale);
    maskCtx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    maskCtx.clearRect(0, 0, width, height);
    maskCtx.save();
    maskCtx.translate(left, top);
    maskCtx.scale(scaleX, scaleY);
    maskCtx.lineJoin = "round";
    maskCtx.lineCap = "round";
    maskCtx.strokeStyle = "#fff";
    maskCtx.fillStyle = "rgba(255, 255, 255, 0.88)";
    maskCtx.filter = "blur(9px)";
    maskCtx.lineWidth = 24;
    logoPaths.forEach((path) => maskCtx.stroke(path));
    maskCtx.filter = "blur(4px)";
    maskCtx.lineWidth = 10;
    logoPaths.forEach((path) => maskCtx.stroke(path));
    maskCtx.filter = "none";
    maskCtx.globalCompositeOperation = "destination-out";
    logoPaths.forEach((path) => maskCtx.fill(path));
    maskCtx.restore();
    maskIsDirty = false;
  }

  function clipFogToLogo(width, height) {
    if (maskIsDirty) drawMask(width, height);
    fogCtx.save();
    fogCtx.globalCompositeOperation = "destination-in";
    fogCtx.drawImage(maskCanvas, 0, 0, width, height);
    fogCtx.restore();
  }

  function renderShiq(time = 0) {
    const width = fogCanvas.clientWidth;
    const height = fogCanvas.clientHeight;
    const seconds = time / 1000;
    pointer.x += (pointer.targetX - pointer.x) * 0.08;
    pointer.y += (pointer.targetY - pointer.y) * 0.08;

    drawBeam();
    fogCtx.clearRect(0, 0, width, height);
    fogCtx.globalCompositeOperation = "source-over";
    fogPuffs.forEach((puff) => {
      const phase = seconds * puff.speed + puff.seed;
      const pulse = 0.72 + Math.sin(seconds * 2.4 + puff.seed) * 0.28;
      const x = logoBounds.x + Math.sin(phase) * logoBounds.width * (0.38 + puff.baseX * 0.16);
      const y = logoBounds.y + Math.cos(phase * 0.9) * logoBounds.height * (0.18 + puff.baseY * 0.16);
      drawWarmPuff(x, y, puff.radius * logoBounds.width * (0.42 + pulse * 0.12), puff.alpha * pulse, phase);
    });

    const pulse = 0.7 + Math.sin(seconds * 2.35) * 0.22 + Math.sin(seconds * 4.1) * 0.08;
    fogCtx.globalCompositeOperation = "lighter";
    drawPuff(fogCtx, logoBounds.x, logoBounds.y, logoBounds.width * (0.48 + pulse * 0.1), 0.42 + pulse * 0.1, [
      [0, "rgba(255, 132, 28, 0.62)"],
      [0.35, "rgba(255, 92, 18, 0.34)"],
      [0.74, "rgba(255, 58, 8, 0.1)"],
      [1, "rgba(255, 69, 10, 0)"]
    ]);
    anchorPuffs.forEach((puff) => {
      const localPulse = 0.74 + Math.sin(seconds * 2.15 + puff.phase) * 0.26;
      const x = logoBounds.x + logoBounds.width * puff.x;
      const y = logoBounds.y + logoBounds.height * puff.y;
      const radius = logoBounds.height * puff.radius * (0.9 + localPulse * 0.18);
      drawWarmPuff(x, y, radius, 0.16 + localPulse * 0.1, puff.phase);
      drawDarkPuff(x + Math.cos(puff.phase) * radius * 0.18, y + Math.sin(puff.phase) * radius * 0.12, radius * 0.54, 0.1 + localPulse * 0.06);
    });
    clipFogToLogo(width, height);
    window.requestAnimationFrame(renderShiq);
  }

  const updatePointer = (event) => {
    const rect = beamCanvas.getBoundingClientRect();
    pointer.targetX = event.clientX - rect.left;
    pointer.targetY = event.clientY - rect.top;
  };

  window.addEventListener("resize", resizeShiqCanvas);
  entryPage.addEventListener("pointermove", updatePointer);
  window.addEventListener("load", resizeShiqCanvas);
  resizeShiqCanvas();
  window.requestAnimationFrame(renderShiq);
}
