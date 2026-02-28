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
