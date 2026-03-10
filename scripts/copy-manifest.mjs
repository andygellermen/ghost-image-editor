import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const browser = process.argv[2];

if (!browser) {
  console.error('Usage: node scripts/copy-manifest.mjs <chrome|firefox|opera|safari>');
  process.exit(1);
}

const source = `src/manifests/${browser}.json`;
const target = `dist/${browser}/manifest.json`;

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);

console.log(`Copied ${source} -> ${target}`);
