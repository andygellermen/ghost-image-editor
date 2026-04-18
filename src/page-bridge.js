{
const READY_ATTRIBUTE = "data-ghost-image-editor-page-bridge-ready";

if (document.documentElement?.getAttribute(READY_ATTRIBUTE) === "1") {
  // already injected
} else {
const LOG_PREFIX = "[ghost-image-editor]";
const REQUEST_TYPE = "ghost-image-editor:gallery-replace-request";
const RESPONSE_TYPE = "ghost-image-editor:gallery-replace-response";
const REQUEST_SOURCE = "ghost-image-editor-extension";
const RESPONSE_SOURCE = "ghost-image-editor-page";
const DEBUG_QUERY_PARAM = "ghostImageEditorDebug";
const DEBUG_STORAGE_KEY = "ghost-image-editor-debug";
const GALLERY_CARD_SELECTOR = '[data-kg-card="gallery"]';
const GALLERY_IMAGE_TARGET_SELECTORS = '[data-testid="gallery-image"], [data-image="true"]';

function isDebugEnabled() {
  try {
    if (globalThis.__ghostImageEditorDebug === true) return true;
    const url = new URL(window.location.href);
    if (url.searchParams.get(DEBUG_QUERY_PARAM) === "1") return true;
    return window.localStorage?.getItem(DEBUG_STORAGE_KEY) === "1";
  } catch (_error) {
    return false;
  }
}

function debugLog(message, details = null) {
  if (!isDebugEnabled()) return;
  if (details === null || details === undefined) {
    console.info(`${LOG_PREFIX} [page-bridge] ${message}`);
    return;
  }
  console.info(`${LOG_PREFIX} [page-bridge] ${message}`, details);
}

function normalizeImageUrl(value) {
  if (!value) return "";
  try {
    return new URL(value, window.location.href).href;
  } catch (_error) {
    return String(value);
  }
}

function isSameImageUrl(left, right) {
  return Boolean(left && right) && normalizeImageUrl(left) === normalizeImageUrl(right);
}

function getImageSource(image) {
  if (!(image instanceof HTMLImageElement)) return "";
  return image.currentSrc || image.getAttribute("src") || "";
}

function getReactFiber(element) {
  if (!(element instanceof Element)) return null;
  const reactKey = Object.keys(element).find((key) => key.startsWith("__reactFiber$") || key.startsWith("__reactInternalInstance$"));
  return reactKey ? element[reactKey] : null;
}

function findReactAncestorFiber(element, predicate) {
  let fiber = getReactFiber(element);
  while (fiber) {
    if (predicate(fiber)) return fiber;
    fiber = fiber.return || null;
  }
  return null;
}

function isGalleryImagesState(value) {
  return Array.isArray(value) && (value.length === 0 || value.every((image) => {
    return image && typeof image === "object" && (
      typeof image.src === "string"
      || typeof image.previewSrc === "string"
      || typeof image.fileName === "string"
    );
  }));
}

function findGalleryImagesHook(fiber) {
  let hook = fiber?.memoizedState || null;
  while (hook) {
    if (isGalleryImagesState(hook.memoizedState)) {
      return hook;
    }
    hook = hook.next || null;
  }
  return null;
}

function findGalleryStateFiber(element) {
  return findReactAncestorFiber(element, (fiber) => {
    return typeof fiber?.memoizedProps?.nodeKey === "string" && Boolean(findGalleryImagesHook(fiber));
  });
}

function findGalleryPropsFiber(element) {
  return findReactAncestorFiber(element, (fiber) => {
    const props = fiber?.memoizedProps;
    return Array.isArray(props?.images) && (
      typeof props?.onFileChange === "function"
      || typeof props?.uploader?.upload === "function"
    );
  });
}

function getLexicalEditorForElement(element) {
  const root = element?.closest?.("[data-lexical-editor]");
  return root?.__lexicalEditor || root?._lexicalEditor || null;
}

function getGalleryProbeElement(contextCard) {
  if (!(contextCard instanceof Element)) return null;
  return contextCard.querySelector('[data-testid="gallery-container"]')
    || contextCard.querySelector("[data-gallery]")
    || contextCard;
}

function cloneGalleryImages(images) {
  return images.map((image) => ({ ...image }));
}

function getGalleryRuntime(contextCard) {
  const probe = getGalleryProbeElement(contextCard);
  if (!(probe instanceof Element)) return null;

  const editor = getLexicalEditorForElement(probe);
  const getStateFiber = () => findGalleryStateFiber(probe);
  const getPropsFiber = () => findGalleryPropsFiber(probe);
  const getNodeKey = () => getStateFiber()?.memoizedProps?.nodeKey || "";
  const getImages = () => {
    const hook = findGalleryImagesHook(getStateFiber());
    return isGalleryImagesState(hook?.memoizedState) ? hook.memoizedState : [];
  };
  const setImages = (nextImages) => {
    const hook = findGalleryImagesHook(getStateFiber());
    const dispatch = hook?.queue?.dispatch;
    if (typeof dispatch !== "function") return false;
    dispatch(cloneGalleryImages(nextImages));
    return true;
  };
  const commitImages = (nextImages) => {
    const nodeKey = getNodeKey();
    if (!editor || typeof editor.update !== "function" || !nodeKey) return false;

    let didUpdate = false;
    editor.update(() => {
      const nodeMap = editor._editorState?._nodeMap || editor._pendingEditorState?._nodeMap;
      const node = nodeMap?.get?.(nodeKey) || null;
      const writableNode = node?.getWritable?.() || node;
      if (writableNode && typeof writableNode.setImages === "function") {
        writableNode.setImages(cloneGalleryImages(nextImages));
        didUpdate = true;
      }
    });

    return didUpdate;
  };
  const uploadImage = async (file) => {
    const uploader = getPropsFiber()?.memoizedProps?.uploader;
    if (typeof uploader?.upload !== "function") return null;
    const result = await uploader.upload([file]);
    return Array.isArray(result) ? (result[0] || null) : null;
  };

  return {
    commitImages,
    getImages,
    getNodeKey,
    setImages,
    uploadImage
  };
}

function getCardImageSources(card) {
  if (!(card instanceof Element)) return [];
  return Array.from(card.querySelectorAll("img[src], img[currentSrc]"))
    .map(getImageSource)
    .filter(Boolean);
}

function isElementVisible(element) {
  if (!(element instanceof Element)) return false;
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") return false;
  return element.getClientRects().length > 0;
}

function scoreGalleryCard(card, payload) {
  let score = 0;
  const { cardImageSources = [], contextSourceSrc = "" } = payload;

  if (card.getAttribute("data-kg-card-selected") === "true") score += 400;
  if (isElementVisible(card)) score += 300;
  if (card.closest('[data-secondary-instance="true"]')) score -= 2000;

  const domSources = getCardImageSources(card);
  if (contextSourceSrc && domSources.some((source) => isSameImageUrl(source, contextSourceSrc))) {
    score += 1200;
  }

  if (cardImageSources.length) {
    const overlap = cardImageSources.filter((source) => domSources.some((candidate) => isSameImageUrl(candidate, source))).length;
    score += overlap * 150;
  }

  const runtime = getGalleryRuntime(card);
  const runtimeImages = runtime?.getImages?.() || [];
  if (contextSourceSrc && runtimeImages.some((image) => isSameImageUrl(image?.src, contextSourceSrc) || isSameImageUrl(image?.previewSrc, contextSourceSrc))) {
    score += 1400;
  }

  if (!runtimeImages.length) score -= 500;

  return score;
}

function resolveGalleryCard(payload) {
  const cards = Array.from(document.querySelectorAll(GALLERY_CARD_SELECTOR));
  if (!cards.length) return null;

  let bestCard = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  cards.forEach((card) => {
    const score = scoreGalleryCard(card, payload);
    if (score > bestScore) {
      bestScore = score;
      bestCard = card;
    }
  });

  debugLog("resolved gallery card", { bestScore, cardSelected: bestCard?.getAttribute?.("data-kg-card-selected") || "false" });
  return bestCard;
}

function findGalleryImageIndex(images, contextSourceSrc = "", galleryDomIndex = -1) {
  if (contextSourceSrc) {
    const matchIndex = images.findIndex((image) => {
      return isSameImageUrl(image?.src, contextSourceSrc) || isSameImageUrl(image?.previewSrc, contextSourceSrc);
    });
    if (matchIndex !== -1) return matchIndex;
  }

  if (Number.isInteger(galleryDomIndex) && galleryDomIndex >= 0 && galleryDomIndex < images.length) {
    return galleryDomIndex;
  }

  return -1;
}

async function fileFromDataUrl(dataUrl, fileName, mimeType, lastModified) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], fileName, {
    type: mimeType || blob.type || "image/webp",
    lastModified: Number.isFinite(lastModified) ? lastModified : Date.now()
  });
}

