import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const SITE_URL = "https://ore-no-fusen.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/landing", "/viewer", "/use-cases/"],
        disallow: ["/api/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
