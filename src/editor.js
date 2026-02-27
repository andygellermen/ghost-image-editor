function openEditor(imageSrc, input, originalFile) {

  const modal = document.createElement("div");
  modal.className = "ghost-image-editor-modal";

  modal.innerHTML = `
    <div class="editor-box">
      <img id="editor-image" src="${imageSrc}">
      <div class="editor-controls">
        <label>${chrome.i18n.getMessage("format")}</label>
        <select id="format">
          <option value="image/jpeg">JPG</option>
          <option value="image/png">PNG</option>
          <option value="image/webp" selected>WebP</option>
        </select>
        <button id="saveImage">${chrome.i18n.getMessage("save")}</button>
        <button id="cancelEdit">${chrome.i18n.getMessage("cancel")}</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const cropper = new Cropper(document.getElementById("editor-image"), {
    viewMode: 1,
    autoCropArea: 1
  });

  document.getElementById("saveImage").onclick = () => {
    const format = document.getElementById("format").value;

    cropper.getCroppedCanvas({
      maxWidth: 2000,
      maxHeight: 2000
    }).toBlob(blob => {

      const newFile = new File([blob], originalFile?.name || "edited-image", { type: format });

      if (input) {
        const dt = new DataTransfer();
        dt.items.add(newFile);
        input.files = dt.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }

      modal.remove();

    }, format, 0.9);
  };

  document.getElementById("cancelEdit").onclick = () => modal.remove();
}

window.openEditorFromContext = function(src) {
  fetch(src)
    .then(res => res.blob())
    .then(blob => {
      const reader = new FileReader();
      reader.onload = () => openEditor(reader.result, null, blob);
      reader.readAsDataURL(blob);
    });
};