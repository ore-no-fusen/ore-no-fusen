import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const modalPath = join(root, 'app', 'components', 'ImageAnnotationModal.tsx');
const msixScriptPath = join(root, 'packaging', 'msix', 'test-msix.ps1');

let modal = readFileSync(modalPath, 'utf8');
const oldSave = `            const dataUrl = stage.toDataURL({ mimeType: 'image/png', pixelRatio });
            await invoke('fusen_save_annotated_image', { path: absolutePath, data: dataUrl });`;
const newSave = `            const dataUrl = stage.toDataURL({ mimeType: 'image/png', pixelRatio });
            const diagnostic = {
                dataUrlLength: dataUrl.length,
                dataUrlPrefix: dataUrl.slice(0, 64),
                stageWidth: stage.width(),
                stageHeight: stage.height(),
                naturalWidth: nw,
                naturalHeight: nh,
                pixelRatio,
            };
            console.info('[ANNOTATION] export diagnostic', diagnostic);
            if (!dataUrl.startsWith('data:image/png;base64,')) {
                throw new Error(
                    'PNG Data URLを生成できませんでした。' +
                    ' length=' + diagnostic.dataUrlLength +
                    ' prefix=' + JSON.stringify(diagnostic.dataUrlPrefix) +
                    ' stage=' + diagnostic.stageWidth + 'x' + diagnostic.stageHeight +
                    ' natural=' + diagnostic.naturalWidth + 'x' + diagnostic.naturalHeight +
                    ' ratio=' + diagnostic.pixelRatio
                );
            }
            await invoke('fusen_save_annotated_image', { path: absolutePath, data: dataUrl });`;

if (!modal.includes(oldSave)) {
  if (!modal.includes("[ANNOTATION] export diagnostic")) {
    throw new Error('ImageAnnotationModal.tsx の保存処理が想定と異なります。変更は行いませんでした。');
  }
  console.log('ImageAnnotationModal.tsx: diagnostics already applied');
} else {
  modal = modal.replace(oldSave, newSave);
  writeFileSync(modalPath, modal, 'utf8');
  console.log('ImageAnnotationModal.tsx: diagnostics applied');
}

let msix = readFileSync(msixScriptPath, 'utf8');
const oldBuild = `    npm run tauri build
    if ($LASTEXITCODE -ne 0) { throw "npm run tauri build failed." }`;
const newBuild = `    npm run tauri -- build --no-bundle
    if ($LASTEXITCODE -ne 0) { throw "Tauri executable build failed." }`;

if (!msix.includes(oldBuild)) {
  if (!msix.includes('build --no-bundle')) {
    throw new Error('test-msix.ps1 のビルド処理が想定と異なります。');
  }
  console.log('test-msix.ps1: no-bundle build already applied');
} else {
  msix = msix.replace(oldBuild, newBuild);
  writeFileSync(msixScriptPath, msix, 'utf8');
  console.log('test-msix.ps1: changed to Tauri --no-bundle build');
}

console.log('Done. Review with: git diff');
