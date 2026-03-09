const EXTENSION_LOG_PREFIX = "[ghost-image-editor]";
const CONTEXT_CARD_SELECTORS = ".kg-card, .kg-image-card, figure, [data-kg-card], .koenig-card, .gh-editor-feature-image-container, .gh-editor-feature-image";
const ARTICLE_IMAGE_CARD_SELECTORS = '[data-kg-card="image"], .kg-image-card';
const FEATURE_IMAGE_SELECTORS = ".gh-editor-feature-image-container, .gh-editor-feature-image";

const UNSPLASH_HOST = "images.unsplash.com";
const autoOpenedUnsplashImages = new Set();

function isUnsplashImage(url) {
  try {
    const parsed = new URL(url, window.location.href);
    return parsed.hostname === UNSPLASH_HOST;
  } catch (_error) {
    return false;
  }
}

function isArticleImageCandidate(image) {
  if (!(image instanceof HTMLImageElement)) return false;
  if (image.closest(FEATURE_IMAGE_SELECTORS)) return false;
  return Boolean(image.closest(ARTICLE_IMAGE_CARD_SELECTORS));
}

function openEditorForUnsplashImage(image) {
  if (!(image instanceof HTMLImageElement)) return;
  if (!isArticleImageCandidate(image)) return;

  const src = image.currentSrc || image.src || "";
  if (!src || !isUnsplashImage(src) || autoOpenedUnsplashImages.has(src)) return;

  const card = image.closest(CONTEXT_CARD_SELECTORS);
  const kind = "card";

  autoOpenedUnsplashImages.add(src);
  globalThis.__ghostImageEditorContextImage = image;
  globalThis.__ghostImageEditorContextCard = card || null;
  globalThis.__ghostImageEditorContextKind = kind;
  globalThis.__ghostImageEditorContextSrc = src;

  const openEditorFromContext = globalThis.openEditorFromContext || window.openEditorFromContext;
  if (typeof openEditorFromContext === "function") {
    setTimeout(() => openEditorFromContext(src), 60);
    return;
  }

  autoOpenedUnsplashImages.delete(src);
}

function primeUnsplashImages() {
  document.querySelectorAll('img[src*="images.unsplash.com"]').forEach((image) => {
    if (image instanceof HTMLImageElement && isArticleImageCandidate(image)) {
      const src = image.currentSrc || image.src || "";
      if (src) autoOpenedUnsplashImages.add(src);
    }
  });
}

function scanUnsplashImagesInNode(node) {
  if (!(node instanceof Element)) return;

  if (node.matches("img[src*='images.unsplash.com']")) {
    openEditorForUnsplashImage(node);
  }

  node.querySelectorAll('img[src*="images.unsplash.com"]').forEach((image) => {
    openEditorForUnsplashImage(image);
  });
}

let manifestVersion = "unknown";
try {
  manifestVersion = chrome.runtime.getManifest().version;
} catch (error) {
  console.warn(`${EXTENSION_LOG_PREFIX} runtime unavailable while reading manifest version`, error);
}
console.info(`${EXTENSION_LOG_PREFIX} content script loaded v${manifestVersion}`);

function findContextImageFromTarget(target) {
  if (target instanceof HTMLImageElement) return target;
  if (!(target instanceof Element)) return null;

  const insideImage = target.closest("img");
  if (insideImage instanceof HTMLImageElement) return insideImage;

  const container = target.closest(CONTEXT_CARD_SELECTORS);
  const containerImage = container?.querySelector?.("img[src], img[currentSrc]");
  return containerImage instanceof HTMLImageElement ? containerImage : null;
}

function rememberContextImageTarget(event) {
  const target = findContextImageFromTarget(event.target);
  if (!(target instanceof HTMLImageElement)) {
    globalThis.__ghostImageEditorContextImage = null;
    globalThis.__ghostImageEditorContextCard = null;
    globalThis.__ghostImageEditorContextKind = null;
    globalThis.__ghostImageEditorContextSrc = "";
    return;
  }

  const contextCard = target.closest(CONTEXT_CARD_SELECTORS) || null;
  const contextKind = contextCard?.closest?.(FEATURE_IMAGE_SELECTORS) ? "feature" : "card";

  globalThis.__ghostImageEditorContextImage = target;
  globalThis.__ghostImageEditorContextCard = contextCard;
  globalThis.__ghostImageEditorContextKind = contextKind;
  globalThis.__ghostImageEditorContextSrc = target.currentSrc || target.src || "";
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


function resolveEditorHook() {
  return globalThis.openEditorFromContext || window.openEditorFromContext;
}

function tryOpenContextEditorWithRetry(imageSrc, attempts = 12, delayMs = 50) {
  if (!imageSrc) return;
  const hook = resolveEditorHook();
  if (typeof hook === "function") {
    hook(imageSrc);
    return;
  }

  if (attempts <= 0) {
    console.warn(`${EXTENSION_LOG_PREFIX} openEditorFromContext hook is missing; skipped opening fallback tab`);
    return;
  }

  setTimeout(() => tryOpenContextEditorWithRetry(imageSrc, attempts - 1, delayMs), delayMs);
}

try {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "OPEN_EDITOR_FROM_CONTEXT") return;
    const contextSrc = globalThis.__ghostImageEditorContextSrc || globalThis.__ghostImageEditorContextImage?.currentSrc || globalThis.__ghostImageEditorContextImage?.src || "";
    const imageSrc = message.imageSrc || contextSrc;
    tryOpenContextEditorWithRetry(imageSrc);
  });
} catch (error) {
  console.warn(`${EXTENSION_LOG_PREFIX} runtime listener unavailable`, error);
}

const observer = new MutationObserver((mutations) => {
  attachUploadListener();
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => scanUnsplashImagesInNode(node));
  });
});
observer.observe(document.body, { childList: true, subtree: true });

attachUploadListener();
primeUnsplashImages();
