const { cardSlots, promptCards } = window;

const entryPage = document.querySelector("#entryPage");
const workspacePage = document.querySelector("#workspacePage");
const startButton = document.querySelector("#startButton");
const uploadButton = document.querySelector("#uploadButton");
const workspaceMain = document.querySelector(".workspace-main");
const workspaceTitleText = document.querySelector(".workspace-title span");
const modalLayer = document.querySelector("#modalLayer");
const closeModal = document.querySelector("#closeModal");
const dropZone = document.querySelector("#dropZone");
const fileInput = document.querySelector("#fileInput");
const previewImage = document.querySelector("#previewImage");
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
let stopEntryShiqEffect = null;

const supportedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const analyzeMotionDuration = 280;
const minimumAnalyzeDuration = 1420;
const analyzeRequestTimeout = 45000;
const analyzeEndpointPath = "/.netlify/functions/analyze-image";
const defaultAnalyzeApiBase = "https://shiqi-workstation.netlify.app";
const maxAnalyzeImageDimension = 1600;
const maxAnalyzeAttempts = 3;

function fitStage() {
  const entryScale = Math.min(window.innerWidth / 1440, window.innerHeight / 900);
  document.documentElement.style.setProperty("--stage-scale", entryScale.toString());
  scheduleCardLayout();
}

window.addEventListener("resize", fitStage);
fitStage();
renderCardHotzones();
stopEntryShiqEffect = initEntryShiqEffect();

startButton.addEventListener("click", () => {
  if (entryPage.classList.contains("is-exiting")) return;
  entryPage.classList.add("is-exiting");
  window.setTimeout(() => {
    entryPage.classList.remove("is-active", "is-exiting");
    workspacePage.classList.add("is-active");
    document.documentElement.classList.add("is-workspace");
    document.body.classList.add("is-workspace");
    stopEntryShiqEffect?.();
    stopEntryShiqEffect = null;
    scheduleCardLayout();
  }, 260);
});

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
    preAnalyzeMotion: "is-open is-preparing",
    analyzing: "is-open is-loading",
    result: "is-open is-complete",
    error: "is-open is-error"
  };

  modalLayer.className = `modal-layer ${classMap[state] || ""}`.trim();
  modalLayer.dataset.uploadState = state;
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
  dropZone.classList.remove("has-image", "has-error", "is-dragover");
  resultPanel.classList.remove("is-scrolling");
  previewImage.removeAttribute("src");
  if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
  currentPreviewUrl = "";
  fileInput.value = "";
}

dropZone.addEventListener("click", (event) => {
  if (uploadState === "analyzing" || uploadState === "preAnalyzeMotion" || uploadState === "result") {
    event.preventDefault();
    return;
  }
  if (dropZone.classList.contains("has-error")) resetUploadState();
  setUploadState("filePickerOpen");
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  if (!isModalOpen() || uploadState === "analyzing" || uploadState === "preAnalyzeMotion") return;
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
  if (!isModalOpen() || uploadState === "analyzing" || uploadState === "preAnalyzeMotion") return;
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
  if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
  currentPreviewUrl = URL.createObjectURL(file);
  previewImage.src = currentPreviewUrl;
  modalLayer.setAttribute("aria-hidden", "false");
  dropZone.classList.add("has-image");
  dropZone.classList.remove("has-error");
  setLoadingStage(stages[0].text, true);
  progressBar.style.width = "0%";
  setUploadState("preAnalyzeMotion");

  if (analyzeMotionTimer) window.clearTimeout(analyzeMotionTimer);
  analyzeMotionTimer = window.setTimeout(() => {
    if (activeAnalyzeRun !== runId || uploadState === "idle") return;
    setUploadState("analyzing");
    startProgress();
  }, analyzeMotionDuration);

  if (freezeAnalyzeLoading) return;

  const startedAt = performance.now();
  try {
    currentImageDataUrl = await fileToDataUrl(file).catch(() => "");
    const result = await analyzeImage(file);
    const elapsed = performance.now() - startedAt;
    await wait(Math.max(0, minimumAnalyzeDuration - elapsed));
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
  dropZone.classList.remove("has-image");
  dropZone.classList.add("has-error");
  showToast("上传失败，请重新上传");
}

async function analyzeImage(file) {
  const endpoint = resolveAnalyzeEndpoint();
  if (endpoint) {
    return requestImageAnalysis(file, endpoint);
  }
  await wait(880);
  return mockResult(file);
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
  const { width, height } = getFittedImageSize(image.naturalWidth || image.width, image.naturalHeight || image.height);
  const keepOriginal =
    width === (image.naturalWidth || image.width) &&
    height === (image.naturalHeight || image.height) &&
    file.size <= 1_500_000;

  if (keepOriginal) return source;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return source;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const outputMimeType = file.type === "image/png" ? "image/png" : "image/jpeg";
  return canvas.toDataURL(outputMimeType, 0.86);
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
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

copyChinese.addEventListener("click", () => copyText(chinesePrompt.value, "已复制中文 Prompt", copyChinese));
copyEnglish.addEventListener("click", () => copyText(englishPrompt.value, "已复制英文 Prompt", copyEnglish));
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
    showToast("保存失败，请重试");
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
    showToast("复制失败，请手动选择文本复制");
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
    copyText(card.prompt, "中文 Prompt 已复制");
  });
  item.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    copyText(card.prompt, "中文 Prompt 已复制");
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
  toast.textContent = message;
  toast.classList.add("is-show");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-show"), 1800);
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

function initEntryShiqEffect() {
  const root = document.querySelector("#entryShiqEffect");
  const beamCanvas = document.querySelector("#entryShiqBeam");
  const fogCanvas = document.querySelector("#entryShiqFog");
  const logo = root?.querySelector(".entry-shiq-logo");
  if (!root || !beamCanvas || !fogCanvas || !logo || !window.Path2D) return;

  const beamCtx = beamCanvas.getContext("2d", { alpha: true });
  const fogCtx = fogCanvas.getContext("2d", { alpha: true });
  if (!beamCtx || !fogCtx) return null;

  const logoBounds = { x: 0, y: 0, width: 0, height: 0 };
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d");
  if (!maskCtx) return null;
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
  let effectIsActive = true;
  let rafId = 0;

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
    if (!effectIsActive || document.documentElement.classList.contains("is-workspace")) return;
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
    rafId = window.requestAnimationFrame(renderShiq);
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
  rafId = window.requestAnimationFrame(renderShiq);

  return () => {
    effectIsActive = false;
    if (rafId) window.cancelAnimationFrame(rafId);
    window.removeEventListener("resize", resizeShiqCanvas);
    window.removeEventListener("load", resizeShiqCanvas);
    entryPage.removeEventListener("pointermove", updatePointer);
    beamCtx.clearRect(0, 0, beamCanvas.clientWidth, beamCanvas.clientHeight);
    fogCtx.clearRect(0, 0, fogCanvas.clientWidth, fogCanvas.clientHeight);
  };
}
