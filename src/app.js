import { cardSlots, promptCards } from "./cards.js";

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

const stages = [
  { max: 30, text: "正在识别画面主体" },
  { max: 60, text: "正在拆解风格与构图" },
  { max: 100, text: "正在生成完整 Prompt" }
];

let progressTimer = null;
let toastTimer = null;
let currentPreviewUrl = "";
let savedIndex = 0;

function fitStage() {
  const scale = Math.min(window.innerWidth / 1440, window.innerHeight / 900);
  document.documentElement.style.setProperty("--stage-scale", scale.toString());
}

window.addEventListener("resize", fitStage);
fitStage();
renderCardHotzones();

startButton.addEventListener("click", () => {
  entryPage.classList.remove("is-active");
  workspacePage.classList.add("is-active");
});

document.querySelectorAll(".menu-hit").forEach((button) => {
  button.addEventListener("click", (event) => event.preventDefault());
});

uploadButton.addEventListener("click", () => {
  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/*";
  picker.addEventListener(
    "change",
    () => {
      const file = picker.files?.[0];
      if (file) handleFile(file);
      picker.remove();
    },
    { once: true }
  );
  picker.click();
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
}

function resetUploadState() {
  stopProgress();
  progressBar.style.width = "0%";
  loadingText.textContent = stages[0].text;
  dropZone.classList.remove("has-image", "has-error", "is-dragover");
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
  loadingText.textContent = stage.text;
}

function showResult(result) {
  modalLayer.className = "modal-layer is-open is-complete";
  titleInput.value = result.title || "静谧之中听见野性";
  tagsInput.value = (result.tags || []).slice(0, 3).join("；") || "野性静音；可爱拟人；高端耳机";
  chinesePrompt.value = result.chinesePrompt || chinesePrompt.value;
  englishPrompt.value = result.englishPrompt || englishPrompt.value;
  resultPanel.scrollTop = 0;
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
  const payload = {
    imageBase64: await fileToBase64(file),
    mimeType: file.type
  };

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch("/.netlify/functions/analyze-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) throw new Error("Gemini request failed");
    return await response.json();
  } catch (error) {
    if (location.hostname === "localhost" || location.hostname === "127.0.0.1" || location.protocol === "file:") {
      await wait(1400);
      return mockResult();
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      resolve(value.split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function mockResult() {
  return {
    title: "静谧之中听见野性",
    tags: ["野性静音", "可爱拟人", "高端耳机"],
    chinesePrompt:
      "高端耳机产品广告海报，一只棕熊正面居中肖像，闭着眼睛，神情平静，佩戴黑色头戴式无线降噪耳机，背景为极简浅灰色，大面积留白，画面中央突出产品与动物结合的反差感，整体构图对称，视觉高级克制，商业广告摄影风格，真实毛发细节，柔和棚拍光线，海报版式简洁，带品牌标题与产品文案，突出静谧、沉浸、降噪、专业音质的感觉。",
    englishPrompt:
      "A high-end headphone product advertising poster featuring a calm centered portrait of a brown bear wearing black wireless noise-canceling headphones, minimalist light gray background, ample white space, symmetrical composition, refined commercial photography style, realistic fur detail, soft studio lighting, and a clean premium poster layout."
  };
}

copyChinese.addEventListener("click", () => copyText(chinesePrompt.value, "中文 Prompt 已复制"));
copyEnglish.addEventListener("click", () => copyText(englishPrompt.value, "英文 Prompt 已复制"));

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
    item.style.left = `${slot.left}px`;
    item.style.top = `${slot.top}px`;
    item.style.width = `${slot.width}px`;
    item.style.height = `${slot.height}px`;
    item.setAttribute("aria-label", card.title);

    item.innerHTML = `
      <div class="card-info">
        <h2>${card.title}</h2>
        <div class="card-tags">${card.tags.map((tag) => `<span>${tag}</span>`).join("")}</div>
        <p>${card.prompt}</p>
        <button class="card-copy" type="button" aria-label="复制中文 Prompt">
          <img class="copy-default" src="/assets/figma/copy-default.svg" alt="" />
          <img class="copy-done" src="/assets/figma/copy-done.svg" alt="" />
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
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-show");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-show"), 1800);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
