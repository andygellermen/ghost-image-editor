function resolveExtensionApi() {
  const candidates = [];

  if (typeof browser !== "undefined") candidates.push(browser);
  if (typeof chrome !== "undefined") candidates.push(chrome);
  if (globalThis?.browser) candidates.push(globalThis.browser);
  if (globalThis?.chrome) candidates.push(globalThis.chrome);

  return candidates.find((candidate) => candidate?.runtime?.sendMessage)
    || candidates.find((candidate) => candidate?.runtime?.onMessage?.addListener)
    || candidates.find((candidate) => candidate?.runtime?.getManifest)
    || candidates.find((candidate) => candidate?.contextMenus?.create)
    || null;
}

const extensionApi = resolveExtensionApi();
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
  if (message?.type === "INJECT_PAGE_BRIDGE") {
    (async () => {
      try {
        const tabId = _sender?.tab?.id;
        if (!tabId) {
          sendResponse({ ok: false, error: "Missing tab ID for page bridge injection" });
          return;
        }

        if (!extensionApi.scripting?.executeScript) {
          sendResponse({ ok: false, error: "Scripting API unavailable" });
          return;
        }

        await extensionApi.scripting.executeScript({
          target: { tabId },
          files: ["page-bridge.js"],
          world: "MAIN"
        });

        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    })();

    return true;
  }

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
