import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';

export async function validateLocalCandidate(m, candidate, { verifyOnly = false } = {}) {
  const tree = await m.git(['rev-parse', `${candidate}^{tree}`]);
  const npmCli = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  if (!fs.existsSync(npmCli)) throw Error('Nodeに付属するnpm-cli.jsが見つかりません。');
  const commands = [
    [process.execPath, [path.join(m.root, 'node_modules/vitest/vitest.mjs'), 'run'], m.root],
    [process.execPath, [path.join(m.root, 'node_modules/typescript/bin/tsc'), '--noEmit'], m.root],
    [process.execPath, ['--test', 'scripts/*.test.mjs', 'scripts/release-machine/*.test.mjs'], m.root],
    ['cargo', ['test', '--locked'], path.join(m.root, 'src-tauri')],
    [process.execPath, ['--test', 'workers/discord-replies/src/index.test.mjs'], m.root],
    [process.execPath, [npmCli, 'run', 'build'], m.root],
    [process.execPath, [npmCli, '--prefix', 'public-guide', 'run', 'build'], m.root],
    [process.execPath, [path.join(m.root, 'scripts/run-e2e.mjs')], m.root],
  ];
  const installedLock = fs.readFileSync(path.join(m.root, 'node_modules/.package-lock.json'));
  const installed = createHash('sha256');
  function fingerprint(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      if (['.cache','.vite','.vite-temp'].includes(entry.name)) continue;
      const file=path.join(dir,entry.name);
      installed.update(path.relative(m.root,file));
      if (entry.isSymbolicLink()) throw Error('依存にリンクがあります。実体を導入してから候補確認してください。');
      else if (entry.isDirectory()) fingerprint(file);
      else if (entry.isFile()) installed.update(fs.readFileSync(file));
    }
  }
  fingerprint(path.join(m.root,'node_modules'));
  fingerprint(path.join(m.root,'public-guide/node_modules'));
  const dependencyFiles=installed.digest('hex');
  const config=createHash('sha256');
  for (const file of ['.env','.env.local','.env.production','.env.production.local','.env.development','.env.development.local','.env.test','.env.test.local','.cargo/config','.cargo/config.toml','src-tauri/.cargo/config','src-tauri/.cargo/config.toml','public-guide/.env','public-guide/.env.local','public-guide/.env.production','public-guide/.env.production.local'].map(f=>path.join(m.root,f)).concat([path.join(os.homedir(),'.cargo/config'),path.join(os.homedir(),'.cargo/config.toml')])) {
    config.update(file);if(fs.existsSync(file))config.update(fs.readFileSync(file));
  }
  const environment=Object.fromEntries(Object.entries(process.env).filter(([name])=>/^(CI$|NODE_|RUST|CARGO|NEXT_|TAURI_|PLAYWRIGHT|E2E|GDRIVE_)/.test(name)).sort(([a],[b])=>a.localeCompare(b)));
  config.update(JSON.stringify(environment));
  const configuration=config.digest('hex');
  const dependencies = createHash('sha256').update(installedLock).digest('hex');
  const rust = await m.cmd('rustc', ['--version', '--verbose']);
  const cargo = await m.cmd('cargo', ['--version']);
  const identity = { tree, dependencies, dependencyFiles, configuration, rust, cargo, node: process.version, platform: process.platform, arch: process.arch, os: os.release(), commands };
  const key = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  const file = path.join(m.dataDir, 'candidate-validation', `${key}.json`);
  if (fs.existsSync(file)) {
    const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (receipt.success !== true || JSON.stringify(receipt.identity) !== JSON.stringify(identity)) throw Error('候補の検証記録が一致しません。');
    m.log('同じ入力・環境の候補確認済み結果を引き継ぎます。');
    return receipt;
  }
  if (verifyOnly) throw Error('候補確認後に依存・環境が変わりました。新しい候補として確認してください。');
  for (const [command, args, cwd] of commands) await m.cmd(command, args, cwd, true, undefined, 35 * 60_000);
  if (await m.head() !== candidate || await m.git(['rev-parse', 'HEAD^{tree}']) !== tree) throw Error('確認中に候補が変わりました。');
  await m.clean();
  const receipt = { success: true, candidate, identity, completedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(receipt, null, 2));
  return receipt;
}
