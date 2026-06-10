const { cardSlots, promptCards } = window;

const entryPage = document.querySelector("#entryPage");
const landingFrame = document.querySelector("#landingFrame");
const startButtonFallback = document.querySelector("#startButtonFallback");
const workspacePage = document.querySelector("#workspacePage");
const uploadButton = document.querySelector("#uploadButton");
const workspaceMain = document.querySelector(".workspace-main");
const workspaceTitleText = document.querySelector(".workspace-title span");
const modalLayer = document.querySelector("#modalLayer");
const closeModal = document.querySelector("#closeModal");
const dropZone = document.querySelector("#dropZone");
const fileInput = document.querySelector("#fileInput");
const previewImage = document.querySelector("#previewImage");
const scanOverlayGrid = document.querySelector("#scanOverlayGrid");
const uploadError = document.querySelector("#uploadError");
const retryUploadButton = document.querySelector("#retryUploadButton");
const loadingText = document.querySelector("#loadingText");
const loadingCopy = document.querySelector("#loadingCopy");
const loadingStar = document.querySelector(".loading-star");
const progressBar = document.querySelector("#progressBar");
const resultPanel = document.querySelector("#resultPanel");
const titleInput = document.querySelector("#titleInput");
const tagsInput = document.querySelector("#tagsInput");
const chinesePrompt = document.querySelector("#chinesePrompt");
const englishPrompt = document.querySelector("#englishPrompt");
const savePrompt = document.querySelector("#savePrompt");
const savePromptLabel = savePrompt?.querySelector(".save-button-label");
const copyChinese = document.querySelector("#copyChinese");
const copyEnglish = document.querySelector("#copyEnglish");
const toast = document.querySelector("#toast");
const toastIcon = document.querySelector("#toastIcon");
const toastText = document.querySelector("#toastText");
const cardHotzones = document.querySelector("#cardHotzones");
const savedCards = document.querySelector("#savedCards");
const workspaceScroll = document.querySelector("#workspaceScroll");
const workspaceDropOverlay = document.querySelector("#workspaceDropOverlay");
const workspaceDropTitle = document.querySelector("#workspaceDropTitle");

const stages = [
  { max: 30, text: "正在识别画面主体" },
  { max: 60, text: "正在拆解风格与构图" },
  { max: 100, text: "正在生成完整 Prompt" }
];
const freezeAnalyzeLoading = Boolean(window.__WORKSTATION_CONFIG__?.freezeAnalyzeLoading);

let progressTimer = null;
let toastTimer = null;
let resultScrollTimer = null;
let loadingTextTimer = null;
let loadingStarSpinTimer = null;
let previewLayoutFrame = 0;
let analyzeMotionTimer = null;
let saveTimer = null;
let workspaceDragHideTimer = null;
let workspaceScrollTimer = null;
let copyButtonResetTimer = null;
let activeAnalyzeController = null;
let currentPreviewUrl = "";
let currentImageDataUrl = "";
let currentUploadFile = null;
let generatedResult = null;
let uploadState = "idle";
let workspaceDragState = "idle";
let activeAnalyzeRun = 0;
let savedIndex = 0;
let cardLayoutFrame = 0;
let landingFrameBindTimer = null;
let scanGridFrame = 0;
let scanGridDots = [];
let previewLayoutFollowFrame = 0;

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const analyzeRequestTimeout = 65000;
const analyzeEndpointPath = "/.netlify/functions/analyze-image";
const defaultAnalyzeApiBase = "https://shiqi-workstation.netlify.app";
const maxAnalyzeImageDimension = 1280;
const maxAnalyzeImageBytes = 900_000;
const maxAnalyzeAttempts = 3;
const dropHintFadeDuration = 260;
const previewImageFadeDuration = 520;
const previewToAnalyzeDelay = 60;
const dropZoneWidthTransitionDuration = 760;

function fitStage() {
  const entryScale = Math.min(window.innerWidth / 1440, window.innerHeight / 900);
  document.documentElement.style.setProperty("--stage-scale", entryScale.toString());
  scheduleCardLayout();
}

window.addEventListener("resize", fitStage);
window.addEventListener("resize", schedulePreviewImageLayout);
window.addEventListener("resize", () => {
  scanGridDots = [];
  resizeScanGrid();
});
fitStage();
renderCardHotzones();

attachLandingFrameStartHandler();
startButtonFallback?.addEventListener("click", enterWorkspace);

function enterWorkspace() {
  if (entryPage.classList.contains("is-exiting")) return;
  entryPage.classList.add("is-exiting");
  window.setTimeout(() => {
    entryPage.classList.remove("is-active", "is-exiting");
    workspacePage.classList.add("is-active");
    document.documentElement.classList.add("is-workspace");
    document.body.classList.add("is-workspace");
    if (landingFrame) landingFrame.setAttribute("tabindex", "-1");
    scheduleCardLayout();
  }, 260);
}

const menuButtons = [...document.querySelectorAll(".menu-hit")];

menuButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveWorkspaceMenu(button);
  });
});

uploadButton.addEventListener("click", () => {
  openModal();
});
closeModal.addEventListener("click", closeUploadModal);
previewImage?.addEventListener("load", schedulePreviewImageLayout);
retryUploadButton?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  resetUploadState();
  setUploadState("filePickerOpen");
  fileInput.click();
});

