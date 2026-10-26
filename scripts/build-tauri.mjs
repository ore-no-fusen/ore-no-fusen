import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFrontend } from './tauri-frontend-stage.mjs';
await buildFrontend(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
