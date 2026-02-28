import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const distDir = resolve('dist');
const manifestPath = resolve(distDir, 'manifest.json');

if (!existsSync(manifestPath)) {
  throw new Error('Build validation failed: dist/manifest.json is missing.');
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const requiredFiles = [
  manifest.background?.service_worker,
  ...(manifest.content_scripts?.flatMap((entry) => entry.js ?? []) ?? []),
  ...(manifest.content_scripts?.flatMap((entry) => entry.css ?? []) ?? [])
].filter(Boolean);

for (const relativeFile of requiredFiles) {
  const artifactPath = resolve(distDir, relativeFile);

  if (!existsSync(artifactPath)) {
    throw new Error(`Build validation failed: ${relativeFile} referenced by manifest is missing in dist/.`);
  }
}

console.log('Extension build validation passed.');