async function replaceGalleryImage(payload) {
  const contextCard = resolveGalleryCard(payload);
  if (!(contextCard instanceof Element)) {
    throw new Error("No matching gallery card found");
  }

  const runtime = getGalleryRuntime(contextCard);
  if (!runtime) {
    throw new Error("Gallery runtime unavailable");
  }

  const beforeImages = runtime.getImages();
  if (!beforeImages.length) {
    throw new Error("Gallery images are unavailable");
  }

  const originalIndex = findGalleryImageIndex(beforeImages, payload.contextSourceSrc, payload.galleryDomIndex);
  if (originalIndex === -1) {
    throw new Error("Target gallery image could not be resolved");
  }

  const file = await fileFromDataUrl(payload.fileDataUrl, payload.fileName, payload.mimeType, payload.lastModified);
  const uploadResult = await runtime.uploadImage(file);
  if (!uploadResult?.url) {
    throw new Error("Ghost gallery upload returned no URL");
  }

  const originalImage = beforeImages[originalIndex];
  const replacementImage = {
    ...originalImage,
    fileName: uploadResult.fileName || file.name,
    height: payload.outputHeight || originalImage.height,
    previewSrc: uploadResult.url,
    src: uploadResult.url,
    width: payload.outputWidth || originalImage.width
  };

  const nextImages = cloneGalleryImages(beforeImages);
  nextImages[originalIndex] = replacementImage;

  const stateUpdated = runtime.setImages(nextImages);
  const nodeUpdated = runtime.commitImages(nextImages);
  debugLog("gallery image replaced", {
    nodeKey: runtime.getNodeKey(),
    originalIndex,
    nodeUpdated,
    stateUpdated,
    uploadedUrl: uploadResult.url
  });

  if (!stateUpdated && !nodeUpdated) {
    throw new Error("Gallery state update failed");
  }

  return {
    nodeUpdated,
    originalIndex,
    stateUpdated,
    uploadedUrl: uploadResult.url
  };
}

function postResponse(requestId, payload = {}, error = "") {
  window.postMessage({
    source: RESPONSE_SOURCE,
    type: RESPONSE_TYPE,
    requestId,
    ok: !error,
    error,
    payload
  }, window.location.origin);
}

window.addEventListener("message", async (event) => {
  if (event.source !== window) return;

  const message = event.data;
  if (!message || message.source !== REQUEST_SOURCE || message.type !== REQUEST_TYPE) return;

  try {
    const payload = await replaceGalleryImage(message.payload || {});
    postResponse(message.requestId, payload);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    debugLog("gallery replacement failed", { error: errorMessage });
    postResponse(message.requestId, {}, errorMessage);
  }
});

document.documentElement?.setAttribute?.(READY_ATTRIBUTE, "1");
debugLog("page bridge ready");
}
}
