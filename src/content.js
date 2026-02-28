const EXTENSION_LOG_PREFIX = "[ghost-image-editor]";

const manifestVersion = chrome.runtime.getManifest().version;
console.info(`${EXTENSION_LOG_PREFIX} content script loaded v${manifestVersion}`);


if (!window.__ghostImageEditorBridgeReady) {
  window.__ghostImageEditorBridgeReady = true;
  const bridgeScript = document.createElement("script");
  bridgeScript.textContent = `
    window.openEditorFromContext = window.openEditorFromContext || function (imageSrc) {
      window.postMessage({ source: "ghost-image-editor", type: "OPEN_EDITOR_FROM_CONTEXT", imageSrc }, "*");
    };
  `;
  (document.head || document.documentElement).appendChild(bridgeScript);
  bridgeScript.remove();
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== "ghost-image-editor") return;
  if (event.data?.type !== "OPEN_EDITOR_FROM_CONTEXT") return;

  const openEditorFromContext = globalThis.openEditorFromContext || window.openEditorFromContext;
  if (typeof openEditorFromContext === "function") {
    openEditorFromContext(event.data.imageSrc);
  }
});

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
      reader.onload = () => window.openEditor(reader.result, input, file);
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
