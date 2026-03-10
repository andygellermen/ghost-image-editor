import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const browser = process.argv[2] ?? 'chrome';
const source = `src/manifests/${browser}.json`;
const target = `dist/${browser}/manifest.json`;

if (!existsSync(source)) {
  console.error(`Unsupported browser target: ${browser}`);
  process.exit(1);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);

console.log(`Copied ${source} -> ${target}`);
