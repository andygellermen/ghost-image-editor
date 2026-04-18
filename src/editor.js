import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";
import "./editor.css";

{

function resolveExtensionApi() {
  const candidates = [];

  if (typeof browser !== "undefined") candidates.push(browser);
  if (typeof chrome !== "undefined") candidates.push(chrome);
  if (globalThis?.browser) candidates.push(globalThis.browser);
  if (globalThis?.chrome) candidates.push(globalThis.chrome);

  return candidates.find((candidate) => candidate?.runtime?.sendMessage)
    || candidates.find((candidate) => candidate?.runtime?.onMessage?.addListener)
    || candidates.find((candidate) => candidate?.runtime?.getManifest)
    || candidates.find((candidate) => candidate?.i18n?.getMessage)
    || null;
}

const EXTENSION_API = resolveExtensionApi();

const MODAL_ID = "ghost-image-editor-modal";
const DEFAULT_OUTPUT_MIME = "image/webp";
const DEFAULT_OUTPUT_FORMAT = "webp";
const DEFAULT_RATIO_PRESET_ID = "free";
const DEFAULT_ORIENTATION = "landscape";
const DEFAULT_MAX_OUTPUT_DIMENSION = 1024;
const OUTPUT_FORMATS = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp"
};
const OUTPUT_FORMAT_OPTIONS = [
  { value: "jpg", label: "JPG" },
  { value: "png", label: "PNG" },
  { value: "webp", label: "WEBP" }
];
const ASPECT_RATIO_PRESETS = [
  { id: "16:9", label: "16:9", width: 16, height: 9 },
  { id: "4:3", label: "4:3", width: 4, height: 3 },
  { id: "3:2", label: "3:2", width: 3, height: 2 },
  { id: "1:1", label: "1:1", width: 1, height: 1 },
  { id: "free", labelKey: "free", fallback: "Free" }
];

const FEATURE_IMAGE_SELECTORS = "[data-test-feature-image-uploader], .gh-editor-feature-image, .gh-editor-settings, .settings-menu, .settings-menu-pane, .settings-menu-container, .gh-editor-settings-container, aside";
const CARD_SELECTORS = ".kg-card, .kg-image-card, figure, [data-kg-card], .koenig-card, .gh-editor-feature-image-container, .gh-editor-feature-image";
const CONTEXT_ROOT_SELECTORS = ".koenig-editor, .gh-koenig-editor, .kg-prose, .kg-card, main";
const UNSPLASH_DOMAIN = "images.unsplash.com";
const CARD_TOOLBAR_SELECTOR = "[data-kg-card-toolbar=\"image\"]";
const GALLERY_IMAGE_TARGET_SELECTORS = '[data-testid="gallery-image"], [data-image="true"]';
const SELECTED_BODY_CARD_SELECTORS = '[data-kg-card="image"][data-kg-card-selected="true"], .kg-image-card[data-kg-card-selected="true"], [data-kg-card="gallery"][data-kg-card-selected="true"]';
const PAGE_BRIDGE_READY_ATTRIBUTE = "data-ghost-image-editor-page-bridge-ready";
const PAGE_BRIDGE_REQUEST_TYPE = "ghost-image-editor:gallery-replace-request";
const PAGE_BRIDGE_RESPONSE_TYPE = "ghost-image-editor:gallery-replace-response";
const PAGE_BRIDGE_REQUEST_SOURCE = "ghost-image-editor-extension";
const PAGE_BRIDGE_RESPONSE_SOURCE = "ghost-image-editor-page";
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


function escapeForAttributeSelector(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return String(value);
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
    applyToGhost: "Save to Ghost",
    applyCrop: "Save to Ghost",
    imageEditor: "Image editor",
    selectedImage: "Selected image",
    width: "Width",
    height: "Height",
    dimensions: "Size",
    auto: "Auto",
    format: "Format",
    cropRatio: "Aspect ratio",
    orientation: "Orientation",
    landscape: "Landscape",
    portrait: "Portrait",
    free: "Free",
    cancel: "Cancel",
    help: "Help",
    original: "Original",
    new: "New",
    outputFile: "Output file",
    originalDimensions: "Original dimensions",
    originalSize: "Original file size",
    newSize: "New file size",
    editedAttributionSuffix: "(image edited afterwards)",
    currentCropDimensions: "Current crop dimensions",
    by: "Photo by"
  },
  de: {
    applyToGhost: "In Ghost speichern",
    applyCrop: "In Ghost speichern",
    imageEditor: "Bildeditor",
    selectedImage: "Ausgewähltes Bild",
    width: "Breite",
    height: "Höhe",
    dimensions: "Größe",
    auto: "Auto",
    format: "Format",
    cropRatio: "Seitenverhältnis",
    orientation: "Ausrichtung",
    landscape: "Querformat",
    portrait: "Hochformat",
    free: "Frei",
    cancel: "Abbrechen",
    help: "Hilfe",
    original: "Original",
    new: "Neu",
    outputFile: "Ausgabedatei",
    originalDimensions: "Originale Abmessungen",
    originalSize: "Originale Dateigröße",
    newSize: "Neue Dateigröße",
    editedAttributionSuffix: "(Bild nachträglich bearbeitet)",
    currentCropDimensions: "Aktuelle Zuschnitt-Abmessungen",
    by: "Foto von"
  }
};

