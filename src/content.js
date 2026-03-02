const EXTENSION_LOG_PREFIX = "[ghost-image-editor]";
const CONTEXT_CARD_SELECTORS = ".kg-card, .kg-image-card, figure, [data-kg-card], .koenig-card, .gh-editor-feature-image-container, .gh-editor-feature-image";

let manifestVersion = "unknown";
try {
  manifestVersion = chrome.runtime.getManifest().version;
} catch (error) {
  console.warn(`${EXTENSION_LOG_PREFIX} runtime unavailable while reading manifest version`, error);
}
console.info(`${EXTENSION_LOG_PREFIX} content script loaded v${manifestVersion}`);

function rememberContextImageTarget(event) {
  const target = event.target;
  if (!(target instanceof HTMLImageElement)) {
    globalThis.__ghostImageEditorContextImage = null;
    globalThis.__ghostImageEditorContextCard = null;
    globalThis.__ghostImageEditorContextKind = null;
    return;
  }

  const contextCard = target.closest(CONTEXT_CARD_SELECTORS) || null;
  const contextKind = contextCard?.closest?.(".gh-editor-feature-image-container, .gh-editor-feature-image") ? "feature" : "card";

  globalThis.__ghostImageEditorContextImage = target;
  globalThis.__ghostImageEditorContextCard = contextCard;
  globalThis.__ghostImageEditorContextKind = contextKind;
}

document.addEventListener("contextmenu", rememberContextImageTarget, true);

function restoreOriginalFile(input, file) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.dataset.editorApplying = "true";
  input.files = transfer.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function attachUploadListener() {
  const inputs = document.querySelectorAll('input[type="file"]');

  inputs.forEach((input) => {
    if (input.dataset.editorAttached) return;
    input.dataset.editorAttached = "true";

    input.addEventListener("change", (event) => {
      if (!event.isTrusted) {
        return;
      }

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
      event.stopPropagation();
      event.stopImmediatePropagation();

      const reader = new FileReader();
      reader.onload = () => {
        try {
          openEditor(reader.result, input, file);
        } catch (error) {
          console.warn(`${EXTENSION_LOG_PREFIX} failed to open editor; restoring original file`, error);
          restoreOriginalFile(input, file);
        }
      };
      reader.readAsDataURL(file);
    }, true);
  });
}

try {
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
} catch (error) {
  console.warn(`${EXTENSION_LOG_PREFIX} runtime listener unavailable`, error);
}

const observer = new MutationObserver(() => attachUploadListener());
observer.observe(document.body, { childList: true, subtree: true });

attachUploadListener();
