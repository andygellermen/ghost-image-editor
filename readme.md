Installation (Development Mode)

1. Start Chrome-Browser
2. Enter `chrome://extensions` in Searchbar
3. Enter Developer Mode
4. Run `npm run build` (this automatically creates `dist/manifest.json` and validates all manifest file references)
5. Choose "Load unpacked"
6. Open local `ghost-image-editor/dist` folder

Notes
- Do not edit files in `dist/` manually. `dist/` is generated completely by the build process.
- If you change `src/manifest.json`, the file is copied automatically to `dist/manifest.json` on the next build.


Build/Reload workflow (important)
- If you change files in `src/`, run `npm run build` and then click **Reload** for the unpacked extension in `chrome://extensions`.
- Do not expect `src/` changes to be active without rebuilding when Chrome is loading `dist/`.
- Manual edits in `dist/` are hotfixes only and will be overwritten on the next `npm run build`.


Troubleshooting
- If DevTools still shows `openEditor is not defined` from `content.js:1`, Chrome is still running an older `dist/` build. Run `npm run build` and reload the extension.
- `window.openEditorFromContext is not a function` in the **page console** can happen because extension content scripts run in an isolated world. Use the context menu flow to test instead of calling extension hooks directly from the page context.
- Confirm the loaded version by checking for `[ghost-image-editor] content script loaded v...` and `[ghost-image-editor] background loaded v...` in DevTools.
