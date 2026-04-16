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
    || null;
}

const EXTENSION_API = resolveExtensionApi();
const EXTENSION_LOG_PREFIX = "[ghost-image-editor]";
const CONTEXT_CARD_SELECTORS = ".kg-card, .kg-image-card, figure, [data-kg-card], .koenig-card, .gh-editor-feature-image-container, .gh-editor-feature-image";
const ARTICLE_IMAGE_CARD_SELECTORS = '[data-kg-card="image"], .kg-image-card';
const FEATURE_IMAGE_SELECTORS = ".gh-editor-feature-image-container, .gh-editor-feature-image";
const IMAGE_TOOLBAR_SELECTOR = '[data-kg-card-toolbar="image"]';
const IMAGE_SELECTOR = "img[src], img[currentSrc]";

const UNSPLASH_HOST = "images.unsplash.com";
const autoOpenedUnsplashImages = new Set();

function isGermanLocale() {
  const language = (document.documentElement.lang || navigator.language || "en").toLowerCase();
  return language.startsWith("de");
}

function getUiText(key) {
  const locale = isGermanLocale() ? "de" : "en";
  const copy = {
    editImage: {
      de: "Bild bearbeiten",
      en: "Edit image"
    }
  };

  return copy[key]?.[locale] || copy[key]?.en || key;
}

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

function clearRememberedContext() {
  globalThis.__ghostImageEditorContextImage = null;
  globalThis.__ghostImageEditorContextCard = null;
  globalThis.__ghostImageEditorContextKind = null;
  globalThis.__ghostImageEditorContextSrc = "";
}

function rememberContextImage(image) {
  if (!(image instanceof HTMLImageElement)) {
    clearRememberedContext();
    return false;
  }

  const src = image.currentSrc || image.src || "";
  const card = image.closest(CONTEXT_CARD_SELECTORS);
  const kind = card?.closest?.(FEATURE_IMAGE_SELECTORS) ? "feature" : "card";
  globalThis.__ghostImageEditorContextImage = image;
  globalThis.__ghostImageEditorContextCard = card || null;
  globalThis.__ghostImageEditorContextKind = kind;
  globalThis.__ghostImageEditorContextSrc = src;

  return Boolean(src);
}

function openEditorForRememberedImage(image) {
  if (!rememberContextImage(image)) return;
  const src = globalThis.__ghostImageEditorContextSrc || "";
  if (!src) return;
  tryOpenContextEditorWithRetry(src);
}

function openEditorForUnsplashImage(image) {
  if (!(image instanceof HTMLImageElement)) return;
  if (!isArticleImageCandidate(image)) return;

  const src = image.currentSrc || image.src || "";
  if (!src || !isUnsplashImage(src) || autoOpenedUnsplashImages.has(src)) return;

  autoOpenedUnsplashImages.add(src);
  rememberContextImage(image);

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
  manifestVersion = EXTENSION_API?.runtime?.getManifest?.().version ?? "unknown";
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
  rememberContextImage(target);
}

document.addEventListener("contextmenu", rememberContextImageTarget, true);

function findImageForToolbar(toolbar) {
  if (!(toolbar instanceof Element)) return null;

  const localCard = toolbar.closest(CONTEXT_CARD_SELECTORS);
  const localImage = localCard?.querySelector?.(IMAGE_SELECTOR);
  if (localImage instanceof HTMLImageElement) return localImage;

  const selectedCard = document.querySelector('[data-kg-card="image"][data-kg-card-selected="true"], .kg-image-card[data-kg-card-selected="true"], .gh-editor-feature-image-container, .gh-editor-feature-image');
  const selectedImage = selectedCard?.querySelector?.(IMAGE_SELECTOR);
  if (selectedImage instanceof HTMLImageElement) return selectedImage;

  const rememberedImage = globalThis.__ghostImageEditorContextImage;
  if (rememberedImage instanceof HTMLImageElement && rememberedImage.isConnected) return rememberedImage;

  return null;
}

function createInlineEditToolbarItem(toolbarList) {
  if (!(toolbarList instanceof HTMLElement)) return;
  if (toolbarList.querySelector('[data-ghost-image-editor-inline-action="edit"]')) return;

  const label = getUiText("editImage");
  const item = document.createElement("li");
  item.className = "group relative m-0 flex p-0 first:m-0";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "my-1 flex h-8 w-9 cursor-pointer items-center justify-center rounded-md transition hover:bg-grey-200/80 dark:bg-grey-950 dark:hover:bg-grey-900 bg-white";
  button.setAttribute("aria-label", label);
  button.setAttribute("data-kg-active", "false");
  button.dataset.ghostImageEditorInlineAction = "edit";
  button.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="size-4 overflow-visible transition stroke-[2.5] text-black dark:text-white">
      <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="M4 20h4l10-10a2.12 2.12 0 0 0-3-3L5 17v3Z"></path>
      <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" d="m13.5 6.5 4 4"></path>
    </svg>
  `;

  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  });

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const toolbar = button.closest(IMAGE_TOOLBAR_SELECTOR);
    const image = findImageForToolbar(toolbar);
    if (!(image instanceof HTMLImageElement)) {
      console.warn(`${EXTENSION_LOG_PREFIX} inline edit button could not resolve an image target`);
      return;
    }

    openEditorForRememberedImage(image);
  });

  const tooltip = document.createElement("div");
  tooltip.className = "invisible absolute -top-8 left-1/2 z-[1000] flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-md bg-black py-1 font-sans text-2xs font-medium text-white group-hover:visible dark:bg-grey-900 px-[1rem]";
  const tooltipLabel = document.createElement("span");
  tooltipLabel.textContent = label;
  tooltip.appendChild(tooltipLabel);

  item.append(button, tooltip);
  toolbarList.insertBefore(item, toolbarList.firstElementChild);
}

function ensureInlineEditButtons(root = document) {
  const lists = [];

  if (root instanceof Element && root.matches(`${IMAGE_TOOLBAR_SELECTOR} ul`)) {
    lists.push(root);
  }

  if (root instanceof Element || root instanceof Document) {
    lists.push(...root.querySelectorAll(`${IMAGE_TOOLBAR_SELECTOR} ul`));
  }

  lists.forEach((toolbarList) => createInlineEditToolbarItem(toolbarList));
}

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
  EXTENSION_API?.runtime?.onMessage?.addListener?.((message) => {
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
  ensureInlineEditButtons();
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      scanUnsplashImagesInNode(node);
      if (node instanceof Element) {
        ensureInlineEditButtons(node);
      }
    });
  });
});
observer.observe(document.body, { childList: true, subtree: true });

attachUploadListener();
primeUnsplashImages();
ensureInlineEditButtons();
}
