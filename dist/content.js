const EXTENSION_LOG_PREFIX="[ghost-image-editor]";
const manifestVersion=chrome.runtime.getManifest().version;
console.info(`${EXTENSION_LOG_PREFIX} content script loaded v${manifestVersion}`);

if(!window.__ghostImageEditorBridgeReady){
  window.__ghostImageEditorBridgeReady=true;
  const bridgeScript=document.createElement("script");
  bridgeScript.textContent=`
    window.openEditorFromContext = window.openEditorFromContext || function (imageSrc) {
      window.postMessage({ source: "ghost-image-editor", type: "OPEN_EDITOR_FROM_CONTEXT", imageSrc }, "*");
    };
  `;
  (document.head||document.documentElement).appendChild(bridgeScript);
  bridgeScript.remove();
}

window.addEventListener("message",event=>{
  if(event.source!==window)return;
  if(event.data?.source!=="ghost-image-editor")return;
  if(event.data?.type!=="OPEN_EDITOR_FROM_CONTEXT")return;
  const openEditorFromContext=globalThis.openEditorFromContext||window.openEditorFromContext;
  if(typeof openEditorFromContext==="function") openEditorFromContext(event.data.imageSrc);
});

function n(){document.querySelectorAll('input[type="file"]').forEach(e=>{if(e.dataset.editorAttached)return;e.dataset.editorAttached="true",e.addEventListener("change",t=>{if(e.dataset.editorApplying==="true"){delete e.dataset.editorApplying;return}const o=t.target.files?.[0];if(!o||!o.type.startsWith("image/"))return;const r=globalThis.openEditor||window.openEditor;if(typeof r!=="function"){console.warn(`${EXTENSION_LOG_PREFIX} openEditor hook is missing; skipping crop modal`);return}t.preventDefault();const i=new FileReader;i.onload=()=>r(i.result,e,o),i.readAsDataURL(o)})})}
chrome.runtime.onMessage.addListener(e=>{if(e?.type!=="OPEN_EDITOR_FROM_CONTEXT")return;const t=globalThis.openEditorFromContext||window.openEditorFromContext;if(typeof t==="function"){t(e.imageSrc);return}console.warn(`${EXTENSION_LOG_PREFIX} openEditorFromContext hook is missing; opening image URL directly`),window.open(e.imageSrc,"_blank","noopener,noreferrer")});
const a=new MutationObserver(()=>n());a.observe(document.body,{childList:!0,subtree:!0});n();
