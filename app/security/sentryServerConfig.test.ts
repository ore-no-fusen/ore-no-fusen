import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const readProjectFile = (name: string) =>
  fs.readFileSync(path.resolve(process.cwd(), name), 'utf8');

describe('Sentry server monitoring configuration', () => {
  it('registers both server runtimes and the Next.js request error hook', () => {
    const instrumentation = readProjectFile('instrumentation.ts');

    expect(instrumentation).toContain("NEXT_RUNTIME === 'nodejs'");
    expect(instrumentation).toContain("NEXT_RUNTIME === 'edge'");
    expect(instrumentation).toContain('Sentry.captureRequestError');
  });

  it.each(['sentry.server.config.ts', 'sentry.edge.config.ts'])(
    'does not collect request secrets in %s',
    (fileName) => {
      const config = readProjectFile(fileName);

      expect(config).toContain('sendDefaultPii: false');
      expect(config).toContain('delete event.request.cookies');
      expect(config).toContain('delete event.request.data');
      expect(config).toContain('delete event.request.headers');
      expect(config).toContain('delete event.request.query_string');
    },
  );
});
