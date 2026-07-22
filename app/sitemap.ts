import type { MetadataRoute } from "next";

const SITE_URL = "https://ore-no-fusen.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: SITE_URL,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/viewer`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/use-cases/ai-coding-sticky-notes`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/use-cases/windows-sticky-notes`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.75,
    },
    {
      url: `${SITE_URL}/use-cases/iphone-google-drive-notes`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];
}
