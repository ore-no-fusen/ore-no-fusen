const OWNER = "ore-no-fusen";
const REPO = "ore-no-fusen";
const GITHUB_API = "https://api.github.com";

const BADGES = {
  "release.svg": {
    key: "release",
    label: "release",
    color: "#007ec6",
  },
  "downloads-total.svg": {
    key: "downloads-total",
    label: "downloads total",
    color: "#4c1",
  },
  "downloads-latest.svg": {
    key: "downloads-latest",
    label: "downloads latest",
    color: "#4c1",
  },
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const badgeName = url.pathname.replace(/^\/badges\//, "");
    const spec = BADGES[badgeName];

    if (!spec || url.pathname === badgeName) {
      return new Response("Not found", { status: 404 });
    }

    try {
      const value = await fetchBadgeValue(spec.key, env);
      const badge = {
        label: spec.label,
        message: value,
        color: spec.color,
        updatedAt: new Date().toISOString(),
      };
      ctx.waitUntil(writeCache(env, spec.key, badge));
      return svgResponse(renderBadgeSvg(badge));
    } catch (error) {
      const cached = await readCache(env, spec.key);
      if (cached) {
        return svgResponse(renderBadgeSvg(cached, { stale: true }));
      }

      return svgResponse(renderBadgeSvg({
        label: spec.label,
        message: "unknown",
        color: "#9f9f9f",
        updatedAt: new Date().toISOString(),
      }));
    }
  },
};

async function fetchBadgeValue(key, env) {
  if (key === "release") {
    const latest = await githubJson(`/repos/${OWNER}/${REPO}/releases/latest`, env);
    return latest.tag_name || "unknown";
  }

  if (key === "downloads-latest") {
    const latest = await githubJson(`/repos/${OWNER}/${REPO}/releases/latest`, env);
    return formatCount(sumAssetDownloads(latest.assets || []));
  }

  if (key === "downloads-total") {
    let page = 1;
    let total = 0;

    while (page <= 10) {
      const releases = await githubJson(`/repos/${OWNER}/${REPO}/releases?per_page=100&page=${page}`, env);
      if (!Array.isArray(releases) || releases.length === 0) break;
      for (const release of releases) {
        total += sumAssetDownloads(release.assets || []);
      }
      if (releases.length < 100) break;
      page += 1;
    }

    return formatCount(total);
  }

  return "unknown";
}

async function githubJson(path, env) {
  const headers = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "ore-no-fusen-badge-worker",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  const response = await fetch(`${GITHUB_API}${path}`, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API failed: ${response.status}`);
  }
  return response.json();
}

function sumAssetDownloads(assets) {
  return assets.reduce((sum, asset) => sum + Number(asset.download_count || 0), 0);
}

function formatCount(value) {
  if (value >= 1_000_000) return `${trimNumber(value / 1_000_000)}m`;
  if (value >= 1000) return `${trimNumber(value / 1000)}k`;
  return String(value);
}

function trimNumber(value) {
  const fixed = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return fixed.replace(/\.0$/, "");
}

async function readCache(env, key) {
  if (!env.BADGE_CACHE) return null;
  const value = await env.BADGE_CACHE.get(`badge:${key}`, "json");
  return isBadge(value) ? value : null;
}

async function writeCache(env, key, badge) {
  if (!env.BADGE_CACHE) return;
  await env.BADGE_CACHE.put(`badge:${key}`, JSON.stringify(badge));
}

function isBadge(value) {
  return Boolean(
    value &&
    typeof value.label === "string" &&
    typeof value.message === "string" &&
    typeof value.color === "string",
  );
}

function svgResponse(svg) {
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
      "Expires": "0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function renderBadgeSvg({ label, message, color }, { stale = false } = {}) {
  const displayMessage = stale ? `${message} ※` : message;
  const leftWidth = textWidth(label) + 10;
  const rightWidth = textWidth(displayMessage) + 10;
  const width = leftWidth + rightWidth;
  const escapedLabel = escapeXml(label);
  const escapedMessage = escapeXml(displayMessage);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escapedLabel}: ${escapedMessage}">
  <title>${escapedLabel}: ${escapedMessage}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${width}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftWidth}" height="20" fill="#555"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${escapeXml(color)}"/>
    <rect width="${width}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${leftWidth * 5}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(leftWidth - 10) * 10}">${escapedLabel}</text>
    <text x="${leftWidth * 5}" y="140" transform="scale(.1)" textLength="${(leftWidth - 10) * 10}">${escapedLabel}</text>
    <text aria-hidden="true" x="${leftWidth * 10 + rightWidth * 5}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${(rightWidth - 10) * 10}">${escapedMessage}</text>
    <text x="${leftWidth * 10 + rightWidth * 5}" y="140" transform="scale(.1)" textLength="${(rightWidth - 10) * 10}">${escapedMessage}</text>
  </g>
</svg>`;
}

function textWidth(text) {
  return Math.max(10, text.length * 7);
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
