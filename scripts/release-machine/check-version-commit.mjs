import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateReleaseVersionTexts } from '../set-release-version.mjs';

const paths={packageJson:'package.json',packageLock:'package-lock.json',cargoToml:'src-tauri/Cargo.toml',cargoLock:'src-tauri/Cargo.lock',manifest:'packaging/msix/AppxManifest.xml'};
export function assertVersionOnly(files, before, staged) {
  if (files.length !== 5 || new Set(files).size !== 5 || files.some(file=>!Object.values(paths).includes(file))) throw new Error('版番号コミットは指定の5ファイルだけに限定してください。');
  const current=JSON.parse(before.packageJson).version, next=JSON.parse(staged.packageJson).version;
  if(!/^[1-9]\d*\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(next)||next.split('.').some(n=>Number(n)>65535))throw new Error('MSIX版番号が不正です。');
  const expected=updateReleaseVersionTexts(before,current,next);
  for(const key of Object.keys(paths))if(staged[key]!==expected[key])throw new Error(`版番号以外の変更を検出しました: ${paths[key]}`);
}
export function checkStagedVersionCommit(cwd=process.cwd()) {
  const git=args=>execFileSync('git',args,{cwd,encoding:'utf8'});
  const files=git(['diff','--cached','--name-only','-z']).split('\0').filter(Boolean);
  const before=Object.fromEntries(Object.entries(paths).map(([key,file])=>[key,git(['show',`HEAD:${file}`])]));
  const staged=Object.fromEntries(Object.entries(paths).map(([key,file])=>[key,git(['show',`:${file}`])]));
  assertVersionOnly(files,before,staged);
  if(git(['diff','--cached','--summary']).trim())throw new Error('版番号ファイルの追加・削除・権限変更は許可しません。');
  console.log('[release-version] 5ファイルの版番号だけの変更を検証しました。STEP 0済みのアプリテストは繰り返しません。');
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{checkStagedVersionCommit();}catch(error){console.error(error.message);process.exitCode=1;}
