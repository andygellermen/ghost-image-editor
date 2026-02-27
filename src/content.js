function attachUploadListener() {
  const inputs = document.querySelectorAll('input[type="file"]');

  inputs.forEach(input => {
    if (input.dataset.editorAttached) return;
    input.dataset.editorAttached = "true";

    input.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file || !file.type.startsWith("image/")) return;

      e.preventDefault();

      const reader = new FileReader();
      reader.onload = () => openEditor(reader.result, input, file);
      reader.readAsDataURL(file);
    });
  });
}

const observer = new MutationObserver(() => attachUploadListener());
observer.observe(document.body, { childList: true, subtree: true });

attachUploadListener();