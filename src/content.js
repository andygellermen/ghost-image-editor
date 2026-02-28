const EXTENSION_LOG_PREFIX = "[ghost-image-editor]";

console.info(`${EXTENSION_LOG_PREFIX} content script loaded`, chrome.runtime.getManifest().version);

function attachUploadListener() {
  const inputs = document.querySelectorAll('input[type="file"]');

  inputs.forEach((input) => {
    if (input.dataset.editorAttached) return;
    input.dataset.editorAttached = "true";

    input.addEventListener("change", (event) => {
      if (input.dataset.editorApplying === "true") {
        delete input.dataset.editorApplying;
        return;
      }

      const file = event.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      const openEditor = globalThis.openEditor || window.openEditor;
      if (typeof openEditor !== "function") {
        console.warn(`${EXTENSION_LOG_PREFIX} openEditor hook is missing; skipping crop modal`);
        return;
      }

      event.preventDefault();

      const reader = new FileReader();
      reader.onload = () => openEditor(reader.result, input, file);
      reader.readAsDataURL(file);
    });
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "OPEN_EDITOR_FROM_CONTEXT") return;
  const openEditorFromContext = globalThis.openEditorFromContext || window.openEditorFromContext;
  if (typeof openEditorFromContext === "function") {
    openEditorFromContext(message.imageSrc);
    return;
  }

  console.warn(`${EXTENSION_LOG_PREFIX} openEditorFromContext hook is missing; opening image URL directly`);
  window.open(message.imageSrc, "_blank", "noopener,noreferrer");
});

const observer = new MutationObserver(() => attachUploadListener());
observer.observe(document.body, { childList: true, subtree: true });

attachUploadListener();
