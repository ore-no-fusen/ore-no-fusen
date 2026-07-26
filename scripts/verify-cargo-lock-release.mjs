import fs from 'node:fs';

const ROOT_PACKAGE = 'ore-no-fusen';

function findPackageBlock(lockfile, packageName) {
  const blocks = lockfile.match(/\[\[package\]\][\s\S]*?(?=\n\[\[package\]\]|\s*$)/g) ?? [];
  const block = blocks.find((candidate) => candidate.includes(`name = "${packageName}"`));
  if (!block) throw new Error(`root package not found: ${packageName}`);
  return block;
}

function packageVersion(packageBlock, packageName) {
  const version = packageBlock.match(/^version = "([^"]+)"$/m)?.[1];
  if (!version) throw new Error(`root package version not found: ${packageName}`);
  return version;
}

function normalizeRootPackageVersion(lockfile, packageName) {
  const packageBlock = findPackageBlock(lockfile, packageName);
  const normalizedBlock = packageBlock.replace(/^version = "[^"]+"$/m, 'version = "<ROOT_VERSION>"');
  return lockfile.replace(packageBlock, normalizedBlock);
}

export function verifyCargoLockRelease(beforeLockfile, afterLockfile, packageName = ROOT_PACKAGE) {
  const beforeBlock = findPackageBlock(beforeLockfile, packageName);
  const afterBlock = findPackageBlock(afterLockfile, packageName);
  const beforeVersion = packageVersion(beforeBlock, packageName);
  const afterVersion = packageVersion(afterBlock, packageName);

  if (normalizeRootPackageVersion(beforeLockfile, packageName) !== normalizeRootPackageVersion(afterLockfile, packageName)) {
    throw new Error('unexpected Cargo.lock changes outside the root package version');
  }

  return { beforeVersion, afterVersion };
}

function main() {
  const [beforePath, afterPath, packageName = ROOT_PACKAGE] = process.argv.slice(2);
  if (!beforePath || !afterPath) {
    throw new Error('usage: node scripts/verify-cargo-lock-release.mjs <before-lock> <after-lock> [root-package]');
  }

  const result = verifyCargoLockRelease(
    fs.readFileSync(beforePath, 'utf8'),
    fs.readFileSync(afterPath, 'utf8'),
    packageName,
  );
  console.log(`Cargo.lock check passed: ${packageName} ${result.beforeVersion} -> ${result.afterVersion}`);
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}`) {
  main();
}
