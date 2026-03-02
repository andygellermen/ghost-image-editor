const manifestVersion = chrome.runtime.getManifest().version;

console.info(`[ghost-image-editor] background loaded v${manifestVersion}`);

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "editImage",
    title: chrome.i18n.getMessage("contextEdit"),
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "editImage" || !tab?.id || !info.srcUrl) return;

  chrome.tabs.sendMessage(tab.id, {
    type: "OPEN_EDITOR_FROM_CONTEXT",
    imageSrc: info.srcUrl
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "FETCH_IMAGE_BLOB" || !message.imageSrc) {
    return undefined;
  }

  (async () => {
    try {
      const response = await fetch(message.imageSrc);
      if (!response.ok) {
        sendResponse({ ok: false, error: `Unable to load image: ${response.status}` });
        return;
      }

      const blob = await response.blob();
      const buffer = await blob.arrayBuffer();
      sendResponse({
        ok: true,
        type: blob.type || "image/png",
        buffer: Array.from(new Uint8Array(buffer))
      });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  })();

  return true;
});
