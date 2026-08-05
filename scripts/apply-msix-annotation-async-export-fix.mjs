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

const replacement = `    // BlobをTauriへ渡せるData URLへ変換する。\n    // Konva.Stageの合成は環境によって非同期になるため、同期toDataURLの戻り値を使わない。\n    const blobToDataUrl = useCallback((blob: Blob): Promise<string> => {\n        return new Promise((resolve, reject) => {\n            const reader = new FileReader();\n            reader.onload = () => {\n                if (typeof reader.result === 'string') resolve(reader.result);\n                else reject(new Error('画像Data URLを生成できませんでした。'));\n            };\n            reader.onerror = () => reject(reader.error ?? new Error('画像Data URLの読込に失敗しました。'));\n            reader.readAsDataURL(blob);\n        });\n    }, []);\n\n    // ─── Save ────────────────────────────────────────────────────────────\n    const handleSave = useCallback(async () => {\n        const stage = stageRef.current;\n        if (!stage) return;\n        setIsSaving(true);\n        try {\n            const { w: nw } = naturalSizeRef.current;\n            const { w: sw } = stageSizeRef.current;\n            const pixelRatio = sw > 0 && nw > 0 ? nw / sw : 1;\n\n            // 描画キューを確定し、WebView2がCanvas合成を終えるまで1フレーム待つ。\n            stage.draw();\n            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));\n\n            // Stage.toDataURL()の同期戻り値はMSIX WebView2で空文字になるため、\n            // 非同期toBlob()の完了を待ってからData URLへ変換する。\n            const blob = await stage.toBlob({ mimeType: 'image/png', pixelRatio });\n            if (!blob || blob.size === 0) {\n                throw new Error('PNG Blobを生成できませんでした。元画像は変更しません。');\n            }\n\n            const dataUrl = await blobToDataUrl(blob);\n            if (!dataUrl.startsWith('data:image/png;base64,') || dataUrl.length <= 'data:image/png;base64,'.length) {\n                throw new Error('PNG Data URLを生成できませんでした。元画像は変更しません。');\n            }\n\n            await invoke('fusen_save_annotated_image', { path: absolutePath, data: dataUrl });\n            onSaved();\n        } catch (err) {\n            console.error('[ANNOTATION] save error', err);\n            alert(\`${language === 'en' ? 'Could not save: ' : '保存に失敗しました: '}\${err}\`);\n        } finally {\n            setIsSaving(false);\n        }\n    }, [absolutePath, blobToDataUrl, language, onSaved]);\n\n`;

modal = modal.slice(0, saveStart) + replacement + modal.slice(saveEnd);
writeFileSync(modalPath, modal, 'utf8');
console.log('ImageAnnotationModal.tsx: switched to async Konva Blob export');

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
