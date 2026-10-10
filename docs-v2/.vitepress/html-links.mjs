// Images are processed by Vite; only raw HTML href attributes need a prefix.
// Raw HTML links do not receive VitePress's Markdown base-path handling.
export function addBaseToHtmlUrls(html, base) {
  return html.replace(/(\s)(href)=(['"])(\/[^'"]*)\3/g, (match, space, attribute, quote, url) => {
    if (base === '/' || url.startsWith('//') || url === base.slice(0, -1) || url.startsWith(base)) return match;
    return space + attribute + '=' + quote + base + url.slice(1) + quote;
  });
}

export function htmlBaseLinks(md, base) {
  for (const rule of ['html_block', 'html_inline']) {
    const render = md.renderer.rules[rule];
    md.renderer.rules[rule] = (...args) => addBaseToHtmlUrls(render(...args), base);
  }
}