function openModal() {
  clearWorkspaceDragState();
  modalLayer.setAttribute("aria-hidden", "false");
  resetUploadState();
  setUploadState("uploadModalEmpty");
}

function setActiveWorkspaceMenu(activeButton) {
  if (!activeButton) return;
  menuButtons.forEach((button) => {
    button.classList.toggle("is-selected", button === activeButton);
  });

  const title = activeButton.dataset.title || activeButton.textContent?.trim() || "全部提示词";
  const label = activeButton.dataset.label || activeButton.textContent?.trim() || title;
  if (workspaceTitleText) workspaceTitleText.textContent = title;
  if (workspaceMain) workspaceMain.setAttribute("aria-label", label);
}

function closeUploadModal() {
  activeAnalyzeRun += 1;
  abortActiveAnalyzeRequest();
  clearWorkspaceDragState();
  setUploadState("idle");
  modalLayer.setAttribute("aria-hidden", "true");
  modalLayer.className = "modal-layer";
  stopProgress();
  if (analyzeMotionTimer) window.clearTimeout(analyzeMotionTimer);
  analyzeMotionTimer = null;
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = null;
  if (resultScrollTimer) window.clearTimeout(resultScrollTimer);
  resultScrollTimer = null;
  resultPanel.classList.remove("is-scrolling");
  resetUploadState();
}

function setUploadState(state) {
  uploadState = state;
  const classMap = {
    idle: "",
    uploadModalEmpty: "is-open is-idle",
    modalDragReady: "is-open is-idle is-drag-ready",
    filePickerOpen: "is-open is-idle is-file-picker-open",
    previewing: "is-open is-idle is-previewing",
    analyzing: "is-open is-loading",
    result: "is-open is-complete",
    error: "is-open is-error"
  };

  modalLayer.className = `modal-layer ${classMap[state] || ""}`.trim();
  modalLayer.dataset.uploadState = state;
  schedulePreviewImageLayout();
  window.setTimeout(schedulePreviewImageLayout, 280);
  if (state === "analyzing") {
    followPreviewImageLayout(dropZoneWidthTransitionDuration + 120);
    startScanGrid();
  } else {
    stopFollowingPreviewImageLayout();
    stopScanGrid();
  }
}

function resetUploadState() {
  stopProgress();
  if (analyzeMotionTimer) window.clearTimeout(analyzeMotionTimer);
  analyzeMotionTimer = null;
  if (loadingTextTimer) window.clearTimeout(loadingTextTimer);
  loadingTextTimer = null;
  if (loadingStarSpinTimer) window.clearTimeout(loadingStarSpinTimer);
  loadingStarSpinTimer = null;
  generatedResult = null;
  currentUploadFile = null;
  currentImageDataUrl = "";
  savePrompt.disabled = false;
  setSaveButtonLabel("保存");
  resetCopyButtons();
  chinesePrompt.style.height = "";
  englishPrompt.style.top = "";
  englishPrompt.style.height = "";
  document.documentElement.style.removeProperty("--english-field-top");
  progressBar.style.width = "0%";
  loadingCopy?.classList.remove("is-changing");
  if (loadingCopy) {
    loadingCopy.style.width = "";
    loadingCopy.style.transition = "";
  }
  if (loadingStar) {
    loadingStar.classList.remove("is-spinning");
    loadingStar.style.left = "";
    loadingStar.style.transition = "";
  }
  setLoadingStage(stages[0].text, true);
  dropZone.classList.remove("has-image", "has-error", "is-dragover", "is-hint-exiting", "is-preview-visible");
  resultPanel.classList.remove("is-scrolling");
  clearPreviewResources();
  fileInput.value = "";
}

function clearPreviewImageLayout() {
  if (!previewImage) return;
  stopFollowingPreviewImageLayout();
  previewImage.style.width = "";
  previewImage.style.height = "";
}

function revokePreviewUrl() {
  if (!currentPreviewUrl) return;
  URL.revokeObjectURL(currentPreviewUrl);
  currentPreviewUrl = "";
}

function clearPreviewResources() {
  clearPreviewImageLayout();
  previewImage?.removeAttribute("src");
  revokePreviewUrl();
}

function releaseAnalyzeArtifacts() {
  currentUploadFile = null;
  currentImageDataUrl = "";
  clearPreviewResources();
}

function schedulePreviewImageLayout() {
  if (previewLayoutFrame) window.cancelAnimationFrame(previewLayoutFrame);
  previewLayoutFrame = window.requestAnimationFrame(() => {
    previewLayoutFrame = 0;
    syncPreviewImageLayout();
  });
}

function syncPreviewImageLayout() {
  if (!previewImage || !dropZone || !dropZone.classList.contains("has-image")) return;
  const { naturalWidth, naturalHeight } = previewImage;
  const { width: containerWidth, height: containerHeight } = dropZone.getBoundingClientRect();
  if (!naturalWidth || !naturalHeight || !containerWidth || !containerHeight) return;

  const scale = Math.min(containerWidth / naturalWidth, containerHeight / naturalHeight);
  previewImage.style.width = `${naturalWidth * scale}px`;
  previewImage.style.height = `${naturalHeight * scale}px`;
}

