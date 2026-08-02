import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type TauriConfig = {
  app?: {
    security?: {
      csp?: string | null;
      devCsp?: string | null;
    };
  };
};

const config = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'src-tauri/tauri.conf.json'), 'utf8'),
) as TauriConfig;

describe('Tauri content security policy', () => {
  it('enables a restrictive production CSP', () => {
    const csp = config.app?.security?.csp;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('limits unsafe eval to the development CSP', () => {
    expect(config.app?.security?.devCsp).toContain("'unsafe-eval'");
  });
});
