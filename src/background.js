const extensionApi = globalThis.browser ?? globalThis.chrome;
const manifestVersion = extensionApi?.runtime?.getManifest?.().version ?? "unknown";

console.info(`[ghost-image-editor] background loaded v${manifestVersion}`);

function ensureContextMenu() {
  extensionApi.contextMenus.removeAll(() => {
    extensionApi.contextMenus.create({
      id: "editImage",
      title: extensionApi.i18n.getMessage("contextEdit"),
      contexts: ["image", "all"]
    }, () => {
      if (extensionApi.runtime.lastError) {
        console.warn("[ghost-image-editor] failed to create context menu", extensionApi.runtime.lastError.message);
      }
    });
  });
}

extensionApi.runtime.onInstalled.addListener(() => {
  ensureContextMenu();
});

extensionApi.runtime.onStartup.addListener(() => {
  ensureContextMenu();
});

ensureContextMenu();

extensionApi.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "editImage" || !tab?.id) return;

  extensionApi.tabs.sendMessage(tab.id, {
    type: "OPEN_EDITOR_FROM_CONTEXT",
    imageSrc: info.srcUrl || ""
  });
});

extensionApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