function stopFollowingPreviewImageLayout() {
  if (previewLayoutFollowFrame) window.cancelAnimationFrame(previewLayoutFollowFrame);
  previewLayoutFollowFrame = 0;
}

function followPreviewImageLayout(duration) {
  stopFollowingPreviewImageLayout();
  const endAt = performance.now() + duration;

  const tick = () => {
    syncPreviewImageLayout();
    if (uploadState !== "analyzing" || performance.now() >= endAt) {
      previewLayoutFollowFrame = 0;
      return;
    }
    previewLayoutFollowFrame = window.requestAnimationFrame(tick);
  };

  previewLayoutFollowFrame = window.requestAnimationFrame(tick);
}

function waitForPreviewImageReady() {
  if (!previewImage) return Promise.resolve();
  if (previewImage.complete && previewImage.naturalWidth) {
    return previewImage.decode?.().catch(() => {}) || Promise.resolve();
  }

  return new Promise((resolve) => {
    const done = () => {
      previewImage.removeEventListener("load", done);
      previewImage.removeEventListener("error", done);
      resolve();
    };
    previewImage.addEventListener("load", done, { once: true });
    previewImage.addEventListener("error", done, { once: true });
  });
}

async function fadeOutDropHint() {
  dropZone.classList.add("is-hint-exiting");
  await wait(dropHintFadeDuration);
}

function revealPreviewImage() {
  dropZone.classList.remove("is-preview-visible");
  dropZone.classList.add("has-image");
  dropZone.classList.remove("has-error");
  syncPreviewImageLayout();
  previewImage.getBoundingClientRect();

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      dropZone.classList.add("is-preview-visible");
      resolve();
    });
  });
}

function startScanGrid() {
  if (!scanOverlayGrid || scanGridFrame) return;
  resizeScanGrid();
  scanGridFrame = window.requestAnimationFrame(drawScanGrid);
}

function stopScanGrid() {
  if (scanGridFrame) window.cancelAnimationFrame(scanGridFrame);
  scanGridFrame = 0;
  const context = scanOverlayGrid?.getContext("2d");
  if (context) context.clearRect(0, 0, scanOverlayGrid.width, scanOverlayGrid.height);
}

function resizeScanGrid() {
  if (!scanOverlayGrid) return;
  const rect = scanOverlayGrid.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * pixelRatio));
  const height = Math.max(1, Math.round(rect.height * pixelRatio));
  if (scanOverlayGrid.width === width && scanOverlayGrid.height === height && scanGridDots.length) return;

  scanOverlayGrid.width = width;
  scanOverlayGrid.height = height;
  scanGridDots = createScanGridDots(width, height, pixelRatio);
}

function createScanGridDots(width, height, pixelRatio) {
  const spacing = 23 * pixelRatio;
  const startTime = performance.now();
  const dots = [];
  for (let y = spacing * 0.5; y < height; y += spacing) {
    for (let x = spacing * 0.5; x < width; x += spacing) {
      dots.push({
        x: x + (Math.random() - 0.5) * spacing * 0.28,
        y: y + (Math.random() - 0.5) * spacing * 0.28,
        baseAlpha: 0.16 + Math.random() * 0.22,
        baseRadius: (0.55 + Math.random() * 0.35) * pixelRatio,
        isWarm: Math.random() < 0.28,
        currentPulse: 0,
        pulseFrom: 0,
        pulseTo: 0,
        pulseStartedAt: 0,
        pulseDuration: 750,
        nextPulseAt: startTime + Math.random() * 1800
      });
    }
  }
  return dots;
}

function updateScanGridDots(time) {
  scanGridDots.forEach((dot) => {
    getScanDotPulse(dot, time);
    if (time < dot.nextPulseAt) return;

    const shouldReturn = dot.currentPulse > 0.16 || dot.pulseTo > 0.16;
    dot.pulseFrom = dot.currentPulse;
    dot.pulseTo = shouldReturn ? 0 : 0.48 + Math.random() * 0.52;
    dot.pulseStartedAt = time;
    dot.pulseDuration = 540 + Math.random() * 450;
    dot.nextPulseAt = time + dot.pulseDuration + (shouldReturn ? 330 + Math.random() * 1170 : 180 + Math.random() * 540);
  });
}

function easeScanPulse(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - ((-2 * value + 2) ** 3) / 2;
}

function getScanDotPulse(dot, time) {
  const progress = Math.min(1, Math.max(0, (time - dot.pulseStartedAt) / dot.pulseDuration));
  dot.currentPulse = dot.pulseFrom + (dot.pulseTo - dot.pulseFrom) * easeScanPulse(progress);
  return dot.currentPulse;
}

