function attachUploadListener() {
  const inputs = document.querySelectorAll('input[type="file"]');

  inputs.forEach((input) => {
    if (input.dataset.editorAttached) return;
    input.dataset.editorAttached = "true";

    input.addEventListener("change", (event) => {
      if (input.dataset.editorApplying === "true") {
        delete input.dataset.editorApplying;
        return;
      }

      const file = event.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;
      if (typeof window.openEditor !== "function") return;

      event.preventDefault();

      const reader = new FileReader();
      reader.onload = () => window.openEditor(reader.result, input, file);
      reader.readAsDataURL(file);
    });
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "OPEN_EDITOR_FROM_CONTEXT") return;
  if (typeof window.openEditorFromContext !== "function") return;

  window.openEditorFromContext(message.imageSrc);
});

const observer = new MutationObserver(() => attachUploadListener());
observer.observe(document.body, { childList: true, subtree: true });

attachUploadListener();
