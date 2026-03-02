import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";
import "./editor.css";

const MODAL_ID = "ghost-image-editor-modal";
const DEFAULT_OUTPUT_MIME = "image/png";
const OUTPUT_FORMATS = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp"
};

const FEATURE_IMAGE_SELECTORS = "[data-test-feature-image-uploader], .gh-editor-feature-image, .gh-editor-settings, .settings-menu, .settings-menu-pane, .settings-menu-container, .gh-editor-settings-container, aside";
const CARD_SELECTORS = ".kg-card, .kg-image-card, figure, [data-kg-card], .koenig-card";
const CONTEXT_ROOT_SELECTORS = ".koenig-editor, .gh-koenig-editor, .kg-prose, .kg-card, main";
const UNSPLASH_DOMAIN = "images.unsplash.com";
const CARD_TOOLBAR_SELECTOR = "[data-kg-card-toolbar=\"image\"]";
const LOG_PREFIX = "[ghost-image-editor]";
const DEBUG_QUERY_PARAM = "ghostImageEditorDebug";
const DEBUG_STORAGE_KEY = "ghost-image-editor-debug";

function isDebugEnabled() {
  if (globalThis.__ghostImageEditorDebug === true) return true;

  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get(DEBUG_QUERY_PARAM) === "1") return true;
  } catch (_error) {
    // ignore URL parsing issues
  }

  try {
    return window.localStorage?.getItem(DEBUG_STORAGE_KEY) === "1";
  } catch (_error) {
    return false;
  }
}

function debugLog(message, details = null) {
  if (!isDebugEnabled()) return;
  if (details === null || details === undefined) {
    console.info(`${LOG_PREFIX} [debug] ${message}`);
    return;
  }

  console.info(`${LOG_PREFIX} [debug] ${message}`, details);
}

function describeInput(input) {
  if (!(input instanceof HTMLInputElement)) return "none";
  const name = input.getAttribute("name") || "";
  const accept = input.getAttribute("accept") || "";
  const cls = input.className || "";
  return `name=${name || "-"};accept=${accept || "-"};class=${cls || "-"}`;
}


const I18N_MESSAGES = {
  en: {
    applyToGhost: "Apply to Ghost",
    applyCrop: "Apply crop",
    imageEditor: "Image editor",
    selectedImage: "Selected image",
    width: "Width",
    height: "Height",
    auto: "Auto",
    format: "Format",
    cancel: "Cancel",
    outputFile: "Output file",
    originalDimensions: "Original dimensions",
    originalSize: "Original file size",
    newSize: "New file size",
    editedAttributionSuffix: "(image edited afterwards)",
    by: "Photo by"
  },
  de: {
    applyToGhost: "Auf Ghost anwenden",
    applyCrop: "Zuschnitt anwenden",
    imageEditor: "Bildeditor",
    selectedImage: "Ausgewähltes Bild",
    width: "Breite",
    height: "Höhe",
    auto: "Auto",
    format: "Format",
    cancel: "Abbrechen",
    outputFile: "Ausgabedatei",
    originalDimensions: "Originale Abmessungen",
    originalSize: "Originale Dateigröße",
    newSize: "Neue Dateigröße",
    editedAttributionSuffix: "(Bild nachträglich bearbeitet)",
    by: "Foto von"
  }
};

function getLocale() {
  const lang = (document.documentElement.lang || navigator.language || "en").toLowerCase();
  return lang.startsWith("de") ? "de" : "en";
}

function t(key, fallback) {
  const locale = getLocale();
  return I18N_MESSAGES[locale]?.[key] || I18N_MESSAGES.en[key] || fallback;
}

function removeModal() {
  document.getElementById(MODAL_ID)?.remove();
}