function drawScanGrid(time = 0) {
  if (!scanOverlayGrid || uploadState !== "analyzing") {
    scanGridFrame = 0;
    return;
  }

  resizeScanGrid();
  const context = scanOverlayGrid.getContext("2d");
  if (!context) return;

  const seconds = time / 1000;
  updateScanGridDots(time);
  context.clearRect(0, 0, scanOverlayGrid.width, scanOverlayGrid.height);
  context.globalCompositeOperation = "lighter";

  scanGridDots.forEach((dot) => {
    const idleFlicker = (Math.sin(seconds * 0.8 + dot.x * 0.011 + dot.y * 0.007) + 1) * 0.035;
    const activePulse = Math.min(1, getScanDotPulse(dot, time) + idleFlicker);
    const alphaCurve = 1 - ((1 - activePulse) ** 2.6);
    const radiusCurve = activePulse * activePulse * (3 - 2 * activePulse);
    const alpha = Math.min(1, dot.baseAlpha + alphaCurve * (1 - dot.baseAlpha));
    const radius = dot.baseRadius * (1 + radiusCurve);

    context.beginPath();
    context.fillStyle = `rgba(255, ${dot.isWarm ? 245 : 255}, ${dot.isWarm ? 220 : 255}, ${alpha})`;
    context.arc(dot.x, dot.y, radius, 0, Math.PI * 2);
    context.fill();
  });

  scanGridFrame = window.requestAnimationFrame(drawScanGrid);
}

dropZone.addEventListener("click", (event) => {
  if (
    uploadState === "analyzing" ||
    uploadState === "result"
  ) {
    event.preventDefault();
    return;
  }
  if (dropZone.classList.contains("has-error")) resetUploadState();
  setUploadState("filePickerOpen");
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (!isModalOpen() || uploadState === "analyzing") return;
  dropZone.classList.add("is-dragover");
  setUploadState("modalDragReady");
});

dropZone.addEventListener("dragleave", (event) => {
  if (dropZone.contains(event.relatedTarget)) return;
  dropZone.classList.remove("is-dragover");
  if (uploadState === "modalDragReady") setUploadState("uploadModalEmpty");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  event.stopPropagation();
  dropZone.classList.remove("is-dragover");
  const file = getFirstSupportedImage(event.dataTransfer?.files);
  if (file) {
    handleFile(file);
    return;
  }
  showToast("仅支持 JPG、PNG、WEBP 格式图片");
  if (uploadState === "modalDragReady") setUploadState("uploadModalEmpty");
});

fileInput.addEventListener("change", () => {
  const file = getFirstSupportedImage(fileInput.files);
  if (file) {
    handleFile(file);
    return;
  }
  if (fileInput.files?.length) showToast("仅支持 JPG、PNG、WEBP 格式图片");
  setUploadState("uploadModalEmpty");
});

document.addEventListener("dragenter", (event) => {
  if (!hasDraggedFiles(event.dataTransfer)) return;
  event.preventDefault();
  if (!isWorkspaceActive() || isModalOpen()) return;
  setWorkspaceDragState(isPointInsideWorkspace(event.clientX, event.clientY) ? "release" : "drag");
  keepWorkspaceDragOverlayAlive();
});

document.addEventListener("dragover", (event) => {
  if (!hasDraggedFiles(event.dataTransfer)) return;
  event.preventDefault();
  if (!isWorkspaceActive() || isModalOpen()) return;
  setWorkspaceDragState(isPointInsideWorkspace(event.clientX, event.clientY) ? "release" : "drag");
  keepWorkspaceDragOverlayAlive();
});

document.addEventListener("dragleave", (event) => {
  if (!hasDraggedFiles(event.dataTransfer)) return;
  if (
    event.clientX <= 0 ||
    event.clientY <= 0 ||
    event.clientX >= window.innerWidth ||
    event.clientY >= window.innerHeight
  ) {
    clearWorkspaceDragState();
  }
});

document.addEventListener("drop", (event) => {
  if (!hasDraggedFiles(event.dataTransfer)) return;
  event.preventDefault();
  clearWorkspaceDragState();
  if (isModalOpen()) return;
  if (!isWorkspaceActive() || !isPointInsideWorkspace(event.clientX, event.clientY)) return;
  const file = getFirstSupportedImage(event.dataTransfer.files);
  if (file) {
    openModal();
    handleFile(file);
    return;
  }
  showToast("仅支持 JPG、PNG、WEBP 格式图片");
});

document.addEventListener("paste", (event) => {
  if (!isModalOpen() || uploadState === "analyzing") return;
  const file = getFirstSupportedImage(event.clipboardData?.files);
  if (!file) return;
  event.preventDefault();
  handleFile(file);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && isModalOpen()) closeUploadModal();
});

async function handleFile(file) {
  if (!isSupportedImage(file)) {
    showToast("仅支持 JPG、PNG、WEBP 格式图片");
    setUploadState(isModalOpen() ? "uploadModalEmpty" : "idle");
    return;
  }

  const runId = activeAnalyzeRun + 1;
  activeAnalyzeRun = runId;
  abortActiveAnalyzeRequest();
  currentUploadFile = file;
  generatedResult = null;
  revokePreviewUrl();
  currentPreviewUrl = URL.createObjectURL(file);
  modalLayer.setAttribute("aria-hidden", "false");
  setUploadState("previewing");
  previewImage.src = currentPreviewUrl;
  await waitForPreviewImageReady();
  if (activeAnalyzeRun !== runId || uploadState === "idle") return;
  await fadeOutDropHint();
  if (activeAnalyzeRun !== runId || uploadState === "idle") return;
  await revealPreviewImage();
  setLoadingStage(stages[0].text, true);
  progressBar.style.width = "0%";
  await wait(previewImageFadeDuration);
  if (activeAnalyzeRun !== runId || uploadState === "idle") return;
  await wait(previewToAnalyzeDelay);
  if (activeAnalyzeRun !== runId || uploadState === "idle") return;
  setUploadState("analyzing");
  startProgress();
  if (freezeAnalyzeLoading) return;

  try {
    currentImageDataUrl = await fileToDataUrl(file).catch(() => "");
    const result = await analyzeImage(file);
    if (activeAnalyzeRun !== runId || uploadState === "idle") return;
    finishProgress();
    await wait(260);
    if (activeAnalyzeRun !== runId || uploadState === "idle") return;
    generatedResult = result;
    showResult(result);
  } catch {
    if (activeAnalyzeRun !== runId || uploadState === "idle") return;
    showError();
  }
}

