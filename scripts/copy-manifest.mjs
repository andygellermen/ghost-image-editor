import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const source = 'src/manifest.json';
const target = 'dist/manifest.json';

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);

console.log(`Copied ${source} -> ${target}`);