function inferExtensionFromMimeType(mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function createModal(imageSrc, options = {}) {
  removeModal();

  const {
    mode = "upload",
    fileName = "image",
    originalWidth = 0,
    originalHeight = 0,
    originalSize = 0
  } = options;
  const applyLabel = mode === "context" ? t("applyToGhost", "Apply to Ghost") : t("applyCrop", "Apply crop");

  const modal = document.createElement("div");
  modal.id = MODAL_ID;
  modal.className = "ghost-image-editor-modal";
  modal.innerHTML = `
    <div class="editor-box" role="dialog" aria-modal="true" aria-label="${t("imageEditor", "Image editor")}">
      <div class="editor-image-wrapper">
        <img class="editor-image" alt="${t("selectedImage", "Selected image")}" src="${imageSrc}">
      </div>
      <div class="editor-settings">
        <label>
          ${t("width", "Width")}
          <input type="number" min="1" step="1" data-setting="width" placeholder="${t("auto", "Auto")}">
        </label>
        <label>
          ${t("height", "Height")}
          <input type="number" min="1" step="1" data-setting="height" placeholder="${t("auto", "Auto")}">
        </label>
        <label>
          ${t("format", "Format")}
          <select data-setting="format">
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="webp">WEBP</option>
          </select>
        </label>
      </div>
      <div class="editor-controls">
        <button type="button" data-action="cancel">${t("cancel", "Cancel")}</button>
        <button type="button" data-action="apply">${applyLabel}</button>
      </div>
      <div class="editor-hints">
        <p class="editor-hint">${t("outputFile", "Output file")}: <strong>${fileName}</strong></p>
        <p class="editor-hint">${t("originalDimensions", "Original dimensions")}: <strong>${originalWidth}×${originalHeight}</strong></p>
        <p class="editor-hint">${t("originalSize", "Original file size")}: <strong>${formatBytes(originalSize)}</strong></p>
        <p class="editor-hint" data-hint-new-size hidden>${t("newSize", "New file size")}: <strong data-value>–</strong></p>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  removeDuplicateEditorSections(modal);

  return {
    modal,
    image: modal.querySelector(".editor-image"),
    cancelButton: modal.querySelector('[data-action="cancel"]'),
    applyButton: modal.querySelector('[data-action="apply"]'),
    widthInput: modal.querySelector('[data-setting="width"]'),
    heightInput: modal.querySelector('[data-setting="height"]'),
    formatSelect: modal.querySelector('[data-setting="format"]'),
    newSizeHint: modal.querySelector('[data-hint-new-size]'),
    newSizeValue: modal.querySelector('[data-hint-new-size] [data-value]')
  };
}

function removeDuplicateEditorSections(modal) {
  const settings = modal.querySelectorAll(".editor-settings");
  settings.forEach((section, index) => {
    if (index > 0) section.remove();
  });

  const hints = modal.querySelectorAll(".editor-hints");
  hints.forEach((hint, index) => {
    if (index > 0) hint.remove();
  });
}

function updateInputWithFile(input, file) {
  const transfer = new DataTransfer();
  transfer.items.add(file);

  input.dataset.editorApplying = "true";
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function isViableImageInput(input) {
  if (input.disabled) return false;
  const accept = (input.getAttribute("accept") || "").toLowerCase();
  return accept.includes("image") || accept === "";
}

function getElementDepth(element) {
  let depth = 0;
  let cursor = element;
  while (cursor && cursor.parentElement) {
    depth += 1;
    cursor = cursor.parentElement;
  }
  return depth;
}

function getCommonAncestorDepth(a, b) {
  if (!(a instanceof Element) || !(b instanceof Element)) return 0;

  const ancestors = new Set();
  let cursor = a;
  while (cursor) {
    ancestors.add(cursor);
    cursor = cursor.parentElement;
  }

  cursor = b;
  while (cursor) {
    if (ancestors.has(cursor)) {
      return getElementDepth(cursor);
    }
    cursor = cursor.parentElement;
  }

  return 0;
}

function isLikelyFeatureImageInput(input) {
  return Boolean(input.closest(FEATURE_IMAGE_SELECTORS));
}

function isLikelyAppendUploader(input) {
  const inputName = (input.getAttribute("name") || "").toLowerCase();
  return input.multiple || inputName === "image-input";
}

function getPreferredContextRoot(contextImage) {
  if (!(contextImage instanceof Element)) return null;
  return contextImage.closest(CONTEXT_ROOT_SELECTORS);
}

function activateContextCard(contextImage) {
  if (!(contextImage instanceof HTMLElement)) return;
  const card = contextImage.closest(CARD_SELECTORS) || contextImage;
  card.dispatchEvent(new MouseEvent("click", { bubbles: true }));
}


function findCardImageInput(contextCard) {
  if (!(contextCard instanceof Element)) return null;

  const toolbarInput = contextCard.querySelector(`${CARD_TOOLBAR_SELECTOR} input[type="file"][name="image-input"]`);
  if (toolbarInput && isViableImageInput(toolbarInput)) {
    debugLog("selected strict card toolbar input", { input: describeInput(toolbarInput) });
    return toolbarInput;
  }

  const anyLocal = contextCard.querySelector('input[type="file"][name="image-input"], input[type="file"]');
  if (anyLocal && isViableImageInput(anyLocal)) {
    debugLog("selected local card input fallback", { input: describeInput(anyLocal) });
    return anyLocal;
  }

  debugLog("no strict card input found");
  return null;
}

function getCaptionState(contextCard) {
  if (!(contextCard instanceof Element)) return null;

  const captionEditor = contextCard.querySelector('[data-testid="image-caption-editor"] .kg-prose');
  const rawText = captionEditor?.textContent?.trim() || "";
  const existingPhotographerLink = captionEditor?.querySelector('a[href*="unsplash.com/@"]');
  const existingSourceLink = captionEditor?.querySelector('a[href*="unsplash.com"]');

  return {
    rawText,
    photographerHref: existingPhotographerLink?.getAttribute("href") || "https://unsplash.com",
    photographerLabel: existingPhotographerLink?.textContent?.trim() || "Unsplash",
    sourceHref: existingSourceLink?.getAttribute("href") || "https://unsplash.com"
  };
}

function setCaptionContent(contextCard, html) {
  if (!(contextCard instanceof Element) || !html) return;
  const captionEditor = contextCard.querySelector('[data-testid="image-caption-editor"] .kg-prose');
  if (!(captionEditor instanceof HTMLElement)) return;

  captionEditor.innerHTML = html;
  const editable = captionEditor.closest('[contenteditable="true"]') || captionEditor;
  editable.dispatchEvent(new Event("input", { bubbles: true }));
  editable.dispatchEvent(new Event("change", { bubbles: true }));
}

function findBestGhostImageInput(contextImage, contextCard = null) {
  const allCandidates = Array.from(document.querySelectorAll('input[type="file"]')).filter(isViableImageInput);
  if (!allCandidates.length) {
    debugLog("no viable file inputs found in document");
    return null;
  }

  const contextRoot = getPreferredContextRoot(contextImage);
  const scopedCandidates = contextRoot
    ? allCandidates.filter((input) => contextRoot.contains(input))
    : allCandidates;
  const candidates = scopedCandidates.length ? scopedCandidates : allCandidates;

  const cardContainer = contextCard instanceof Element
    ? contextCard
    : contextImage instanceof Element
      ? contextImage.closest(CARD_SELECTORS)
      : null;

  if (cardContainer) {
    const localInputs = Array.from(cardContainer.querySelectorAll('input[type="file"]')).filter(isViableImageInput);
    const localPreferred = localInputs.find((input) => !isLikelyAppendUploader(input) && !isLikelyFeatureImageInput(input));
    if (localPreferred) {
      return localPreferred;
    }

    const localVisible = localInputs.find((input) => {
      const style = window.getComputedStyle(input);
      return style.display !== "none" && style.visibility !== "hidden";
    });
    if (localVisible) {
      return localVisible;
    }
  }

  const visibleCandidates = candidates.filter((input) => {
    const style = window.getComputedStyle(input);
    return style.display !== "none" && style.visibility !== "hidden";
  });

  if (!(contextImage instanceof Element)) {
    debugLog("missing context image while resolving best ghost input");
    return null;
  }

  const pool = visibleCandidates.length ? visibleCandidates : candidates;
  const contextRect = contextImage.getBoundingClientRect();
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  pool.forEach((input) => {
    const rect = input.getBoundingClientRect();
    const dx = rect.left - contextRect.left;
    const dy = rect.top - contextRect.top;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const commonAncestorDepth = getCommonAncestorDepth(contextImage, input);
    const featurePenalty = isLikelyFeatureImageInput(input) ? 5000 : 0;
    const appendPenalty = isLikelyAppendUploader(input) ? 2500 : 0;

    const score = commonAncestorDepth * 100 - distance - featurePenalty - appendPenalty;
    if (score > bestScore) {
      best = input;
      bestScore = score;
    }
  });

  if (!best) {
    debugLog("best ghost input could not be resolved");
    return null;
  }

  if (isLikelyFeatureImageInput(best)) {
    const safer = pool.find((input) => !isLikelyFeatureImageInput(input) && !isLikelyAppendUploader(input));
    const chosen = safer || null;
    debugLog("feature-image candidate filtered", { chosen: describeInput(chosen) });
    return chosen;
  }

  debugLog("selected best ghost input", { input: describeInput(best) });
  return best;
}

function resolveOutputDimensions(sourceWidth, sourceHeight, widthValue, heightValue) {
  const parsedWidth = Number.parseInt(widthValue, 10);
  const parsedHeight = Number.parseInt(heightValue, 10);
  const hasWidth = Number.isFinite(parsedWidth) && parsedWidth > 0;
  const hasHeight = Number.isFinite(parsedHeight) && parsedHeight > 0;

  if (hasWidth && hasHeight) {
    return { width: parsedWidth, height: parsedHeight };
  }

  if (hasWidth) {
    const ratio = sourceHeight / sourceWidth;
    return { width: parsedWidth, height: Math.max(1, Math.round(parsedWidth * ratio)) };
  }

  if (hasHeight) {
    const ratio = sourceWidth / sourceHeight;
    return { width: Math.max(1, Math.round(parsedHeight * ratio)), height: parsedHeight };
  }

  return { width: sourceWidth, height: sourceHeight };
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function buildOutputFile(canvas, originalName, mimeType, outputWidth, outputHeight) {
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;

  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) return Promise.resolve(null);

  outputCtx.drawImage(canvas, 0, 0, outputWidth, outputHeight);

  return new Promise((resolve) => {
    outputCanvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }

      const basename = originalName.replace(/\.[^.]+$/, "") || "image";
      const extension = inferExtensionFromMimeType(mimeType);
      const filename = `${basename}.${extension}`;

      resolve(new File([blob], filename, {
        type: mimeType,
        lastModified: Date.now()
      }));
    }, mimeType);
  });
}

function isUnsplashImageUrl(imageSrc) {
  try {
    const url = new URL(imageSrc, window.location.href);
    return url.hostname === UNSPLASH_DOMAIN;
  } catch (_error) {
    return false;
  }
}

function updateUnsplashCaption(contextCard, captionState = null) {
  if (!(contextCard instanceof Element)) return;

  const photographerHref = captionState?.photographerHref || "https://unsplash.com";
  const photographerLabel = captionState?.photographerLabel || "Unsplash";
  const sourceHref = captionState?.sourceHref || "https://unsplash.com";

  const captionHtml = `
    <p>
      ${t("by", "Photo by")}
      <a href="${photographerHref}" target="_blank" rel="noopener noreferrer">${photographerLabel}</a>
      /
      <a href="${sourceHref}" target="_blank" rel="noopener noreferrer">Unsplash</a>
      ${t("editedAttributionSuffix", "(image edited afterwards)")}
    </p>
  `;

  setCaptionContent(contextCard, captionHtml);
}

function getImageDimensionsFromElement(imageSrc, imageElement = null) {
  if (imageElement instanceof HTMLImageElement && imageElement.naturalWidth > 0 && imageElement.naturalHeight > 0) {
    return Promise.resolve({ width: imageElement.naturalWidth, height: imageElement.naturalHeight });
  }

  return new Promise((resolve) => {
    const probe = new Image();
    probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
    probe.onerror = () => resolve({ width: 0, height: 0 });
    probe.src = imageSrc;
  });
}

function fetchImageFromBackground(imageSrc) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: "FETCH_IMAGE_BLOB", imageSrc }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      if (!response?.ok || !Array.isArray(response.buffer)) {
        reject(new Error(response?.error || "Unknown fetch error"));
        return;
      }

      const array = new Uint8Array(response.buffer);
      resolve(new Blob([array], { type: response.type || DEFAULT_OUTPUT_MIME }));
    });
  });
}

async function launchEditor({ imageSrc, originalFile, input = null, mode = "upload", contextImage = null, contextCard = null, sourceImageUrl = "" }) {
  const originalDimensions = await getImageDimensionsFromElement(imageSrc, contextImage);
  const {
    modal,
    image,
    cancelButton,
    applyButton,
    widthInput,
    heightInput,
    formatSelect,
    newSizeHint,
    newSizeValue
  } = createModal(imageSrc, {
    mode,
    fileName: originalFile.name,
    originalWidth: originalDimensions.width,
    originalHeight: originalDimensions.height,
    originalSize: originalFile.size
  });

  formatSelect.value = inferExtensionFromMimeType(originalFile.type || DEFAULT_OUTPUT_MIME);

  const cropper = new Cropper(image, {
    viewMode: 1,
    autoCropArea: 1,
    responsive: true
  });

  async function refreshSizePreview() {
    const cropCanvas = cropper.getCroppedCanvas();
    if (!cropCanvas) return;
    const dimensions = resolveOutputDimensions(cropCanvas.width, cropCanvas.height, widthInput.value, heightInput.value);
    const selectedFormat = formatSelect.value;
    const mimeType = OUTPUT_FORMATS[selectedFormat] || DEFAULT_OUTPUT_MIME;
    const outputFile = await buildOutputFile(cropCanvas, originalFile.name, mimeType, dimensions.width, dimensions.height);

    const cropData = cropper.getData(true);
    const isCropped = Math.round(cropData.width) !== originalDimensions.width || Math.round(cropData.height) !== originalDimensions.height;
    const isResized = dimensions.width !== cropCanvas.width || dimensions.height !== cropCanvas.height;

    if (outputFile && (isCropped || isResized)) {
      newSizeHint.hidden = false;
      newSizeValue.textContent = formatBytes(outputFile.size);
      return;
    }

    newSizeHint.hidden = true;
    newSizeValue.textContent = "–";
  }

  function cleanup() {
    cropper.destroy();
    modal.remove();
  }

  async function apply() {
    const cropCanvas = cropper.getCroppedCanvas();
    const dimensions = resolveOutputDimensions(cropCanvas.width, cropCanvas.height, widthInput.value, heightInput.value);
    const outputWidth = dimensions.width;
    const outputHeight = dimensions.height;
    const selectedFormat = formatSelect.value;
    const mimeType = OUTPUT_FORMATS[selectedFormat] || DEFAULT_OUTPUT_MIME;

    const outputFile = await buildOutputFile(cropCanvas, originalFile.name, mimeType, outputWidth, outputHeight);
    cleanup();

    if (!outputFile) {
      if (input) updateInputWithFile(input, originalFile);
      return;
    }

    if (input) {
      updateInputWithFile(input, outputFile);
      return;
    }

    const sourceWasUnsplash = isUnsplashImageUrl(sourceImageUrl || contextImage?.getAttribute?.("src") || "");
    const captionState = getCaptionState(contextCard);

    activateContextCard(contextImage);
    await new Promise((resolve) => setTimeout(resolve, 80));

    const strictCardInput = findCardImageInput(contextCard);
    const ghostInput = strictCardInput || findBestGhostImageInput(contextImage, contextCard);
    debugLog("context apply input resolution", {
      strictCardInput: describeInput(strictCardInput),
      selectedInput: describeInput(ghostInput),
      sourceWasUnsplash
    });
    if (ghostInput) {
      updateInputWithFile(ghostInput, outputFile);
      if (sourceWasUnsplash) {
        setTimeout(() => updateUnsplashCaption(contextCard, captionState), 120);
      }
      return;
    }

    console.warn("[ghost-image-editor] no Ghost image input found; downloading file instead");
    debugLog("falling back to download because no input matched", {
      sourceImageUrl,
      contextImageSrc: contextImage?.getAttribute?.("src") || ""
    });
    downloadFile(outputFile);
  }

  widthInput.addEventListener("input", () => {
    refreshSizePreview();
  });
  heightInput.addEventListener("input", () => {
    refreshSizePreview();
  });
  formatSelect.addEventListener("change", () => {
    refreshSizePreview();
  });
  image.addEventListener("cropend", () => {
    refreshSizePreview();
  });
  setTimeout(() => refreshSizePreview(), 0);

  cancelButton.addEventListener("click", () => {
    cleanup();
    if (input) updateInputWithFile(input, originalFile);
  });

  applyButton.addEventListener("click", () => {
    apply();
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      cleanup();
      if (input) updateInputWithFile(input, originalFile);
    }
  });
}

globalThis.openEditor = function openEditor(imageSrc, input, originalFile) {
  launchEditor({ imageSrc, input, originalFile, mode: "upload", sourceImageUrl: imageSrc });
};

globalThis.openEditorFromContext = async function openEditorFromContext(imageSrc) {
  try {
    const blob = await fetchImageFromBackground(imageSrc);
    const mimeType = blob.type || DEFAULT_OUTPUT_MIME;
    if (!mimeType.startsWith("image/")) {
      throw new Error("Selected resource is not an image");
    }

    const url = new URL(imageSrc, window.location.href);
    const sourceName = url.pathname.split("/").pop() || "image";
    const contextFile = new File([blob], sourceName, {
      type: mimeType,
      lastModified: Date.now()
    });

    const objectUrl = URL.createObjectURL(blob);
    const contextImage = globalThis.__ghostImageEditorContextImage;
    const contextCard = globalThis.__ghostImageEditorContextCard;
    launchEditor({
      imageSrc: objectUrl,
      originalFile: contextFile,
      mode: "context",
      contextImage,
      contextCard,
      sourceImageUrl: imageSrc
    });
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (error) {
    console.warn("[ghost-image-editor] failed to open context editor", error);
  }
};
