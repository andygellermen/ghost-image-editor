chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "editImage",
    title: chrome.i18n.getMessage("contextEdit"),
    contexts: ["image"]
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "editImage") {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (src) => window.openEditorFromContext(src),
      args: [info.srcUrl]
    });
  }
});