function isModalOpen() {
  return modalLayer.classList.contains("is-open");
}

function isWorkspaceActive() {
  return workspacePage.classList.contains("is-active");
}

function hasDraggedFiles(dataTransfer) {
  return Array.from(dataTransfer?.types || []).includes("Files");
}

function isSupportedImage(file) {
  return Boolean(file && supportedImageTypes.has(file.type));
}

function isPointInsideWorkspace(clientX, clientY) {
  if (!workspaceMain) return false;
  const bounds = workspaceMain.getBoundingClientRect();
  return clientX >= bounds.left && clientX <= bounds.right && clientY >= bounds.top && clientY <= bounds.bottom;
}

function setWorkspaceDragState(state) {
  if (!workspaceDropOverlay || workspaceDragState === state) return;
  workspaceDragState = state;
  const visible = state === "drag" || state === "release";
  workspaceDropOverlay.className = `workspace-drop-overlay${visible ? " is-visible" : ""}${state === "release" ? " is-release" : ""}`;
  workspaceDropOverlay.setAttribute("aria-hidden", visible ? "false" : "true");
  if (workspaceDropTitle) {
    workspaceDropTitle.textContent = state === "release" ? "松手以分析图片" : "拖拽图片到此处";
  }
}

function keepWorkspaceDragOverlayAlive() {
  if (workspaceDragHideTimer) window.clearTimeout(workspaceDragHideTimer);
  workspaceDragHideTimer = window.setTimeout(() => {
    clearWorkspaceDragState();
  }, 120);
}

function clearWorkspaceDragState() {
  if (workspaceDragHideTimer) window.clearTimeout(workspaceDragHideTimer);
  workspaceDragHideTimer = null;
  setWorkspaceDragState("idle");
}

function getFirstSupportedImage(fileList) {
  return [...(fileList || [])].find(isSupportedImage) || null;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result || ""));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function startProgress() {
  stopProgress();
  syncLoadingCopyWidth(true);
  window.requestAnimationFrame(() => syncLoadingCopyWidth(true));
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
    syncLoadingCopyWidth(true);
    return;
  }

  triggerLoadingStarSpin();
  syncLoadingCopyWidth(true);
  loadingCopy.classList.add("is-changing");
  loadingTextTimer = window.setTimeout(() => {
    loadingText.textContent = text;
    syncLoadingCopyWidth();
    loadingCopy.classList.remove("is-changing");
    loadingTextTimer = null;
  }, 120);
}

function syncLoadingCopyWidth(immediate = false) {
  if (!loadingCopy || !loadingText) return;
  const textWidth = Math.ceil(loadingText.scrollWidth || loadingText.getBoundingClientRect().width);
  if (!textWidth) return;
  const nextWidth = `${textWidth}px`;
  const nextStarLeft = `${Math.max(0, textWidth - 8)}px`;

  if (!immediate) {
    loadingCopy.style.width = nextWidth;
    if (loadingStar) loadingStar.style.left = nextStarLeft;
    return;
  }

  const previousTransition = loadingCopy.style.transition;
  const previousStarTransition = loadingStar?.style.transition || "";
  loadingCopy.style.transition = "none";
  loadingCopy.style.width = nextWidth;
  if (loadingStar) {
    loadingStar.style.transition = "none";
    loadingStar.style.left = nextStarLeft;
  }
  loadingCopy.getBoundingClientRect();
  loadingCopy.style.transition = previousTransition;
  if (loadingStar) loadingStar.style.transition = previousStarTransition;
}

function triggerLoadingStarSpin() {
  if (!loadingStar) return;
  loadingStar.classList.remove("is-spinning");
  void loadingStar.offsetWidth;
  loadingStar.classList.add("is-spinning");
  if (loadingStarSpinTimer) window.clearTimeout(loadingStarSpinTimer);
  loadingStarSpinTimer = window.setTimeout(() => {
    loadingStar.classList.remove("is-spinning");
    loadingStarSpinTimer = null;
  }, 420);
}

function showResult(result) {
  setUploadState("result");
  titleInput.value = result.title || "静谧之中听见野性";
  tagsInput.value = (result.tags || []).slice(0, 3).join("；") || "野性静音；可爱拟人；高端耳机";
  chinesePrompt.value = result.chinesePrompt || chinesePrompt.value;
  englishPrompt.value = result.englishPrompt || englishPrompt.value;
  window.requestAnimationFrame(fitResultPanelContent);
  resultPanel.scrollTop = 0;
  resultPanel.classList.remove("is-scrolling");
}

