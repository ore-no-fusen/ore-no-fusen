import fs from 'node:fs';
import path from 'node:path';

const versionPattern = /^\d+\.\d+\.\d+$/;

function replaceOnce(content, pattern, replacement, label) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const count = [...content.matchAll(new RegExp(pattern.source, flags))].length;
  if (count !== 1) {
    throw new Error(`${label}: expected exactly one version field, found ${count}`);
  }
  return content.replace(pattern, replacement);
}

function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

export function updateReleaseVersionTexts(files, current, next) {
  if (!versionPattern.test(next)) throw new Error(`Version must be X.Y.Z: ${next}`);
  if (compareVersions(next, current) <= 0) throw new Error(`Version ${next} must be greater than ${current}`);

  const escaped = current.replace(/\./g, '\\.');
  return {
    packageJson: replaceOnce(files.packageJson, new RegExp(`"version": "${escaped}"`), `"version": "${next}"`, 'package.json'),
    packageLock: replaceOnce(
      replaceOnce(files.packageLock, new RegExp(`^(  "version": ")${escaped}("[,])`, 'm'), `$1${next}$2`, 'package-lock.json top level'),
      new RegExp(`("packages": \\{\\r?\\n    "": \\{\\r?\\n      "name": "ore-no-fusen",\\r?\\n      "version": ")${escaped}(")`), `$1${next}$2`, 'package-lock.json root package',
    ),
    cargoToml: replaceOnce(files.cargoToml, new RegExp(`^version = "${escaped}"$`, 'm'), `version = "${next}"`, 'Cargo.toml'),
    cargoLock: replaceOnce(files.cargoLock, new RegExp(`(name = "ore-no-fusen"\\r?\\nversion = ")${escaped}(")`), `$1${next}$2`, 'Cargo.lock root package'),
    manifest: replaceOnce(files.manifest, new RegExp(`Version="${escaped}\\.0"`), `Version="${next}.0"`, 'AppxManifest.xml'),
  };
}

function main() {
  const next = process.argv[2];
  if (!next) throw new Error('usage: node scripts/set-release-version.mjs <X.Y.Z>');

  const root = path.resolve(import.meta.dirname, '..');
  const paths = {
    packageJson: path.join(root, 'package.json'),
    packageLock: path.join(root, 'package-lock.json'),
    cargoToml: path.join(root, 'src-tauri', 'Cargo.toml'),
    cargoLock: path.join(root, 'src-tauri', 'Cargo.lock'),
    manifest: path.join(root, 'packaging', 'msix', 'AppxManifest.xml'),
  };
  const files = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, fs.readFileSync(file, 'utf8')]));
  const current = JSON.parse(files.packageJson).version;
  const updated = updateReleaseVersionTexts(files, current, next);

  for (const [key, file] of Object.entries(paths)) fs.writeFileSync(file, updated[key], 'utf8');
  console.log(`Release version updated: ${current} -> ${next}`);
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) main();
