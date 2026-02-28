import Cropper from "cropperjs";
import "cropperjs/dist/cropper.css";
import "./editor.css";

const MODAL_ID = "ghost-image-editor-modal";

function removeModal() {
  document.getElementById(MODAL_ID)?.remove();
}

function createModal(imageSrc) {
  removeModal();

  const modal = document.createElement("div");
  modal.id = MODAL_ID;
  modal.className = "ghost-image-editor-modal";
  modal.innerHTML = `
    <div class="editor-box" role="dialog" aria-modal="true" aria-label="Image editor">
      <div class="editor-image-wrapper">
        <img class="editor-image" alt="Selected image" src="${imageSrc}">
      </div>
      <div class="editor-controls">
        <button type="button" data-action="cancel">Cancel</button>
        <button type="button" data-action="apply">Apply crop</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  return {
    modal,
    image: modal.querySelector(".editor-image"),
    cancelButton: modal.querySelector('[data-action="cancel"]'),
    applyButton: modal.querySelector('[data-action="apply"]')
  };
}

function updateInputWithFile(input, file) {
  const transfer = new DataTransfer();
  transfer.items.add(file);

  input.dataset.editorApplying = "true";
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

globalThis.openEditor = function openEditor(imageSrc, input, originalFile) {
  const { modal, image, cancelButton, applyButton } = createModal(imageSrc);
  const cropper = new Cropper(image, {
    viewMode: 1,
    autoCropArea: 1,
    responsive: true
  });

  function cleanup() {
    cropper.destroy();
    modal.remove();
  }

  cancelButton.addEventListener("click", () => {
    cleanup();
    updateInputWithFile(input, originalFile);
  });

  applyButton.addEventListener("click", () => {
    const canvas = cropper.getCroppedCanvas();

    canvas.toBlob((blob) => {
      if (!blob) {
        cleanup();
        updateInputWithFile(input, originalFile);
        return;
      }

      const croppedFile = new File([blob], originalFile.name, {
        type: originalFile.type || "image/png",
        lastModified: Date.now()
      });

      cleanup();
      updateInputWithFile(input, croppedFile);
    }, originalFile.type || "image/png");
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      cleanup();
      updateInputWithFile(input, originalFile);
    }
  });
};

globalThis.openEditorFromContext = function openEditorFromContext(imageSrc) {
  window.open(imageSrc, "_blank", "noopener,noreferrer");
};