function getLocale() {
  const lang = (document.documentElement.lang || navigator.language || "en").toLowerCase();
  return lang.startsWith("de") ? "de" : "en";
}

function t(key, fallback) {
  try {
    const runtimeValue = EXTENSION_API?.i18n?.getMessage?.(key);
    if (runtimeValue) return runtimeValue;
  } catch (_error) {
    // no-op when runtime i18n is unavailable
  }

  const locale = getLocale();
  return I18N_MESSAGES[locale]?.[key] || I18N_MESSAGES.en[key] || fallback;
}

function removeModal() {
  document.getElementById(MODAL_ID)?.remove();
}

function inferExtensionFromMimeType(mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return DEFAULT_OUTPUT_FORMAT;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  const decimals = index === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(decimals).replace(/\.0$/, "")}${units[index]}`;
}

function formatDimensions(width, height) {
  return `${Math.max(1, Math.round(width))}x${Math.max(1, Math.round(height))}`;
}

function getFormatLabel(valueOrMimeType) {
  const format = inferExtensionFromMimeType(valueOrMimeType);
  return format === "jpg" ? "JPG" : format.toUpperCase();
}

function getBaseName(fileName) {
  return String(fileName || "image").replace(/\.[^.]+$/, "") || "image";
}

function transliterateToAscii(value) {
  const replacements = [
    [/ß/g, "ss"],
    [/ẞ/g, "SS"],
    [/[äæ]/g, "ae"],
    [/Ä/g, "Ae"],
    [/Æ/g, "AE"],
    [/[öœ]/g, "oe"],
    [/Ö/g, "Oe"],
    [/Œ/g, "OE"],
    [/ü/g, "ue"],
    [/Ü/g, "Ue"],
    [/[ø]/g, "o"],
    [/[Ø]/g, "O"],
    [/[ð]/g, "d"],
    [/[Ð]/g, "D"],
    [/[þ]/g, "th"],
    [/[Þ]/g, "TH"],
    [/[ł]/g, "l"],
    [/[Ł]/g, "L"]
  ];

  let normalized = String(value || "");
  replacements.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });

  return normalized
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]+/g, " ");
}

function sanitizeFileBasename(value, fallback = "image") {
  const sanitized = transliterateToAscii(value)
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return sanitized || fallback;
}

function buildOutputFilename(originalName, mimeTypeOrFormat = DEFAULT_OUTPUT_MIME, baseName = "") {
  const fallbackBaseName = sanitizeFileBasename(getBaseName(originalName), "image");
  const basename = sanitizeFileBasename(baseName || fallbackBaseName, fallbackBaseName);
  const extension = inferExtensionFromMimeType(mimeTypeOrFormat);
  return `${basename}.${extension}`;
}

function formatSummaryDimensions(width, height) {
  return `${formatDimensions(width, height)}px`;
}

function renderSummary(container, originalDetails, newDetails, outputFileName = "") {
  if (!(container instanceof HTMLElement)) return;

  container.textContent = "";

  const pill = document.createElement("div");
  pill.className = "editor-summary-pill";

  const originalLine = document.createElement("span");
  originalLine.className = "editor-summary-line";
  originalLine.textContent = `${t("original", "Original")}: ${formatSummaryDimensions(originalDetails.width, originalDetails.height)}, ${originalDetails.format}, ${originalDetails.size}`;

  const newLine = document.createElement("span");
  newLine.className = "editor-summary-line";
  newLine.textContent = `${t("new", "New")}: ${formatSummaryDimensions(newDetails.width, newDetails.height)}, ${newDetails.format}, ${newDetails.size}`;

  pill.append(originalLine, newLine);
  container.appendChild(pill);
}

function getAspectRatioPreset(presetId) {
  return ASPECT_RATIO_PRESETS.find((preset) => preset.id === presetId) || ASPECT_RATIO_PRESETS[0];
}

function resolveAspectRatio(presetId, orientation) {
  const preset = getAspectRatioPreset(presetId);
  if (!Number.isFinite(preset?.width) || !Number.isFinite(preset?.height)) return Number.NaN;

  const ratio = preset.width / preset.height;
  if (orientation === "portrait" && preset.width !== preset.height) {
    return 1 / ratio;
  }

  return ratio;
}

function setActiveButtons(buttons, key, activeValue) {
  buttons.forEach((button) => {
    const isActive = button.dataset[key] === activeValue;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function getSelectedFormatValue(formatInputs) {
  return formatInputs.find((input) => input.checked)?.value || DEFAULT_OUTPUT_FORMAT;
}

function fitCropBoxToAspectRatio(cropper, aspectRatio) {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return;

  const imageData = cropper.getImageData();
  if (!imageData.width || !imageData.height) return;

  let cropWidth = imageData.width;
  let cropHeight = cropWidth / aspectRatio;

  if (cropHeight > imageData.height) {
    cropHeight = imageData.height;
    cropWidth = cropHeight * aspectRatio;
  }

  cropper.setCropBoxData({
    left: imageData.left + ((imageData.width - cropWidth) / 2),
    top: imageData.top + ((imageData.height - cropHeight) / 2),
    width: cropWidth,
    height: cropHeight
  });
}

function getInitialDimensionOverrides(width, height, maxDimension = DEFAULT_MAX_OUTPUT_DIMENSION) {
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return { widthValue: "", heightValue: "" };
  }

  const normalizedWidth = Math.max(1, Math.round(width));
  const normalizedHeight = Math.max(1, Math.round(height));
  if (normalizedWidth <= maxDimension && normalizedHeight <= maxDimension) {
    return { widthValue: "", heightValue: "" };
  }

  if (normalizedWidth >= normalizedHeight) {
    return { widthValue: String(maxDimension), heightValue: "" };
  }

  return { widthValue: "", heightValue: String(maxDimension) };
}

function createModal(imageSrc, options = {}) {
  removeModal();

  const {
    mode = "upload",
    fileName = "image",
    initialOrientation = DEFAULT_ORIENTATION,
    originalWidth = 0,
    originalHeight = 0,
    originalSize = 0,
    originalFormat = DEFAULT_OUTPUT_FORMAT
  } = options;
  const applyLabel = mode === "context" ? t("applyToGhost", "Save to Ghost") : t("applyCrop", "Save to Ghost");
  const defaultBaseName = sanitizeFileBasename(getBaseName(fileName), "image");

  const modal = document.createElement("div");
  modal.id = MODAL_ID;
  modal.className = "ghost-image-editor-modal";
  modal.innerHTML = `
    <div class="editor-box" role="dialog" aria-modal="true" aria-label="${t("imageEditor", "Image editor")}">
      <div class="editor-toolbar">
        <div class="editor-toolbar-primary">
          <div class="editor-control-group">
            <span class="editor-control-label">${t("cropRatio", "Aspect ratio")}</span>
            <div class="editor-chip-row">
              ${ASPECT_RATIO_PRESETS.map((preset) => {
                const label = preset.label || t(preset.labelKey, preset.fallback);
                const isActive = preset.id === DEFAULT_RATIO_PRESET_ID;
                return `<button type="button" class="editor-chip-button${isActive ? " is-active" : ""}" data-ratio-preset="${preset.id}" aria-pressed="${String(isActive)}">${label}</button>`;
              }).join("")}
            </div>
          </div>
          <div class="editor-control-group">
            <span class="editor-control-label">${t("orientation", "Orientation")}</span>
            <div class="editor-chip-row">
              <button type="button" class="editor-chip-button${initialOrientation === "landscape" ? " is-active" : ""}" data-orientation="landscape" aria-pressed="${String(initialOrientation === "landscape")}">${t("landscape", "Landscape")}</button>
              <button type="button" class="editor-chip-button${initialOrientation === "portrait" ? " is-active" : ""}" data-orientation="portrait" aria-pressed="${String(initialOrientation === "portrait")}">${t("portrait", "Portrait")}</button>
            </div>
          </div>
          <div class="editor-control-group editor-control-group--size">
            <span class="editor-control-label">${t("dimensions", "Size")}</span>
            <div class="editor-dimensions">
              <label class="editor-dimension-field">
                <span>${t("width", "Width")}</span>
                <input type="number" min="1" step="1" inputmode="numeric" data-setting="width" placeholder="${t("auto", "Auto")}">
              </label>
              <label class="editor-dimension-field">
                <span>${t("height", "Height")}</span>
                <input type="number" min="1" step="1" inputmode="numeric" data-setting="height" placeholder="${t("auto", "Auto")}">
              </label>
            </div>
          </div>
        </div>
        <div class="editor-toolbar-secondary">
          <fieldset class="editor-control-group editor-control-group--format">
            <legend class="editor-control-label">${t("format", "Format")}</legend>
            <div class="editor-chip-radio-row">
              ${OUTPUT_FORMAT_OPTIONS.map((formatOption) => `
                <label class="editor-chip-radio">
                  <input
                    type="radio"
                    name="ghost-image-editor-format"
                    value="${formatOption.value}"
                    data-setting="format"
                    ${formatOption.value === DEFAULT_OUTPUT_FORMAT ? "checked" : ""}
                  >
                  <span>${formatOption.label}</span>
                </label>
              `).join("")}
            </div>
          </fieldset>
          <div class="editor-control-group editor-control-group--file">
            <span class="editor-control-label">${t("outputFile", "Output file")}</span>
            <label class="editor-toolbar-file" data-value-file title="${buildOutputFilename(fileName, DEFAULT_OUTPUT_FORMAT, defaultBaseName)}">
              <input
                type="text"
                data-setting="file-name"
                placeholder="${defaultBaseName}"
                aria-label="${t("outputFile", "Output file")}"
                spellcheck="false"
                autocomplete="off"
              >
              <span class="editor-toolbar-file-extension" data-value-file-extension>.${inferExtensionFromMimeType(DEFAULT_OUTPUT_FORMAT)}</span>
            </label>
          </div>
        </div>
      </div>
      <div class="editor-stage">
        <div class="editor-image-shell">
          <div class="editor-image-wrapper">
            <img class="editor-image" alt="${t("selectedImage", "Selected image")}" src="${imageSrc}">
          </div>
        </div>
      </div>
      <div class="editor-footer">
        <div class="editor-summary" data-value-summary></div>
        <div class="editor-controls">
          <a href="https://geller.men/ghost-image-editor" target="_blank" rel="noopener noreferrer" data-action="help" aria-label="${t("help", "Help")}" title="${t("help", "Help")}">?</a>
          <button type="button" data-action="cancel">${t("cancel", "Cancel")}</button>
          <button type="button" data-action="apply">${applyLabel}</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  const fileNameInput = modal.querySelector('[data-setting="file-name"]');
  const fileExtensionValue = modal.querySelector('[data-value-file-extension]');
  const fileValue = modal.querySelector('[data-value-file]');
  if (fileNameInput) {
    fileNameInput.value = defaultBaseName;
  }
  const summaryValue = modal.querySelector('[data-value-summary]');
  renderSummary(
    summaryValue,
    {
      width: originalWidth,
      height: originalHeight,
      format: getFormatLabel(originalFormat),
      size: formatBytes(originalSize)
    },
    {
      width: originalWidth,
      height: originalHeight,
      format: getFormatLabel(DEFAULT_OUTPUT_FORMAT),
      size: "–"
    },
    buildOutputFilename(fileName, DEFAULT_OUTPUT_FORMAT, defaultBaseName)
  );

  return {
    modal,
    image: modal.querySelector(".editor-image"),
    cancelButton: modal.querySelector('[data-action="cancel"]'),
    applyButton: modal.querySelector('[data-action="apply"]'),
    widthInput: modal.querySelector('[data-setting="width"]'),
    heightInput: modal.querySelector('[data-setting="height"]'),
    formatInputs: Array.from(modal.querySelectorAll('[data-setting="format"]')),
    ratioButtons: Array.from(modal.querySelectorAll('[data-ratio-preset]')),
    orientationButtons: Array.from(modal.querySelectorAll('[data-orientation]')),
    fileNameInput,
    fileExtensionValue,
    fileValue,
    summaryValue
  };
}