function fitResultPanelContent() {
  const minChineseHeight = 124;
  const minEnglishHeight = 124;
  chinesePrompt.style.height = "auto";
  englishPrompt.style.height = "auto";
  chinesePrompt.style.height = `${Math.max(minChineseHeight, chinesePrompt.scrollHeight)}px`;
  englishPrompt.style.top = `${chinesePrompt.offsetTop + chinesePrompt.offsetHeight + 52}px`;
  englishPrompt.style.height = `${Math.max(minEnglishHeight, englishPrompt.scrollHeight)}px`;
  const englishLabelTop = englishPrompt.offsetTop - 28;
  document.documentElement.style.setProperty("--english-field-top", `${englishLabelTop}px`);
}

function showError() {
  stopProgress();
  setUploadState("error");
  modalLayer.setAttribute("aria-hidden", "false");
  dropZone.classList.remove("has-image", "is-preview-visible");
  dropZone.classList.add("has-error");
  releaseAnalyzeArtifacts();
  showToast("上传失败");
}

async function analyzeImage(file) {
  const endpoint = resolveAnalyzeEndpoint();
  if (!endpoint) throw new Error("missing analyze endpoint");
  return requestImageAnalysis(file, endpoint);
}

async function requestImageAnalysis(file, endpoint) {
  const payload = await createAnalyzePayload(file);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAnalyzeAttempts; attempt += 1) {
    const controller = new AbortController();
    activeAnalyzeController = controller;
    let didTimeout = false;
    const timeoutId = window.setTimeout(() => {
      didTimeout = true;
      controller.abort();
    }, analyzeRequestTimeout);

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        const error = new Error(`analyze request failed: ${response.status}${detail ? ` ${detail}` : ""}`);
        error.status = response.status;
        throw error;
      }

      const result = normalizeAnalyzeResult(await response.json());
      if (!result.chinesePrompt && !result.englishPrompt) {
        throw new Error("empty analyze result");
      }

      return result;
    } catch (error) {
      if (didTimeout) {
        error = Object.assign(new Error("timeout"), { status: 408 });
      }
      if (isAbortError(error)) throw error;
      lastError = error;
      if (attempt >= maxAnalyzeAttempts || !shouldRetryAnalyzeError(error)) {
        console.error("Analyze request failed", error);
        throw error;
      }
      await wait(320 * attempt);
    } finally {
      window.clearTimeout(timeoutId);
      if (activeAnalyzeController === controller) activeAnalyzeController = null;
    }
  }

  throw lastError || new Error("analyze request failed");
}

function resolveAnalyzeEndpoint() {
  const configured = readConfiguredAnalyzeEndpoint();
  if (configured) return configured;
  if (isLocalPreview()) return `${defaultAnalyzeApiBase}${analyzeEndpointPath}`;
  return analyzeEndpointPath;
}

function readConfiguredAnalyzeEndpoint() {
  const params = new URLSearchParams(window.location.search);
  const runtimeConfig = window.WORKSTATION_ANALYZE_API_URL || window.__WORKSTATION_CONFIG__?.analyzeApiUrl || "";
  const runtimeBase = window.WORKSTATION_ANALYZE_API_BASE || window.__WORKSTATION_CONFIG__?.analyzeApiBase || "";
  const direct =
    params.get("analyzeApi") ||
    params.get("analyzeApiUrl") ||
    runtimeConfig ||
    safeStorageGet("workstationAnalyzeApiUrl");
  if (direct) return normalizeAnalyzeEndpoint(direct, false);

  const base =
    params.get("analyzeApiBase") ||
    runtimeBase ||
    safeStorageGet("workstationAnalyzeApiBase");
  if (base) return normalizeAnalyzeEndpoint(base, true);
  return "";
}

function normalizeAnalyzeEndpoint(value, appendPath) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    if (!appendPath) return raw;
    return `${raw.replace(/\/+$/, "")}${analyzeEndpointPath}`;
  }

  return appendPath ? "" : raw;
}

function isLocalPreview() {
  return (
    window.location.protocol === "file:" ||
    ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname)
  );
}

function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function normalizeAnalyzeResult(result) {
  const tags = Array.isArray(result?.tags)
    ? result.tags
    : String(result?.tags || "")
        .split(/[;；,，]/)
        .map((tag) => tag.trim())
        .filter(Boolean);

  return {
    title: String(result?.title || "").trim() || "未命名 Prompt",
    tags: tags.slice(0, 3).map((tag) => String(tag).trim()).filter(Boolean),
    chinesePrompt: String(result?.chinesePrompt || "").trim(),
    englishPrompt: String(result?.englishPrompt || "").trim()
  };
}

async function createAnalyzePayload(file) {
  const originalDataUrl = currentImageDataUrl || (await fileToDataUrl(file));
  const processedDataUrl = await optimizeAnalyzeImage(file, originalDataUrl).catch(() => originalDataUrl);
  const imageBase64 = String(processedDataUrl || "").split(",")[1];
  const mimeType = getMimeTypeFromDataUrl(processedDataUrl) || file.type || "image/jpeg";
  if (!imageBase64) throw new Error("missing image payload");
  return { imageBase64, mimeType };
}

