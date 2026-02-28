const manifestVersion=chrome.runtime.getManifest().version;
console.info(`[ghost-image-editor] background loaded v${manifestVersion}`);
chrome.runtime.onInstalled.addListener(()=>{chrome.contextMenus.create({id:"editImage",title:chrome.i18n.getMessage("contextEdit"),contexts:["image"]})});
chrome.contextMenus.onClicked.addListener((info,tab)=>{if(info.menuItemId!=="editImage"||!(tab!=null&&tab.id)||!info.srcUrl)return;chrome.tabs.sendMessage(tab.id,{type:"OPEN_EDITOR_FROM_CONTEXT",imageSrc:info.srcUrl})});