function updateInputWithFile(input, file) {
  const transfer = new DataTransfer();
  transfer.items.add(file);

  input.dataset.editorApplying = "true";
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("Failed to read file as data URL"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

async function waitForPageBridge(attempts = 20, delayMs = 50) {
  if (document.documentElement?.getAttribute(PAGE_BRIDGE_READY_ATTRIBUTE) === "1") {
    return true;
  }

  for (let index = 0; index < attempts; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    if (document.documentElement?.getAttribute(PAGE_BRIDGE_READY_ATTRIBUTE) === "1") {
      return true;
    }
  }

  return false;
}

function buildGalleryCardSourceSnapshot(contextCard) {
  if (!(contextCard instanceof Element)) return [];
  return Array.from(contextCard.querySelectorAll("img[src], img[currentSrc]"))
    .map((image) => getImageSource(image))
    .filter(Boolean);
}

function getGalleryDomIndex(contextCard, contextImage, contextSourceSrc = "") {
  if (contextImage instanceof Element) {
    const galleryElement = contextImage.closest('[data-gallery], [data-testid="gallery-container"]');
    const galleryTarget = contextImage.closest(GALLERY_IMAGE_TARGET_SELECTORS);
    if (galleryElement && galleryTarget) {
      const galleryTargets = Array.from(galleryElement.querySelectorAll(GALLERY_IMAGE_TARGET_SELECTORS));
      const domIndex = galleryTargets.indexOf(galleryTarget);
      if (domIndex !== -1) return domIndex;
    }
  }

  if (!(contextCard instanceof Element) || !contextSourceSrc) return -1;
  const domSources = buildGalleryCardSourceSnapshot(contextCard);
  return domSources.findIndex((source) => source === contextSourceSrc);
}

async function requestGalleryReplacement(payload) {
  const bridgeReady = await waitForPageBridge();
  if (!bridgeReady) {
    debugLog("page bridge not ready for gallery replacement");
    return { ok: false, error: "Page bridge not ready" };
  }

  const requestId = typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `ghost-image-editor-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return new Promise((resolve) => {
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      cleanup();
      resolve({ ok: false, error: "Gallery replacement timed out" });
    }, 30000);

    function cleanup() {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", handleMessage, false);
    }

    function handleMessage(event) {
      if (event.source !== window) return;
      const message = event.data;
      if (!message || message.source !== PAGE_BRIDGE_RESPONSE_SOURCE || message.type !== PAGE_BRIDGE_RESPONSE_TYPE || message.requestId !== requestId) {
        return;
      }

      cleanup();
      resolve({
        ok: Boolean(message.ok),
        error: message.error || "",
        payload: message.payload || {}
      });
    }

    window.addEventListener("message", handleMessage, false);
    window.postMessage({
      source: PAGE_BRIDGE_REQUEST_SOURCE,
      type: PAGE_BRIDGE_REQUEST_TYPE,
      requestId,
      payload
    }, window.location.origin);
  });
}

async function replaceGalleryImage(contextCard, contextImage, contextSourceSrc, outputFile, outputWidth, outputHeight) {
  const fileDataUrl = await readFileAsDataUrl(outputFile);
  const request = await requestGalleryReplacement({
    cardImageSources: buildGalleryCardSourceSnapshot(contextCard),
    contextSourceSrc: contextSourceSrc || getImageSource(contextImage),
    fileDataUrl,
    fileName: outputFile.name,
    galleryDomIndex: getGalleryDomIndex(contextCard, contextImage, contextSourceSrc),
    lastModified: outputFile.lastModified || Date.now(),
    mimeType: outputFile.type || DEFAULT_OUTPUT_MIME,
    outputHeight,
    outputWidth
  });

  if (!request.ok) {
    console.warn("[ghost-image-editor] gallery replacement failed", request.error || "Unknown gallery replacement error");
    debugLog("gallery replacement bridge request failed", { error: request.error });
    return false;
  }

  debugLog("gallery replacement bridge request succeeded", request.payload || {});
  return true;
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

function isCardToolbarInput(input) {
  return Boolean(input.closest(CARD_TOOLBAR_SELECTOR));
}

function isGalleryCard(element) {
  return element instanceof Element && Boolean(element.closest('[data-kg-card="gallery"]'));
}

function isGalleryScopedInput(input) {
  return input instanceof HTMLInputElement && isGalleryCard(input);
}

function isLikelyAppendUploader(input) {
  const inputName = (input.getAttribute("name") || "").toLowerCase();
  if (input.multiple) return true;
  if (inputName !== "image-input") return false;
  if (isCardToolbarInput(input)) return false;
  if (input.closest(CARD_SELECTORS)) return false;
  return true;
}

function getPreferredContextRoot(contextImage) {
  if (!(contextImage instanceof Element)) return null;
  return contextImage.closest(CONTEXT_ROOT_SELECTORS);
}

function activateContextCard(contextImage) {
  if (!(contextImage instanceof HTMLElement)) return;
  const candidateTargets = [
    contextImage.closest(GALLERY_IMAGE_TARGET_SELECTORS),
    contextImage,
    contextImage.closest('[data-koenig-dnd-container="true"]'),
    contextImage.closest("figure"),
    contextImage.closest(CARD_SELECTORS)
  ];
  const seen = new Set();

  candidateTargets.forEach((target) => {
    if (!(target instanceof HTMLElement) || seen.has(target)) return;
    seen.add(target);
    target.focus?.({ preventScroll: true });
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });
}



function findCaptionEditor(container) {
  if (!(container instanceof Element)) return null;

  const cardCaption = container.querySelector('[data-testid="image-caption-editor"] .kg-prose');
  if (cardCaption instanceof HTMLElement) return cardCaption;

  const featureCaption = container.querySelector('.gh-editor-feature-image-caption-container .kg-prose');
  if (featureCaption instanceof HTMLElement) return featureCaption;

  return null;
}

function isSameCard(a, b) {
  if (!(a instanceof Element) || !(b instanceof Element)) return false;
  return a === b || a.contains(b) || b.contains(a);
}

function getImageSource(image) {
  if (!(image instanceof HTMLImageElement)) return "";
  return image.currentSrc || image.getAttribute("src") || "";
}

function cardMatchesContext(candidateCard, contextCard = null, contextSourceSrc = "") {
  if (!(candidateCard instanceof Element)) return false;
  if (contextCard instanceof Element && isSameCard(candidateCard, contextCard)) {
    return true;
  }

  if (!contextSourceSrc) return false;

  return Array.from(candidateCard.querySelectorAll("img[src], img[currentSrc]")).some((image) => {
    return getImageSource(image) === contextSourceSrc;
  });
}

function findSharedCardToolbarInput(contextCard, contextSourceSrc = "", contextKind = "card") {
  if (contextKind === "feature") return null;

  const selectedCards = Array.from(document.querySelectorAll(SELECTED_BODY_CARD_SELECTORS));
  const selectedContextCard = selectedCards.find((candidate) => cardMatchesContext(candidate, contextCard, contextSourceSrc))
    || (!(contextCard instanceof Element) && !contextSourceSrc ? selectedCards[0] : null);
  if (!(selectedContextCard instanceof Element)) {
    debugLog("no selected body image card matched current context");
    return null;
  }

  const toolbarInputs = Array.from(document.querySelectorAll(`${CARD_TOOLBAR_SELECTOR} input[type="file"][name="image-input"], ${CARD_TOOLBAR_SELECTOR} input[type="file"]`))
    .filter(isViableImageInput);
  const toolbarInput = toolbarInputs.find((input) => !isLikelyAppendUploader(input)) || toolbarInputs[0] || null;
  if (toolbarInput) {
    debugLog("selected shared card toolbar input", { input: describeInput(toolbarInput) });
  }
  return toolbarInput;
}

function findCardImageInput(contextCard, contextKind = "card", contextSourceSrc = "") {
  if (!(contextCard instanceof Element)) return null;

  const toolbarInput = contextCard.querySelector(`${CARD_TOOLBAR_SELECTOR} input[type="file"][name="image-input"]`);
  if (toolbarInput && isViableImageInput(toolbarInput)) {
    debugLog("selected strict card toolbar input", { input: describeInput(toolbarInput) });
    return toolbarInput;
  }

  const isFeatureCard = contextKind === "feature"
    || Boolean(contextCard.closest('.gh-editor-feature-image-container, .gh-editor-feature-image'));

  const featureInput = contextCard.querySelector('.x-file-input[data-test-file-input="feature-image"] input[type="file"], input[data-test-file-input="feature-image"]');
  if (isFeatureCard && featureInput && isViableImageInput(featureInput)) {
    debugLog("selected feature image input", { input: describeInput(featureInput) });
    return featureInput;
  }

  const sharedToolbarInput = findSharedCardToolbarInput(contextCard, contextSourceSrc, contextKind);
  if (sharedToolbarInput) {
    return sharedToolbarInput;
  }

  const localInputs = Array.from(contextCard.querySelectorAll('input[type="file"][name="image-input"], input[type="file"]'))
    .filter(isViableImageInput);
  const anyLocal = localInputs.find((input) => !isLikelyAppendUploader(input) && !input.multiple);
  if (anyLocal) {
    debugLog("selected local card input fallback", { input: describeInput(anyLocal) });
    return anyLocal;
  }

  debugLog("no strict card input found");
  return null;
}

function getCaptionState(contextCard) {
  if (!(contextCard instanceof Element)) return null;

  const captionEditor = findCaptionEditor(contextCard);
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
  const captionEditor = findCaptionEditor(contextCard);
  if (!(captionEditor instanceof HTMLElement)) return;

  captionEditor.innerHTML = html;
  const editable = captionEditor.closest('[contenteditable="true"]') || captionEditor;
  editable.dispatchEvent(new Event("input", { bubbles: true }));
  editable.dispatchEvent(new Event("change", { bubbles: true }));
}


function resolveLiveContextCard(contextCard, contextImage, contextKind = "card", contextSourceSrc = "") {
  if (contextCard instanceof Element && contextCard.isConnected) return contextCard;

  const rememberedImage = globalThis.__ghostImageEditorContextImage;
  if (rememberedImage instanceof Element) {
    const rememberedCard = rememberedImage.closest(CARD_SELECTORS);
    if (rememberedCard instanceof Element) return rememberedCard;
  }

  if (contextImage instanceof Element) {
    const byContext = contextImage.closest(CARD_SELECTORS);
    if (byContext instanceof Element) return byContext;
  }

  if (contextSourceSrc) {
    const matchingImage = document.querySelector(`img[src="${escapeForAttributeSelector(contextSourceSrc)}"]`)
      || Array.from(document.querySelectorAll("img[src],img[currentSrc]")).find((img) => {
        const candidate = img.currentSrc || img.getAttribute("src") || "";
        return candidate === contextSourceSrc;
      });
    const matchingCard = matchingImage?.closest?.(CARD_SELECTORS);
    if (matchingCard instanceof Element) return matchingCard;
  }

  if (contextKind === "feature") {
    return document.querySelector(".gh-editor-feature-image-container, .gh-editor-feature-image") || null;
  }

  return document.querySelector(`${SELECTED_BODY_CARD_SELECTORS}, .kg-image-card, [data-kg-card="image"], [data-kg-card="gallery"]`) || null;
}

function findBestGhostImageInput(contextImage, contextCard = null, contextKind = "card", contextSourceSrc = "") {
  const allCandidates = Array.from(document.querySelectorAll('input[type="file"]')).filter(isViableImageInput);
  if (!allCandidates.length) {
    debugLog("no viable file inputs found in document");
    return null;
  }

  const sharedToolbarInput = findSharedCardToolbarInput(contextCard, contextSourceSrc, contextKind);
  if (sharedToolbarInput) {
    return sharedToolbarInput;
  }

  const contextRoot = getPreferredContextRoot(contextImage);
  const scopedCandidates = contextRoot
    ? allCandidates.filter((input) => contextRoot.contains(input))
    : allCandidates;
  const candidates = scopedCandidates.length ? scopedCandidates : allCandidates;
  const nonFeatureCandidates = contextKind === "feature"
    ? candidates
    : candidates.filter((input) => !isLikelyFeatureImageInput(input));
  const preferredCandidates = nonFeatureCandidates.length ? nonFeatureCandidates : candidates;

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
      return style.display !== "none" && style.visibility !== "hidden" && !isLikelyAppendUploader(input);
    });
    if (localVisible) {
      return localVisible;
    }
  }

  const visibleCandidates = preferredCandidates.filter((input) => {
    const style = window.getComputedStyle(input);
    return style.display !== "none" && style.visibility !== "hidden";
  });

  if (!(contextImage instanceof Element)) {
    debugLog("missing context image while resolving best ghost input");
    return null;
  }

  const pool = visibleCandidates.length ? visibleCandidates : preferredCandidates;
  const contextRect = contextImage.getBoundingClientRect();
  let best = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  pool.forEach((input) => {
    const rect = input.getBoundingClientRect();
    const dx = rect.left - contextRect.left;
    const dy = rect.top - contextRect.top;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const commonAncestorDepth = getCommonAncestorDepth(contextImage, input);
    const featurePenalty = contextKind === "feature" ? 0 : (isLikelyFeatureImageInput(input) ? 15000 : 0);
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

  if (isLikelyAppendUploader(best)) {
    debugLog("append uploader candidate rejected", { input: describeInput(best) });
    return null;
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

function buildOutputFile(canvas, originalName, mimeType, outputWidth, outputHeight, baseName = "") {
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

      const filename = buildOutputFilename(originalName, mimeType, baseName);

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
  const runtimeApi = EXTENSION_API?.runtime;
  if (!runtimeApi?.sendMessage) {
    return Promise.reject(new Error("Extension runtime API unavailable"));
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const resolveOnce = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error instanceof Error ? error : new Error(String(error)));
    };
    const handleResponse = (response) => {
      const lastError = runtimeApi.lastError;
      if (lastError) {
        rejectOnce(new Error(lastError.message));
        return;
      }

      if (!response?.ok || !Array.isArray(response.buffer)) {
        rejectOnce(new Error(response?.error || "Unknown fetch error"));
        return;
      }

      const array = new Uint8Array(response.buffer);
      resolveOnce(new Blob([array], { type: response.type || DEFAULT_OUTPUT_MIME }));
    };

    try {
      const maybePromise = runtimeApi.sendMessage({ type: "FETCH_IMAGE_BLOB", imageSrc }, handleResponse);
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.then(handleResponse).catch(rejectOnce);
      }
    } catch (error) {
      rejectOnce(error);
    }
  });
}

async function launchEditor({ imageSrc, originalFile, input = null, mode = "upload", contextImage = null, contextCard = null, contextKind = "card", contextSourceSrc = "", sourceImageUrl = "" }) {
  const originalDimensions = await getImageDimensionsFromElement(imageSrc, contextImage);
  const initialOrientation = originalDimensions.height > originalDimensions.width ? "portrait" : DEFAULT_ORIENTATION;
  const { widthValue: initialWidthValue, heightValue: initialHeightValue } = getInitialDimensionOverrides(
    originalDimensions.width,
    originalDimensions.height
  );
  const {
    modal,
    image,
    cancelButton,
    applyButton,
    widthInput,
    heightInput,
    formatInputs,
    ratioButtons,
    orientationButtons,
    fileNameInput,
    fileExtensionValue,
    fileValue,
    summaryValue
  } = createModal(imageSrc, {
    mode,
    fileName: originalFile.name,
    initialOrientation,
    originalWidth: originalDimensions.width,
    originalHeight: originalDimensions.height,
    originalSize: originalFile.size,
    originalFormat: originalFile.type || DEFAULT_OUTPUT_MIME
  });
  const originalSummary = {
    width: originalDimensions.width,
    height: originalDimensions.height,
    format: getFormatLabel(originalFile.type || DEFAULT_OUTPUT_MIME),
    size: formatBytes(originalFile.size)
  };
  let selectedRatioPreset = DEFAULT_RATIO_PRESET_ID;
  let selectedOrientation = initialOrientation;
  let previewVersion = 0;

  widthInput.value = initialWidthValue;
  heightInput.value = initialHeightValue;

  const cropper = new Cropper(image, {
    viewMode: 1,
    autoCropArea: 1,
    responsive: true,
    ready() {
      applyAspectRatioSelection({ shouldRefit: true });
      refreshSizePreview();
    }
  });

  function applyAspectRatioSelection({ shouldRefit = false } = {}) {
    const aspectRatio = resolveAspectRatio(selectedRatioPreset, selectedOrientation);
    cropper.setAspectRatio(aspectRatio);
    if (shouldRefit && Number.isFinite(aspectRatio)) {
      fitCropBoxToAspectRatio(cropper, aspectRatio);
    }

    setActiveButtons(ratioButtons, "ratioPreset", selectedRatioPreset);
    setActiveButtons(orientationButtons, "orientation", selectedOrientation);
  }

  function getResolvedOutputBaseName() {
    return sanitizeFileBasename(fileNameInput?.value || getBaseName(originalFile.name), sanitizeFileBasename(getBaseName(originalFile.name), "image"));
  }

  async function refreshSizePreview() {
    const requestVersion = ++previewVersion;
    const cropCanvas = cropper.getCroppedCanvas();
    if (!cropCanvas) return;
    const dimensions = resolveOutputDimensions(cropCanvas.width, cropCanvas.height, widthInput.value, heightInput.value);
    const selectedFormat = getSelectedFormatValue(formatInputs);
    const mimeType = OUTPUT_FORMATS[selectedFormat] || DEFAULT_OUTPUT_MIME;
    const outputBaseName = getResolvedOutputBaseName();
    const outputFile = await buildOutputFile(cropCanvas, originalFile.name, mimeType, dimensions.width, dimensions.height, outputBaseName);
    if (requestVersion !== previewVersion || !summaryValue) {
      return;
    }

    const outputFileName = outputFile?.name || buildOutputFilename(originalFile.name, mimeType, outputBaseName);
    if (fileExtensionValue) {
      fileExtensionValue.textContent = `.${inferExtensionFromMimeType(mimeType)}`;
    }
    if (fileValue) {
      fileValue.title = outputFileName;
    }

    renderSummary(summaryValue, originalSummary, {
      width: dimensions.width,
      height: dimensions.height,
      format: getFormatLabel(mimeType),
      size: formatBytes(outputFile?.size || 0)
    }, outputFileName);
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
    const selectedFormat = getSelectedFormatValue(formatInputs);
    const mimeType = OUTPUT_FORMATS[selectedFormat] || DEFAULT_OUTPUT_MIME;
    const outputBaseName = getResolvedOutputBaseName();
    const outputFile = await buildOutputFile(cropCanvas, originalFile.name, mimeType, outputWidth, outputHeight, outputBaseName);
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
    const initialCard = resolveLiveContextCard(contextCard, contextImage, contextKind, contextSourceSrc);
    const captionState = getCaptionState(initialCard);

    activateContextCard(contextImage);
    await new Promise((resolve) => setTimeout(resolve, 120));

    const liveCard = resolveLiveContextCard(contextCard, contextImage, contextKind, contextSourceSrc);
    if (isGalleryCard(liveCard)) {
      const galleryReplaced = await replaceGalleryImage(liveCard, contextImage, contextSourceSrc, outputFile, outputWidth, outputHeight);
      if (galleryReplaced) {
        return;
      }
      debugLog("gallery replacement fell back to generic Ghost input resolution");
    }

    const strictCardInput = findCardImageInput(liveCard, contextKind, contextSourceSrc);
    const ghostInput = strictCardInput || findBestGhostImageInput(contextImage, liveCard, contextKind, contextSourceSrc);
    debugLog("context apply input resolution", {
      strictCardInput: describeInput(strictCardInput),
      selectedInput: describeInput(ghostInput),
      sourceWasUnsplash,
      contextKind,
      contextSourceSrc
    });
    if (ghostInput) {
      updateInputWithFile(ghostInput, outputFile);
      if (sourceWasUnsplash) {
        setTimeout(() => updateUnsplashCaption(resolveLiveContextCard(contextCard, contextImage, contextKind, contextSourceSrc), captionState), 120);
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
  fileNameInput?.addEventListener("input", () => {
    const sanitizedValue = getResolvedOutputBaseName();
    if (fileNameInput.value !== sanitizedValue) {
      fileNameInput.value = sanitizedValue;
    }
    refreshSizePreview();
  });
  fileNameInput?.addEventListener("blur", () => {
    fileNameInput.value = getResolvedOutputBaseName();
    refreshSizePreview();
  });
  formatInputs.forEach((formatInput) => {
    formatInput.addEventListener("change", () => {
      refreshSizePreview();
    });
  });
  ratioButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedRatioPreset = button.dataset.ratioPreset || DEFAULT_RATIO_PRESET_ID;
      applyAspectRatioSelection({ shouldRefit: true });
      refreshSizePreview();
    });
  });
  orientationButtons.forEach((button) => {
    button.addEventListener("click", () => {
      selectedOrientation = button.dataset.orientation || DEFAULT_ORIENTATION;
      applyAspectRatioSelection({ shouldRefit: true });
      refreshSizePreview();
    });
  });
  image.addEventListener("crop", () => {
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
    const contextKind = globalThis.__ghostImageEditorContextKind || "card";
    const contextSourceSrc = globalThis.__ghostImageEditorContextSrc || "";
    launchEditor({
      imageSrc: objectUrl,
      originalFile: contextFile,
      mode: "context",
      contextImage,
      contextCard,
      contextKind,
      contextSourceSrc,
      sourceImageUrl: imageSrc
    });
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (error) {
    console.warn("[ghost-image-editor] failed to open context editor", error);
  }
};
}
