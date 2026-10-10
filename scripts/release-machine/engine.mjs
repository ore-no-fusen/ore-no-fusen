import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { updateReleaseVersionTexts } from '../set-release-version.mjs';

export const VERSION_FILES = ['package.json', 'package-lock.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock', 'packaging/msix/AppxManifest.xml'];
const VERSION_KEYS = ['packageJson', 'packageLock', 'cargoToml', 'cargoLock', 'manifest'];
const sha = data => createHash('sha256').update(data).digest('hex');
export const hashFile = file => sha(fs.readFileSync(file));
const readJSON = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export function atomicJSON(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`); fs.renameSync(tmp, file);
}
export function validateVersion(version, current) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('版番号は X.Y.Z の形式で入力してください。');
  const next = version.split('.').map(Number), old = current.split('.').map(Number);
  if (next.some(n => !Number.isSafeInteger(n) || n > 65535) || next[0] === 0) throw new Error('MSIXの版番号は先頭が1以上、各桁が65535以下である必要があります。');
  const differing = next.findIndex((n, i) => n !== old[i]);
  if (differing < 0 || next[differing] < old[differing]) throw new Error('現在より大きい版番号を指定してください。');
}
export function directoryHashes(dir) {
  const hashes = {};
  function walk(folder) {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`保全対象にリンクがあります: ${file}`);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) hashes[path.relative(dir, file).replaceAll('\\', '/')] = hashFile(file);
    }
  }
  walk(dir); return Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)));
}
export function assertHashes(dir, expected) {
  if (!expected || JSON.stringify(directoryHashes(dir)) !== JSON.stringify(expected)) throw new Error('保全済みexe/resourcesが変更されています。実機合格を引き継げません。');
}
export function copyTree(source, destination) {
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error('保全対象にリンクがあります。手動で確認してください。');
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('保全対象にリンクがあります。手動で確認してください。');
    if (entry.isDirectory()) copyTree(path.join(source, entry.name), path.join(destination, entry.name));
    else if (entry.isFile()) fs.copyFileSync(path.join(source, entry.name), path.join(destination, entry.name), fs.constants.COPYFILE_EXCL);
  }
}

export class ReleaseMachine {
  constructor({ root, dataDir = path.join(root, 'my/release-machine'), submissionRoot, runner, platform = process.platform }) {
    this.root = path.resolve(root); this.dataDir = dataDir;
    this.submissionRoot = submissionRoot ?? 'D:\\Users\\uck\\Documents\\俺の付箋-Store提出';
    this.runner = runner; this.platform = platform; this.busy = false;
    this.stateFile = path.join(dataDir, 'active.json'); fs.mkdirSync(dataDir, { recursive: true });
    this.state = fs.existsSync(this.stateFile) ? readJSON(this.stateFile) : { status: 'idle', steps: {} };
    if (this.state.status === 'running') {
      this.state.status = 'failed'; this.state.error = '前回の処理が中断されました。実行中プロセスがないことを確認し、同じボタンで再開してください。'; this.save();
    }
  }
  get runDir() { return path.join(this.dataDir, 'runs', this.state.id); }
  get snapshotDir() { return path.join(this.runDir, 'release'); }
  save() { atomicJSON(this.stateFile, this.state); if (this.state.id) atomicJSON(path.join(this.runDir, 'state.json'), this.state); }
  log(text) { if (this.state.id) fs.appendFileSync(path.join(this.runDir, 'commands.log'), `[${new Date().toISOString()}] ${text}\n`); }
  async cmd(file, args, cwd = this.root, logged = true, env) {
    const quote = value => `'${String(value).replaceAll("'", "''")}'`;
    const versionCommit = env?.RELEASE_MACHINE_VERSION_COMMIT === '1';
    if (logged) this.log(`場所: ${cwd}\nSet-Location -LiteralPath ${quote(cwd)}\n${versionCommit ? "$env:RELEASE_MACHINE_VERSION_COMMIT = '1'\n" : ''}& ${[file, ...args].map(quote).join(' ')}`);
    try { return await this.runner(file, args, { cwd, env,
      onOutput: logged ? text => this.log(text.trimEnd()) : undefined,
      onPid: logged ? pid => { this.state.childPid = pid; this.save(); } : undefined }); }
    finally { if (logged && versionCommit) this.log('Remove-Item Env:RELEASE_MACHINE_VERSION_COMMIT -ErrorAction SilentlyContinue'); }
  }
  git(args, cwd = this.root, logged = true) { return this.cmd('git', args, cwd, logged); }
  async head(cwd = this.root) { return this.git(['rev-parse', 'HEAD'], cwd, false); }
  async branch(cwd = this.root) { return this.git(['branch', '--show-current'], cwd, false); }
  async changes(cwd = this.root) {
    const out = await this.git(['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '-z', '--untracked-files=all'], cwd, false);
    // No silent exclusions: even untracked files are blockers. Rename records also block.
    return out ? out.split('\0').filter(Boolean).map(row => row.slice(3)) : [];
  }
  async clean(cwd = this.root) { const changes = await this.changes(cwd); if (changes.length) throw new Error(`未保存変更があります (${cwd}): ${changes.join(', ')}`); }
  async findMain() {
    const out = await this.git(['worktree', 'list', '--porcelain'], this.root, false);
    const blocks = out.split(/\r?\n\r?\n/);
    const match = blocks.find(block => block.split(/\r?\n/).includes('branch refs/heads/main'));
    if (match) return match.split(/\r?\n/)[0].slice('worktree '.length);
    return null;
  }
  loadEnvironment() {
    const env = { ...process.env }; const file = path.join(this.root, '.env.local');
    const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    for (const name of ['GDRIVE_CLIENT_ID', 'GDRIVE_CLIENT_SECRET']) {
      const value = text.split(/\r?\n/).find(line => line.startsWith(`${name}=`))?.slice(name.length + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
      if (!env[name] && value) env[name] = value;
    }
    return env;
  }
  ps(script, args = [], cwd = this.state.mainRoot ?? this.root, env) {
    return this.cmd('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args], cwd, true, env);
  }
  windows(action, args = [], env) { return this.ps(path.join(this.root, 'scripts/release-machine/windows.ps1'), ['-Action', action, ...args], this.root, env); }
  async inspect() {
    const result = { root: this.root, version: readJSON(path.join(this.root, 'package.json')).version, branch: await this.branch(), changes: await this.changes(), state: this.state, busy: this.busy, dataDir: this.dataDir, platform: this.platform };
    result.mainRoot = await this.findMain();
    result.mainChanges = result.mainRoot ? await this.changes(result.mainRoot) : [];
    result.log = this.state.id && fs.existsSync(path.join(this.runDir, 'commands.log')) ? fs.readFileSync(path.join(this.runDir, 'commands.log'), 'utf8').slice(-80000) : '';
    return result;
  }
  async guards({ allowVersionChanges = false, appClosed = false } = {}) {
    if (this.platform !== 'win32') throw new Error('Windows上で実行してください。');
    if (await this.branch() !== 'develop') throw new Error('基本フォルダーのdevelopから起動してください。');
    const common = await this.git(['rev-parse', '--path-format=absolute', '--git-common-dir'], this.root, false);
    if (path.resolve(path.dirname(common)).toLowerCase() !== this.root.toLowerCase()) throw new Error('一時ワークツリーからは実行できません。基本フォルダーで起動してください。');
    const changes = await this.changes();
    if (changes.some(file => !allowVersionChanges || !VERSION_FILES.includes(file))) throw new Error(`未保存変更があります: ${changes.join(', ')}`);
    const main = await this.findMain();
    if (main) {
      await this.clean(main);
      if (this.state.mainRoot && path.resolve(main) !== path.resolve(this.state.mainRoot)) throw new Error('正式リリースの作業場所が変わりました。ログを確認してください。');
    }
    try { await this.git(['merge-base', '--is-ancestor', 'main', 'develop'], this.root, false); }
    catch { throw new Error('mainとdevelopが分岐しています。fast-forwardできないため停止しました。手動で確認してください。'); }
    if (this.state.childPid) {
      try { process.kill(this.state.childPid, 0); throw new Error(`前回の子プロセス (${this.state.childPid}) が残っています。終了を確認してください。`); }
      catch (error) { if (error.code !== 'ESRCH') throw error; }
      this.state.childPid = null; this.save();
    }
    await this.windows('Probe', ['-RepoRoot', this.root, ...(appClosed ? ['-RequireAppClosed'] : [])], this.loadEnvironment());
  }
  async step(id, title, action) {
    if (this.state.steps[id]?.status === 'done') return;
    this.state.current = title; this.state.steps[id] = { status: 'running', title, started: new Date().toISOString() }; this.save(); this.log(`開始: ${title}`);
    const started = Date.now();
    try {
      await action(); this.state.steps[id].status = 'done';
    } catch (error) { this.state.steps[id].status = 'failed'; throw error; }
    finally {
      this.state.steps[id].ended = new Date().toISOString(); this.state.steps[id].seconds = (Date.now() - started) / 1000;
      fs.appendFileSync(path.join(this.runDir, 'timings.jsonl'), `${JSON.stringify({ id, ...this.state.steps[id] })}\n`);
      this.log(`結果: ${this.state.steps[id].status} / ${this.state.steps[id].seconds}秒`); this.save();
    }
  }
  // Synchronous lock acquisition precedes any await, including HTTP response.
  start(kind, input) {
    if (this.busy) throw new Error('処理中です。二重実行できません。');
    if (!['prepare', 'package'].includes(kind)) throw new Error('不正な操作です。');
    if (kind === 'package' && this.state.status === 'complete') throw new Error('提出準備は既に完了しています。');
    if (kind === 'prepare' && this.state.id && this.state.status !== 'complete' && this.state.operation === 'package') throw new Error('提出用作成が途中です。2つ目のボタンで再開してください。');
    if (kind === 'package' && (!this.state.steps.install || this.state.steps.install.status !== 'done' || input.confirmed !== true)) throw new Error('STEP 1完了と実機確認のチェックが必要です。');
    if (kind === 'package' && input.version !== this.state.version) throw new Error('確認対象の版番号が違います。');
    if (kind === 'prepare' && ['confirm', 'complete'].includes(this.state.status) && input.version === this.state.version) throw new Error('この版の準備は完了しています。');
    this.busy = true;
    if (kind === 'package') { this.state.operation = 'package'; this.save(); }
    const job = (async () => {
      try {
        if (kind === 'prepare') await this.prepare(input.version); else await this.package();
      } catch (error) {
        if (this.state.status !== 'complete') this.state.status = 'failed';
        this.state.error = error.message; this.log(`停止: ${error.message}`); this.save();
      } finally { this.busy = false; }
    })();
    this.job = job; return job;
  }
  async prepare(version) {
    const continuing = this.state.id && this.state.status !== 'complete';
    if (continuing && version !== this.state.version) throw new Error('途中のリリースがあります。同じ版番号で再開してください。取り消す場合は手動復旧手順を確認してください。');
    if (!continuing) {
      const current = readJSON(path.join(this.root, 'package.json')).version; validateVersion(version, current);
      // Complete all read-only guards before recording a new attempt or modifying Git.
      await this.guards({ appClosed: true });
      const base = await this.head();
      const staged = await this.git(['diff', '--cached', '--name-only'], this.root, false); if (staged) throw new Error('ステージ済み変更があります。');
      this.state = { id: `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`, version, base, status: 'running', operation: 'prepare', steps: {} }; this.save();
    } else { await this.guards({ allowVersionChanges: this.state.steps.commit?.status !== 'done', appClosed: true }); }
    this.state.status = 'running'; this.state.operation = 'prepare'; this.state.error = null; this.save();
    await this.step('version', 'STEP 1-1 版番号設定', async () => {
      if (!this.state.versionTexts) {
        if (await this.head() !== this.state.base) throw new Error('開始時のdevelopコミットから変わっています。');
        await this.clean();
        const texts = VERSION_FILES.map(file => fs.readFileSync(path.join(this.root, file), 'utf8'));
        const files = Object.fromEntries(VERSION_KEYS.map((key, i) => [key, texts[i]]));
        const updated = updateReleaseVersionTexts(files, JSON.parse(texts[0]).version, version);
        this.state.versionTexts = VERSION_FILES.map((file, i) => ({ file, before: texts[i], after: updated[VERSION_KEYS[i]] })); this.save();
      }
      for (const item of this.state.versionTexts) {
        const actual = fs.readFileSync(path.join(this.root, item.file), 'utf8');
        if (actual !== item.before && actual !== item.after) throw new Error(`他の変更を検出しました: ${item.file}`);
      }
      // A partially interrupted version write is replayed only when each file is original or expected.
      const allOriginal = this.state.versionTexts.every(item => fs.readFileSync(path.join(this.root, item.file), 'utf8') === item.before);
      if (allOriginal) await this.cmd(process.execPath, ['scripts/set-release-version.mjs', version]);
      else for (const item of this.state.versionTexts) { fs.writeFileSync(path.join(this.root, item.file), item.after); this.log(`版番号の中断復旧: ${item.file}`); }
      for (const item of this.state.versionTexts) if (fs.readFileSync(path.join(this.root, item.file), 'utf8') !== item.after) throw new Error(`版番号の結果不一致: ${item.file}`);
    });
    await this.step('commit', 'STEP 1-1 5ファイル限定コミット', async () => {
      const head = await this.head();
      if (head !== this.state.base) {
        const parent = await this.git(['rev-parse', 'HEAD^'], this.root, false);
        const files = (await this.git(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], this.root, false)).split(/\r?\n/).filter(Boolean);
        if (parent !== this.state.base || files.some(file => !VERSION_FILES.includes(file))) throw new Error('候補コミットを自動復旧できません。別のコミットを検出しました。');
        await this.clean();
        for (const item of this.state.versionTexts) if (fs.readFileSync(path.join(this.root, item.file), 'utf8') !== item.after) throw new Error('中断後の候補コミットの版番号内容が一致しません。');
      } else {
        const changes = await this.changes(); if (changes.some(file => !VERSION_FILES.includes(file))) throw new Error('版番号以外の変更があります。');
        for (const item of this.state.versionTexts) if (fs.readFileSync(path.join(this.root, item.file), 'utf8') !== item.after) throw new Error(`版番号変更が一致しません: ${item.file}`);
        const staged = (await this.git(['diff', '--cached', '--name-only'], this.root, false)).split(/\r?\n/).filter(Boolean);
        if (staged.some(file => !VERSION_FILES.includes(file))) throw new Error('版番号以外がステージされています。');
        await this.git(['add', '--', ...VERSION_FILES]); await this.git(['diff', '--cached', '--check']);
        // The existing hook verifies exact updater output for these five files.
        // Normal commits retain all existing checks; no blanket hook bypass.
        await this.cmd('git', ['commit', '-m', `release: v${version} MSIX release candidate`], this.root, true, { ...process.env, RELEASE_MACHINE_VERSION_COMMIT: '1' }); await this.clean();
      }
      this.state.candidate = await this.head(); this.save();
    });
    await this.step('main', 'STEP 1-1 正式リリースmainへ同期', async () => {
      await this.assertCandidate(false);
      let main = await this.findMain();
      if (!main) { main = path.join(this.root, '.w', '正式リリース'); if (fs.existsSync(main)) throw new Error('正式リリースフォルダーが既にあります。手動で確認してください。'); await this.git(['worktree', 'add', main, 'main']); }
      await this.clean(main); await this.git(['merge', '--ff-only', this.state.candidate], main);
      this.state.mainRoot = main; this.save();
      if (!fs.existsSync(path.join(main, 'node_modules'))) {
        fs.symlinkSync(path.join(this.root, 'node_modules'), path.join(main, 'node_modules'), 'junction'); this.log('本番ビルド依存: 基本フォルダーのnode_modulesを使用');
      }
      await this.assertCandidate();
    });
    await this.assertCandidate();
    await this.step('build', 'STEP 1-2 本番exeを1回ビルド・保全', async () => {
      await this.windows('Build', ['-RepoRoot', this.state.mainRoot, '-ExpectedVersion', version, '-RequireAppClosed'], this.loadEnvironment());
      await this.assertCandidate();
      const release = path.join(this.state.mainRoot, 'src-tauri/target/release');
      // A new unique directory is used on each build attempt; no recursive overwrite.
      const preserved = path.join(this.runDir, `build-${randomUUID()}`); fs.mkdirSync(preserved);
      fs.copyFileSync(path.join(release, 'ore-no-fusen.exe'), path.join(preserved, 'ore-no-fusen.exe'));
      if (fs.existsSync(path.join(release, 'resources'))) copyTree(path.join(release, 'resources'), path.join(preserved, 'resources'));
      const expected = directoryHashes(preserved);
      for (const [file, hash] of Object.entries(expected)) if (hashFile(path.join(release, file)) !== hash) throw new Error('ビルド成果物が保全中に変化しました。再試行してください。');
      this.state.releaseDir = preserved; this.state.hashes = expected; this.save(); this.log(`保全先: ${preserved}\nSHA256: ${JSON.stringify(expected)}`);
    });
    await this.assertSnapshot();
    await this.step('dev', 'STEP 1-3 開発署名MSIXを作成', async () => {
      await this.ps(path.join(this.state.mainRoot, 'packaging/msix/test-msix.ps1'), ['-SkipBuild', '-NoInstall', '-ReleaseDirectory', this.state.releaseDir]);
      const dev = path.join(this.state.mainRoot, 'packaging/msix/dev/out/ore-no-fusen-dev.msix');
      this.state.devPackage = path.join(this.runDir, 'ore-no-fusen-dev.msix'); fs.copyFileSync(dev, this.state.devPackage);
      this.state.devHash = hashFile(this.state.devPackage); this.save();
    });
    await this.step('install', 'STEP 1-4 開発署名MSIXを導入・起動', async () => {
      await this.assertSnapshot();
      if (hashFile(this.state.devPackage) !== this.state.devHash) throw new Error('開発署名MSIXが変化しています。');
      await this.windows('Install', ['-PackagePath', this.state.devPackage, '-ReleaseDirectory', this.state.releaseDir, '-ExpectedVersion', `${version}.0`, '-RequireAppClosed']);
    });
    this.state.status = 'confirm'; this.state.current = 'STEP 1-5 実機確認待ち'; this.save();
  }
  async assertCandidate(includeMain = true) {
    if (await this.branch() !== 'develop' || await this.head() !== this.state.candidate) throw new Error('developが確認対象コミットから変わりました。手動で確認してください。');
    await this.clean();
    if (includeMain) {
      if (!this.state.mainRoot || await this.branch(this.state.mainRoot) !== 'main' || await this.head(this.state.mainRoot) !== this.state.candidate) throw new Error('mainが確認対象コミットと一致しません。');
      await this.clean(this.state.mainRoot);
    }
  }
  async assertSnapshot() { await this.assertCandidate(); assertHashes(this.state.releaseDir, this.state.hashes); }
  async package() {
    if (this.state.status === 'complete') throw new Error('提出準備は既に完了しています。');
    await this.guards(); await this.assertSnapshot();
    await this.windows('VerifyInstalled', ['-ReleaseDirectory', this.state.releaseDir, '-ExpectedVersion', `${this.state.version}.0`]);
    this.state.confirmation = { at: new Date().toISOString(), candidate: this.state.candidate, hashes: this.state.hashes };
    this.state.status = 'running'; this.state.operation = 'package'; this.state.error = null; this.save(); this.log('STEP 1-5 利用者が実機合格を確認');
    await this.step('store', 'STEP 2-1 合格exeからStore用MSIXを作成', async () => {
      await this.assertSnapshot();
      await this.ps(path.join(this.state.mainRoot, 'packaging/msix/build-msix.ps1'), ['-ReleaseDirectory', this.state.releaseDir]);
      const out = path.join(this.state.mainRoot, 'packaging/msix/out/ore-no-fusen.msix');
      this.state.storePackage = path.join(this.runDir, 'ore-no-fusen.msix'); fs.copyFileSync(out, this.state.storePackage); this.state.storeHash = hashFile(this.state.storePackage); this.save();
    });
    await this.step('validate', 'STEP 2-2 Store形式・内部exe/resourcesの一致確認', async () => {
      await this.assertSnapshot();
      if (hashFile(this.state.storePackage) !== this.state.storeHash) throw new Error('Store用MSIXが変化しています。');
      await this.ps(path.join(this.state.mainRoot, 'packaging/msix/validate-msix.ps1'), ['-PackagePath', this.state.storePackage, '-ExpectedVersion', `${this.state.version}.0`, '-ExpectedReleaseDirectory', this.state.releaseDir]);
    });
    await this.step('copy', 'STEP 3-1 固定提出先へ保存・照合', async () => {
      if (hashFile(this.state.storePackage) !== this.state.storeHash) throw new Error('検証後にMSIXが変化しています。');
      const folder = path.join(this.submissionRoot, this.state.version); fs.mkdirSync(folder, { recursive: true });
      const destination = path.join(folder, 'ore-no-fusen.msix');
      if (fs.existsSync(destination)) { if (hashFile(destination) !== this.state.storeHash) throw new Error('提出先に別内容のMSIXがあります。上書きしません。'); }
      else fs.copyFileSync(this.state.storePackage, destination, fs.constants.COPYFILE_EXCL);
      if (hashFile(destination) !== this.state.storeHash) throw new Error('提出先へのコピーが一致しません。');
      this.state.destination = destination; this.save(); this.log(`提出物: ${destination}\nSHA256: ${this.state.storeHash}`);
    });
    for (const branch of ['main', 'develop']) {
      if (this.state.steps[`push-${branch}`]?.status === 'done' &&
          (await this.git(['ls-remote', 'origin', `refs/heads/${branch}`])).split(/\s/)[0] !== this.state.candidate) {
        throw new Error(`反映済みの${branch}が候補コミットから変わっています。手動で確認してください。`);
      }
      await this.step(`push-${branch}`, `STEP 2-3 ${branch}をpush・リモート確認`, async () => {
        await this.assertSnapshot();
        if (hashFile(this.state.destination) !== this.state.storeHash) throw new Error('提出ファイルが変更されています。');
        let remote = await this.git(['ls-remote', 'origin', `refs/heads/${branch}`]);
        if (remote.split(/\s/)[0] !== this.state.candidate) await this.git(['push', 'origin', `${this.state.candidate}:refs/heads/${branch}`]);
        remote = await this.git(['ls-remote', 'origin', `refs/heads/${branch}`]);
        if (remote.split(/\s/)[0] !== this.state.candidate) throw new Error(`${branch}のリモート反映を確認できません。`);
      });
    }
    // Recheck even already-completed push stages before declaring overall completion.
    for (const branch of ['main', 'develop']) if ((await this.git(['ls-remote', 'origin', `refs/heads/${branch}`])).split(/\s/)[0] !== this.state.candidate) throw new Error(`${branch}が候補コミットから変わっています。`);
    await this.step('open', '提出フォルダーを開く', () => this.windows('OpenFolder', ['-Folder', path.dirname(this.state.destination)]));
    this.state.status = 'complete'; this.state.current = 'Store提出準備完了（Partner Center申請は手動）'; this.save();
  }
}
