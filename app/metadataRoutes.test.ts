import { describe, expect, it } from 'vitest';
import { dynamic as robotsDynamic } from './robots';
import { dynamic as sitemapDynamic } from './sitemap';

describe('static metadata routes', () => {
  it('keeps robots and sitemap compatible with Tauri static export', () => {
    expect(robotsDynamic).toBe('force-static');
    expect(sitemapDynamic).toBe('force-static');
  });
});
