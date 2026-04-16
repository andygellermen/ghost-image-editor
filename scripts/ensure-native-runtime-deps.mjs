import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const nodeModulesDir = resolve(repoRoot, 'node_modules');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function getRollupPackageName() {
  const libc = process.report?.getReport?.()?.header?.glibcVersionRuntime ? 'gnu' : 'musl';

  if (process.platform === 'darwin') {
    if (process.arch === 'arm64') return '@rollup/rollup-darwin-arm64';
    if (process.arch === 'x64') return '@rollup/rollup-darwin-x64';
  }

  if (process.platform === 'linux') {
    if (process.arch === 'arm64') return `@rollup/rollup-linux-arm64-${libc}`;
    if (process.arch === 'x64') return `@rollup/rollup-linux-x64-${libc}`;
  }

  if (process.platform === 'win32') {
    if (process.arch === 'arm64') return '@rollup/rollup-win32-arm64-msvc';
    if (process.arch === 'ia32') return '@rollup/rollup-win32-ia32-msvc';
    if (process.arch === 'x64') return '@rollup/rollup-win32-x64-msvc';
  }

  return null;
}

function getEsbuildPackageName() {
  if (process.platform === 'darwin') {
    if (process.arch === 'arm64') return '@esbuild/darwin-arm64';
    if (process.arch === 'x64') return '@esbuild/darwin-x64';
  }

  if (process.platform === 'linux') {
    if (process.arch === 'arm64') return '@esbuild/linux-arm64';
    if (process.arch === 'x64') return '@esbuild/linux-x64';
  }

  if (process.platform === 'win32') {
    if (process.arch === 'arm64') return '@esbuild/win32-arm64';
    if (process.arch === 'ia32') return '@esbuild/win32-ia32';
    if (process.arch === 'x64') return '@esbuild/win32-x64';
  }

  return null;
}

function getInstalledPackageVersion(packageName) {
  const packagePath = join(nodeModulesDir, ...packageName.split('/'), 'package.json');
  if (!existsSync(packagePath)) return null;

  return readJson(packagePath).version || null;
}

function getPackageVersionSpec(ownerPackagePath, dependencyName) {
  const ownerPackage = readJson(ownerPackagePath);
  return ownerPackage.optionalDependencies?.[dependencyName] || ownerPackage.dependencies?.[dependencyName] || ownerPackage.version;
}

function getNpmCliPath() {
  const nodeInstallRoot = resolve(dirname(process.execPath), '..');
  return resolve(nodeInstallRoot, 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
}

function installPackage(packageName, versionSpec) {
  const npmCliPath = getNpmCliPath();
  const installTarget = `${packageName}@${versionSpec}`;
  const cleanEnv = {
    ...process.env,
    npm_config_fund: 'false'
  };

  delete cleanEnv.npm_config_shrinkwrap;
  delete cleanEnv.npm_config_cache_max;
  delete cleanEnv.npm_config_cache_min;
  delete cleanEnv.npm_config_optional;
  delete cleanEnv.npm_config_package_lock;

  if (!existsSync(npmCliPath)) {
    throw new Error(`Missing npm CLI next to runtime node: ${npmCliPath}`);
  }

  console.log(`Installing missing native dependency: ${installTarget}`);

  const result = spawnSync(
    process.execPath,
    [
      npmCliPath,
      'install',
      '--no-save',
      '--no-package-lock',
      '--prefer-offline',
      '--no-audit',
      '--progress=false',
      installTarget
    ],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: cleanEnv
    }
  );

  if (result.status !== 0) {
    throw new Error(`Failed to install native dependency ${installTarget}`);
  }
}

function ensureDependency({ ownerPackagePath, dependencyName }) {
  if (!dependencyName) return;

  const expectedVersion = getPackageVersionSpec(ownerPackagePath, dependencyName);
  const installedVersion = getInstalledPackageVersion(dependencyName);

  if (installedVersion === expectedVersion) return;

  installPackage(dependencyName, expectedVersion);
}

ensureDependency({
  ownerPackagePath: resolve(nodeModulesDir, 'rollup', 'package.json'),
  dependencyName: getRollupPackageName()
});

ensureDependency({
  ownerPackagePath: resolve(nodeModulesDir, 'esbuild', 'package.json'),
  dependencyName: getEsbuildPackageName()
});
