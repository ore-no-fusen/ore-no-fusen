import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const modalPath = join(root, 'app', 'components', 'ImageAnnotationModal.tsx');
let modal = readFileSync(modalPath, 'utf8');

modal = modal.replace(
  "import { LogicalSize, PhysicalSize } from '@tauri-apps/api/dpi';",
  "import { LogicalSize, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';",
);

const start = modal.indexOf('    // ─── ウィンドウ拡大');
const end = modal.indexOf('    // ─── Keyboard shortcut', start);
if (start < 0 || end < 0) {
  throw new Error('ImageAnnotationModal.tsx window resize block was not found.');
}

const replacement = `    // ─── ウィンドウ拡大・中央表示（モーダル表示中のみ）───────────────\n    useEffect(() => {\n        const win = getCurrentWindow();\n        let originalSize: { width: number; height: number } | null = null;\n        let originalPosition: { x: number; y: number } | null = null;\n        let cancelled = false;\n\n        const moveToCenter = async () => {\n            try {\n                const [size, position] = await Promise.all([win.outerSize(), win.outerPosition()]);\n                if (cancelled) return;\n                originalSize = { width: size.width, height: size.height };\n                originalPosition = { x: position.x, y: position.y };\n                await win.setSize(new LogicalSize(680, 540));\n                if (!cancelled) await win.center();\n            } catch (error) {\n                console.warn('[ANNOTATION] window center failed', error);\n            }\n        };\n\n        void moveToCenter();\n        return () => {\n            cancelled = true;\n            if (originalSize) {\n                void win.setSize(new PhysicalSize(originalSize.width, originalSize.height));\n            }\n            if (originalPosition) {\n                void win.setPosition(new PhysicalPosition(originalPosition.x, originalPosition.y));\n            }\n        };\n    }, []);\n\n`;

modal = modal.slice(0, start) + replacement + modal.slice(end);
writeFileSync(modalPath, modal, 'utf8');
console.log('ImageAnnotationModal.tsx: annotation window opens centered and restores the note position');
