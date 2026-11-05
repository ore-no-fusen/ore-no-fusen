import { spawn } from 'node:child_process';

// Keep an owned ancestor alive until all inherited output pipes close. This lets
// Windows taskkill /T stop descendants even if the command exits before them.
const [file, ...args] = process.argv.slice(2);
const child = spawn(file, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', code => { process.exitCode = code ?? 1; });
