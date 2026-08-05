import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const modalPath = join(root, 'app', 'components', 'ImageAnnotationModal.tsx');
const msixPath = join(root, 'packaging', 'msix', 'test-msix.ps1');

let modal = readFileSync(modalPath, 'utf8');

const saveStart = modal.indexOf('    // ─── Save ');
const saveEnd = modal.indexOf('    // ─── ウィンドウ拡大', saveStart);
if (saveStart < 0 || saveEnd < 0) {
  throw new Error('ImageAnnotationModal.tsx save block was not found.');
}

const replacement = String.raw`    // BlobをTauriへ渡せるData URLへ変換する。
    // Konva.Stageの合成は環境によって非同期になるため、同期toDataURLの戻り値を使わない。
    const blobToDataUrl = useCallback((blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                if (typeof reader.result === 'string') resolve(reader.result);
                else reject(new Error('画像Data URLを生成できませんでした。'));
            };
            reader.onerror = () => reject(reader.error ?? new Error('画像Data URLの読込に失敗しました。'));
            reader.readAsDataURL(blob);
        });
    }, []);

    // ─── Save ────────────────────────────────────────────────────────────
    const handleSave = useCallback(async () => {
        const stage = stageRef.current;
        if (!stage) return;
        setIsSaving(true);
        try {
            const { w: nw } = naturalSizeRef.current;
            const { w: sw } = stageSizeRef.current;
            const pixelRatio = sw > 0 && nw > 0 ? nw / sw : 1;

            stage.draw();
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

            const blob = await stage.toBlob({ mimeType: 'image/png', pixelRatio });
            if (!blob || blob.size === 0) {
                throw new Error('PNG Blobを生成できませんでした。元画像は変更しません。');
            }

            const dataUrl = await blobToDataUrl(blob);
            if (!dataUrl.startsWith('data:image/png;base64,') || dataUrl.length <= 'data:image/png;base64,'.length) {
                throw new Error('PNG Data URLを生成できませんでした。元画像は変更しません。');
            }

            await invoke('fusen_save_annotated_image', { path: absolutePath, data: dataUrl });
            onSaved();
        } catch (err) {
            console.error('[ANNOTATION] save error', err);
            alert((language === 'en' ? 'Could not save: ' : '保存に失敗しました: ') + String(err));
        } finally {
            setIsSaving(false);
        }
    }, [absolutePath, blobToDataUrl, language, onSaved]);

`;

modal = modal.slice(0, saveStart) + replacement + modal.slice(saveEnd);

modal = modal.replace(
  'className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm"',
  'className="fixed inset-0 z-[2000] flex items-center justify-center overflow-hidden bg-black/70 p-2 backdrop-blur-sm"',
);
modal = modal.replace(
  'className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"\n                style={{ maxWidth: \'92vw\', maxHeight: \'92vh\' }}',
  'className="bg-white rounded-xl shadow-2xl flex min-h-0 w-full max-w-[92vw] flex-col overflow-hidden"\n                style={{ height: \'calc(100vh - 16px)\', maxHeight: \'92vh\' }}',
);
modal = modal.replace(
  'className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-gray-50 flex-wrap"',
  'className="flex shrink-0 items-center gap-3 px-4 py-2 border-b border-gray-200 bg-gray-50 flex-wrap"',
);
modal = modal.replace(
  'className="overflow-auto flex-1 flex items-center justify-center bg-gray-100 p-4"',
  'className="min-h-0 flex-1 overflow-auto bg-gray-100 p-4"',
);
modal = modal.replace(
  'ref={containerRef}\n                        style={{ cursor:',
  'ref={containerRef}\n                        className="mx-auto flex min-h-full w-max items-center justify-center"\n                        style={{ cursor:',
);
modal = modal.replace(
  'className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50"',
  'className="relative z-10 flex shrink-0 items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50"',
);

writeFileSync(modalPath, modal, 'utf8');
console.log('ImageAnnotationModal.tsx: switched to async Konva Blob export');
console.log('ImageAnnotationModal.tsx: save footer is always visible');

let msix = readFileSync(msixPath, 'utf8');
if (msix.includes('npm run tauri build')) {
  msix = msix.replace('npm run tauri build', 'npx tauri build --no-bundle');
  msix = msix.replace('if ($LASTEXITCODE -ne 0) { throw "npm run tauri build failed." }', 'if ($LASTEXITCODE -ne 0) { throw "npx tauri build --no-bundle failed." }');
  writeFileSync(msixPath, msix, 'utf8');
  console.log('test-msix.ps1: changed to --no-bundle build');
} else {
  console.log('test-msix.ps1: --no-bundle build already applied');
}

console.log('Done. Rebuild the local MSIX and test annotation save.');
