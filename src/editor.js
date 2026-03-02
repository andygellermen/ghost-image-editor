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
    outputFile: "Output file"
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
    outputFile: "Ausgabedatei"
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

function createModal(imageSrc, options = {}) {
  removeModal();

  const { mode = "upload", fileName = "image" } = options;
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
      <p class="editor-hint">${t("outputFile", "Output file")}: <strong>${fileName}</strong></p>
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
    formatSelect: modal.querySelector('[data-setting="format"]')
  };
}

function removeDuplicateEditorSections(modal) {
  const settings = modal.querySelectorAll(".editor-settings");
  settings.forEach((section, index) => {
    if (index > 0) section.remove();
  });

  const hints = modal.querySelectorAll(".editor-hint");
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

function findBestGhostImageInput(contextImage, contextCard = null) {
  const allCandidates = Array.from(document.querySelectorAll('input[type="file"]')).filter(isViableImageInput);
  if (!allCandidates.length) return null;

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

  if (!best) return null;

  if (isLikelyFeatureImageInput(best)) {
    const safer = pool.find((input) => !isLikelyFeatureImageInput(input) && !isLikelyAppendUploader(input));
    return safer || null;
  }

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

async function launchEditor({ imageSrc, originalFile, input = null, mode = "upload", contextImage = null, contextCard = null }) {
  const { modal, image, cancelButton, applyButton, widthInput, heightInput, formatSelect } = createModal(imageSrc, {
    mode,
    fileName: originalFile.name
  });

  formatSelect.value = inferExtensionFromMimeType(originalFile.type || DEFAULT_OUTPUT_MIME);

  const cropper = new Cropper(image, {
    viewMode: 1,
    autoCropArea: 1,
    responsive: true
  });

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

    activateContextCard(contextImage);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const ghostInput = findBestGhostImageInput(contextImage, contextCard);
    if (ghostInput) {
      updateInputWithFile(ghostInput, outputFile);
      return;
    }

    console.warn("[ghost-image-editor] no Ghost image input found; downloading file instead");
    downloadFile(outputFile);
  }

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
  launchEditor({ imageSrc, input, originalFile, mode: "upload" });
};

globalThis.openEditorFromContext = async function openEditorFromContext(imageSrc) {
  try {
    const response = await fetch(imageSrc, { credentials: "include" });
    if (!response.ok) {
      throw new Error(`Unable to load image: ${response.status}`);
    }

    const blob = await response.blob();
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
      contextCard
    });
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (error) {
    console.warn("[ghost-image-editor] failed to open context editor", error);
  }
};
