// Images are processed by Vite; only raw HTML href attributes need a prefix.
// Raw HTML links do not receive VitePress's Markdown base-path handling.
export function addBaseToHtmlUrls(html, base) {
  return html.replace(/(\s)(href)=(['"])(\/[^'"]*)\3/g, (match, space, attribute, quote, url) => {
    if (url.startsWith('//')) return match;
    const [, pathname, suffix] = url.match(/^([^?#]*)(.*)$/);
    const page = pathname.endsWith('/') || /\.[^/]+$/.test(pathname) ? pathname : pathname + '.html';
    const target = base === '/' || page.startsWith(base) ? page : base + page.slice(1);
    return space + attribute + '=' + quote + target + suffix + quote;
  });
}

export function htmlBaseLinks(md, base) {
  for (const rule of ['html_block', 'html_inline']) {
    const render = md.renderer.rules[rule];
    md.renderer.rules[rule] = (...args) => addBaseToHtmlUrls(render(...args), base);
  }
}