async function optimizeAnalyzeImage(file, dataUrl) {
  const source = dataUrl || (await fileToDataUrl(file));
  const image = await loadImageFromDataUrl(source);
  try {
    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    const { width, height } = getFittedImageSize(naturalWidth, naturalHeight);
    const keepOriginal = width === naturalWidth && height === naturalHeight && file.size <= maxAnalyzeImageBytes;

    if (keepOriginal) return source;

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return source;

    const outputMimeType = "image/jpeg";
    let fallback = source;
    let targetWidth = width;
    let targetHeight = height;

    for (let scaleAttempt = 0; scaleAttempt < 3; scaleAttempt += 1) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, targetWidth, targetHeight);
      context.drawImage(image, 0, 0, targetWidth, targetHeight);

      for (const quality of [0.82, 0.74, 0.66, 0.58]) {
        const optimized = canvas.toDataURL(outputMimeType, quality);
        fallback = optimized;
        if (getDataUrlByteSize(optimized) <= maxAnalyzeImageBytes) {
          canvas.width = 0;
          canvas.height = 0;
          return optimized;
        }
      }

      targetWidth = Math.max(1, Math.round(targetWidth * 0.85));
      targetHeight = Math.max(1, Math.round(targetHeight * 0.85));
    }

    canvas.width = 0;
    canvas.height = 0;
    return fallback;
  } finally {
    image.removeAttribute("src");
  }
}

function getDataUrlByteSize(dataUrl) {
  const payload = String(dataUrl || "").split(",")[1] || "";
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
    };
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = (error) => {
      cleanup();
      reject(error);
    };
    image.src = dataUrl;
  });
}

function getFittedImageSize(width, height) {
  const longEdge = Math.max(width, height);
  if (!longEdge || longEdge <= maxAnalyzeImageDimension) {
    return { width, height };
  }

  const scale = maxAnalyzeImageDimension / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function getMimeTypeFromDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,/i);
  return match ? match[1] : "";
}

function shouldRetryAnalyzeError(error) {
  const message = String(error?.message || "");
  const status = Number(error?.status || 0);
  if (status === 400 || status === 401 || status === 403) return false;
  return (
    status === 429 ||
    status >= 500 ||
    message.includes("timeout") ||
    message.includes("Failed to fetch") ||
    message.includes("NetworkError") ||
    message.includes("empty analyze result")
  );
}

function abortActiveAnalyzeRequest() {
  if (!activeAnalyzeController) return;
  activeAnalyzeController.abort("cancelled");
  activeAnalyzeController = null;
}

function isAbortError(error) {
  return error?.name === "AbortError" || String(error?.message || "").includes("aborted");
}

copyChinese.addEventListener("click", () => copyText(chinesePrompt.value, "复制成功", copyChinese));
copyEnglish.addEventListener("click", () => copyText(englishPrompt.value, "复制成功", copyEnglish));
chinesePrompt.addEventListener("input", fitResultPanelContent);
englishPrompt.addEventListener("input", fitResultPanelContent);
resultPanel.addEventListener("scroll", showResultScrollbar);
workspaceScroll?.addEventListener("wheel", showWorkspaceScrollbar, { passive: true });

savePrompt.addEventListener("click", async () => {
  if (savePrompt.disabled) return;
  const result = {
    title: titleInput.value.trim() || "未命名 Prompt",
    tags: tagsInput.value
      .split(/[;；,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 3),
    chinesePrompt: chinesePrompt.value,
    englishPrompt: englishPrompt.value,
    image: currentImageDataUrl || currentPreviewUrl,
    createdAt: new Date().toISOString()
  };
  savePrompt.disabled = true;
  setSaveButtonLabel("保存中");
  try {
    await savePromptResult(result);
    addSavedCard(result);
    showToast("保存成功");
    closeUploadModal();
  } catch {
    savePrompt.disabled = false;
    setSaveButtonLabel("保存");
    showToast("保持失败");
  }
});

async function savePromptResult(result) {
  await wait(180);
  if (!result.chinesePrompt && !result.englishPrompt) throw new Error("empty prompt");
  return result;
}

async function copyText(text, message, button) {
  try {
    await writeClipboardText(text);
    setCopyButtonState(button, "assets/figma/copy-inline-done.svg", "#ff7300");
    showToast(message);
  } catch {
    showToast("复制失败");
  }
}

async function writeClipboardText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy path for file:// previews and restricted webviews.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("copy failed");
}

function setSaveButtonLabel(text) {
  if (savePromptLabel) {
    savePromptLabel.textContent = text;
    return;
  }
  if (savePrompt) savePrompt.textContent = text;
}

function setCopyButtonState(button, iconPath, color) {
  if (!button) return;
  resetCopyButtons();
  const icon = button.querySelector(".copy-button-icon");
  const label = button.querySelector("span");
  if (icon) icon.src = iconPath;
  if (label && color) label.style.color = color;
  if (copyButtonResetTimer) window.clearTimeout(copyButtonResetTimer);
  copyButtonResetTimer = window.setTimeout(() => {
    if (icon) icon.src = "assets/figma/copy-inline.svg";
    if (label) label.style.color = "";
    copyButtonResetTimer = null;
  }, 1400);
}

