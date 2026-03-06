const manifestVersion = chrome.runtime.getManifest().version;

console.info(`[ghost-image-editor] background loaded v${manifestVersion}`);

function ensureContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "editImage",
      title: chrome.i18n.getMessage("contextEdit"),
      contexts: ["image", "all"]
    }, () => {
      if (chrome.runtime.lastError) {
        console.warn("[ghost-image-editor] failed to create context menu", chrome.runtime.lastError.message);
      }
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
  ensureContextMenu();
});

ensureContextMenu();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "editImage" || !tab?.id) return;

  chrome.tabs.sendMessage(tab.id, {
    type: "OPEN_EDITOR_FROM_CONTEXT",
    imageSrc: info.srcUrl || ""
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
