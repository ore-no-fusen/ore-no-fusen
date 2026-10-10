import test from 'node:test';
import assert from 'node:assert/strict';
import { addBaseToHtmlUrls, htmlBaseLinks } from './html-links.mjs';
const base = '/ore-no-fusen/';
test('HTML cards stay inside the deployed site and image processing stays with Vite', () => {
  assert.equal(addBaseToHtmlUrls('<a href="/user-guide/basic">Basic</a><img src="/promo/comic.png">', base), '<a href="/ore-no-fusen/user-guide/basic">Basic</a><img src="/promo/comic.png">');
  assert.equal(addBaseToHtmlUrls("<a href='/003_IPHONE.html#sec3-0'>Link</a>", base), "<a href='/ore-no-fusen/003_IPHONE.html#sec3-0'>Link</a>");
});
test('external, relative, fragment and already prefixed URLs stay unchanged', () => {
  const html = '<a href="https://example.com">x</a><a href="//example.com">x</a><a href="#part">x</a><a href="./basic.html">x</a><a href="/ore-no-fusen/user-guide/basic">x</a><a href="/ore-no-fusen">x</a>';
  assert.equal(addBaseToHtmlUrls(html, base), html);
  assert.equal(addBaseToHtmlUrls('<a href="/user-guide/basic">x</a>', '/'), '<a href="/user-guide/basic">x</a>');
});
test('both inline and block renderers keep their existing output', () => {
  const md = { renderer: { rules: { html_block: () => '<div><a href="/user-guide/basic">x</a></div>', html_inline: () => '<a href="/005_GLOSSARY.html#sec0">' } } };
  htmlBaseLinks(md, base);
  assert.equal(md.renderer.rules.html_block(), '<div><a href="/ore-no-fusen/user-guide/basic">x</a></div>');
  assert.equal(md.renderer.rules.html_inline(), '<a href="/ore-no-fusen/005_GLOSSARY.html#sec0">');
});