function resetCopyButtons() {
  if (copyButtonResetTimer) window.clearTimeout(copyButtonResetTimer);
  copyButtonResetTimer = null;
  [copyChinese, copyEnglish].forEach((button) => {
    if (!button) return;
    const icon = button.querySelector(".copy-button-icon");
    const label = button.querySelector("span");
    if (icon) icon.src = "assets/figma/copy-inline.svg";
    if (label) label.style.color = "";
  });
}

function addSavedCard(result) {
  savedIndex += 1;
  const card = createPromptCardElement(
    {
      id: `saved-${savedIndex}`,
      image: result.image,
      imageWidth: 360,
      imageHeight: 582,
      title: result.title,
      tags: result.tags,
      prompt: result.chinesePrompt
    },
    0
  );
  card.classList.add("is-new");
  card.style.zIndex = String(100 + savedIndex);
  cardHotzones.prepend(card);
  window.requestAnimationFrame(scheduleCardLayout);
}

function renderCardHotzones() {
  cardHotzones.innerHTML = "";
  promptCards.forEach((card, index) => {
    cardHotzones.appendChild(createPromptCardElement(card, index));
  });
  scheduleCardLayout();
}

function createPromptCardElement(card, index) {
  const slot = cardSlots[index] || cardSlots[0] || { width: 282, height: 376 };
  const item = document.createElement("article");
  item.className = "card-hotzone";
  item.tabIndex = 0;
  const imageRatio = card.imageWidth && card.imageHeight ? card.imageHeight / card.imageWidth : slot.height / slot.width;
  item.dataset.ratio = String(imageRatio);
  item.style.setProperty("--enter-order", String(index));
  item.setAttribute("role", "button");
  item.setAttribute("aria-label", `复制 ${card.title} 的中文 Prompt`);
  const safeTitle = escapeHtml(card.title || "");
  const safePrompt = escapeHtml(card.prompt || "");
  const safeImage = escapeHtml(card.image || "");
  const safeTags = (card.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("");

  item.innerHTML = `
    <img class="card-base" src="${safeImage}" alt="${safeTitle}" />
    <div class="card-info">
      <div class="card-content">
        <h2>${safeTitle}</h2>
        <div class="card-tags">${safeTags}</div>
        <p>${safePrompt}</p>
      </div>
    </div>
  `;

  item.addEventListener("click", () => {
    copyText(card.prompt, "复制成功");
  });
  item.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    copyText(card.prompt, "复制成功");
  });

  return item;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };
    return entities[char];
  });
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
    const naturalHeight = Math.round(columnWidth * ratio);
    const height = Math.min(480, naturalHeight);
    const promptLines = Math.max(1, Math.floor((height - 140) / 15));

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
  const type = inferToastType(message);
  if (toastText) {
    toastText.textContent = message;
  } else {
    toast.textContent = message;
  }
  toast.classList.remove("is-success", "is-warning");
  toast.classList.add(type === "success" ? "is-success" : "is-warning");
  toastIcon?.setAttribute("data-state", type);
  toast.classList.add("is-show");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-show");
  }, 1800);
}

function inferToastType(message) {
  const content = String(message || "");
  if (content.includes("成功")) return "success";
  return "error";
}

function showWorkspaceScrollbar() {
  if (!workspaceScroll) return;
  workspaceScroll.classList.add("is-scrolling");
  if (workspaceScrollTimer) window.clearTimeout(workspaceScrollTimer);
  workspaceScrollTimer = window.setTimeout(() => {
    workspaceScroll?.classList.remove("is-scrolling");
    workspaceScrollTimer = null;
  }, 760);
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

function attachLandingFrameStartHandler() {
  if (!landingFrame) return;

  const syncLandingLogo = (landingDocument) => {
    if (!landingDocument) return;
    if (!landingDocument.getElementById("workstation-landing-logo-override")) {
      const style = landingDocument.createElement("style");
      style.id = "workstation-landing-logo-override";
      style.textContent = `
        img[src$="/home-assets/logo.png"],
        img[src$="./home-assets/logo.png"],
        img[src*="home-assets/logo.png"] {
          position: fixed !important;
          left: 22px !important;
          top: 22px !important;
          width: 188.75px !important;
          height: 28px !important;
          max-width: none !important;
          z-index: 50 !important;
          pointer-events: none !important;
          user-select: none !important;
        }
      `;
      landingDocument.head?.appendChild(style);
    }
  };

  const bindStartButton = () => {
    const landingDocument = landingFrame.contentDocument;
    if (!landingDocument) return false;
    syncLandingLogo(landingDocument);

    const startImage = landingDocument.querySelector('img[alt="开始使用"]');
    const startButton = startImage?.closest("button");
    if (!startButton) return false;
    if (startButton.dataset.workstationBound === "true") return true;

    startButton.dataset.workstationBound = "true";
    startButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      enterWorkspace();
    });
    return true;
  };

  const stopWatching = () => {
    if (landingFrameBindTimer) window.clearInterval(landingFrameBindTimer);
    landingFrameBindTimer = null;
  };

  const startWatching = () => {
    stopWatching();
    watchUntilBound();
    if (!landingFrameBindTimer) {
      landingFrameBindTimer = window.setInterval(() => {
        watchUntilBound();
      }, 200);
    }
  };

  const watchUntilBound = () => {
    if (bindStartButton()) {
      stopWatching();
    }
  };

  landingFrame.addEventListener("load", () => {
    startWatching();
  });

  startWatching();
}
