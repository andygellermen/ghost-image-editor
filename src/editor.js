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

  const modal = document.createElement("div");
  modal.id = MODAL_ID;
  modal.className = "ghost-image-editor-modal";
  modal.innerHTML = `
    <div class="editor-box" role="dialog" aria-modal="true" aria-label="Image editor">
      <div class="editor-image-wrapper">
        <img class="editor-image" alt="Selected image" src="${imageSrc}">
      </div>
      <div class="editor-settings">
        <label>
          Width
          <input type="number" min="1" step="1" data-setting="width" placeholder="Auto">
        </label>
        <label>
          Height
          <input type="number" min="1" step="1" data-setting="height" placeholder="Auto">
        </label>
        <label>
          Format
          <select data-setting="format">
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="webp">WEBP</option>
          </select>
        </label>
      </div>
      <div class="editor-controls">
        <button type="button" data-action="cancel">Cancel</button>
        <button type="button" data-action="apply">${mode === "context" ? "Apply to Ghost" : "Apply crop"}</button>
      </div>
      <p class="editor-hint">Output file: <strong>${fileName}</strong></p>
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

function findBestGhostImageInput() {
  const candidates = Array.from(document.querySelectorAll('input[type="file"]'));
  return candidates.find((input) => {
    if (input.disabled) return false;
    const accept = (input.getAttribute("accept") || "").toLowerCase();
    return accept.includes("image") || accept === "";
  }) || null;
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

async function launchEditor({ imageSrc, originalFile, input = null, mode = "upload" }) {
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

    const ghostInput = findBestGhostImageInput();
    if (ghostInput) {
      updateInputWithFile(ghostInput, outputFile);
      return;
    }

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
    if (!blob.type.startsWith("image/")) {
      throw new Error("Selected resource is not an image");
    }

    const url = new URL(imageSrc, window.location.href);
    const sourceName = url.pathname.split("/").pop() || "image";
    const contextFile = new File([blob], sourceName, {
      type: blob.type || DEFAULT_OUTPUT_MIME,
      lastModified: Date.now()
    });

    launchEditor({
      imageSrc: URL.createObjectURL(blob),
      originalFile: contextFile,
      mode: "context"
    });
  } catch (error) {
    console.warn("[ghost-image-editor] failed to open context editor", error);
  }
};
