# Browser-Kompatibilität: Ghost Image Editor

## Kurzantworten

- **Kein separates Repository nötig**: In der Regel reicht ein gemeinsames Code-Repository für alle Browser.
- **Getrennte Build-Artefakte sinnvoll**: Erzeugt browser-spezifische Distributionen, z. B. `dist/chrome` und `dist/firefox`.
- **Langfristig für Safari/Opera**: Nutzt eine gemeinsame Codebasis mit browser-spezifischen Manifest-/Build-Anpassungen.

## Aktueller Stand im Projekt

Das Projekt verwendet derzeit **Manifest V3** mit einem `background.service_worker` in `src/manifest.json`.
Der Build kopiert das Manifest momentan 1:1 von `src/manifest.json` nach `dist/manifest.json`.

## Empfehlung für Firefox

1. **Manifest für Firefox variieren**
   - Separate Manifest-Datei anlegen (z. B. `src/manifest.firefox.json`) oder per Build transformieren.
   - `browser_specific_settings.gecko.id` setzen (für AMO-Distribution empfohlen).

2. **Build-Ausgabe trennen**
   - `dist/chrome/manifest.json`
   - `dist/firefox/manifest.json`

3. **API-Kompatibilität prüfen**
   - `contextMenus`, `activeTab`, `scripting` und Service-Worker-Verhalten in Firefox testen.
   - Falls nötig, Fallbacks für Unterschiede zwischen Chromium- und Firefox-Implementierung einbauen.

4. **Test-Matrix definieren**
   - Ghost-Backend URLs (`*://*/ghost/*`), Content-Script-Injection und Bildeditor-Flow auf Firefox ESR + aktuellem Release testen.

## Brauchen wir ein separates Repository?

**Nein, meistens nicht.**
Ein Monorepo/einzelnes Repo ist Standard, solange:

- gemeinsamer Quellcode genutzt wird,
- browser-spezifische Dateien/Build-Schritte sauber getrennt sind,
- Release-Pipelines pro Browser erzeugt werden.

Ein separates Repo lohnt sich meist nur, wenn sich Implementierungen stark auseinanderentwickeln.

## Ausblick: Safari und Opera

- **Opera**: Meist Chromium-kompatibel → Chrome-Variante oft nahezu direkt nutzbar.
- **Safari**: Häufig zusätzlicher Packaging-/Signatur-Schritt und ggf. API-Unterschiede.

### Empfohlene Zielstruktur

- `src/` gemeinsame Logik
- `src/manifests/chrome.json`
- `src/manifests/firefox.json`
- `src/manifests/safari.json` (falls nötig)
- `dist/chrome/`, `dist/firefox/`, `dist/safari/`

So bleibt die Wartung zentral, während Browser-Besonderheiten isoliert bleiben.
