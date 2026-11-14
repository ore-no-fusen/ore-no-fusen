// @vitest-environment node
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, normalize } from 'node:path';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const fromPackage = (name: string) => createRequire(require.resolve(name));

describe('dependency consumer compatibility', () => {
  it('Sentry glob finds matching source files without including other files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fusen-glob-'));
    try {
      mkdirSync(join(dir, 'nested'));
      writeFileSync(join(dir, 'nested', 'note.md'), 'note');
      writeFileSync(join(dir, 'nested', 'other.txt'), 'other');
      const glob = fromPackage('@sentry/bundler-plugin-core')('glob');
      expect(glob.globSync('**/*.md', { cwd: dir }).map(normalize)).toEqual([join('nested', 'note.md')]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(['@fastify/otel', '@typescript-eslint/typescript-estree'])(
    '%s retains its named minimatch API and matching semantics', (consumer) => {
      const { minimatch } = fromPackage(consumer)('minimatch');
      expect(minimatch('nested/note.md', '**/*.md')).toBe(true);
      expect(minimatch('nested/note.txt', '**/*.md')).toBe(false);
    },
  );

  it('legacy consumers retain callable minimatch exports', () => {
    const oldMatcher = require('minimatch');
    const filelistMatcher = fromPackage('filelist')('minimatch');
    for (const matcher of [oldMatcher, filelistMatcher]) {
      expect(matcher('note.md', '*.md')).toBe(true);
      expect(matcher('note.txt', '*.md')).toBe(false);
    }
  });

  it('PWA minification serializes functions and RegExp options through its worker', async () => {
    const { terser } = require('rollup-plugin-terser');
    const plugin = terser({
      numWorkers: 1,
      format: { comments: (_node: unknown, comment: { value: string }) => /keep/.test(comment.value) },
      keep_fnames: /^keep/,
    });
    const result = await plugin.renderChunk(
      '/*! keep */ function keepAnswer(){return 1+2} globalThis.answer=keepAnswer();',
      {}, { format: 'iife' },
    );
    expect(result.code).toContain('keep');
    const sandbox: Record<string, unknown> = {};
    runInNewContext(result.code, sandbox);
    expect(sandbox.answer).toBe(3);
  });
});
