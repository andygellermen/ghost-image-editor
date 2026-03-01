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

function t(key, fallback) {
  return chrome.i18n.getMessage(key) || fallback;
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

function findBestGhostImageInput(contextImage) {
  const candidates = Array.from(document.querySelectorAll('input[type="file"]')).filter(isViableImageInput);
  if (!candidates.length) return null;

  if (contextImage instanceof Element) {
    const scopedContainer = contextImage.closest("figure, .kg-image-card, .koenig-card, .kg-card");
    if (scopedContainer) {
      const localInput = scopedContainer.querySelector('input[type="file"]');
      if (localInput && isViableImageInput(localInput)) {
        return localInput;
      }
    }

    const visibleCandidates = candidates.filter((input) => {
      const style = window.getComputedStyle(input);
      return style.display !== "none" && style.visibility !== "hidden";
    });

    if (visibleCandidates.length) {
      const contextRect = contextImage.getBoundingClientRect();
      let best = visibleCandidates[0];
      let bestDistance = Number.POSITIVE_INFINITY;
      visibleCandidates.forEach((input) => {
        const rect = input.getBoundingClientRect();
        const dx = rect.left - contextRect.left;
        const dy = rect.top - contextRect.top;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < bestDistance) {
          best = input;
          bestDistance = distance;
        }
      });
      return best;
    }
  }

  return candidates[0];
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

async function launchEditor({ imageSrc, originalFile, input = null, mode = "upload", contextImage = null }) {
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
    const outputWidth = Number.parseInt(widthInput.value, 10) || cropCanvas.width;
    const outputHeight = Number.parseInt(heightInput.value, 10) || cropCanvas.height;
    const selectedFormat = formatSelect.value;
    const mimeType = OUTPUT_FORMATS[selectedFormat] || DEFAULT_OUTPUT_MIME;

    const outputFile = await buildOutputFile(cropCanvas, originalFile.name, mimeType, outputWidth, outputHeight);
    cleanup();

    if (!outputFile) {
      if (input) {
        updateInputWithFile(input, originalFile);
      }
      return;
    }

    if (input) {
      updateInputWithFile(input, outputFile);
      return;
    }

    const ghostInput = findBestGhostImageInput(contextImage);
    if (ghostInput) {
      updateInputWithFile(ghostInput, outputFile);
      return;
    }

    console.warn("[ghost-image-editor] no Ghost image input found; downloading file instead");
    downloadFile(outputFile);
  }

  cancelButton.addEventListener("click", () => {
    cleanup();
    if (input) {
      updateInputWithFile(input, originalFile);
    }
  });

  applyButton.addEventListener("click", () => {
    apply();
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      cleanup();
      if (input) {
        updateInputWithFile(input, originalFile);
      }
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
    launchEditor({
      imageSrc: objectUrl,
      originalFile: contextFile,
      mode: "context",
      contextImage
    });
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  } catch (error) {
    console.warn("[ghost-image-editor] failed to open context editor", error);
  }
};
