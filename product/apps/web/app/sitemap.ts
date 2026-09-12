import type { MetadataRoute } from 'next';

const BASE = 'https://app.tiktrends.co';

/**
 * Sitemap · uniquement les pages publiques indexables. Les écrans applicatifs
 * sont derrière l'authentification et exclus par robots.ts · pas ici.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/tarifs`, lastModified: now, changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/signup`, lastModified: now, changeFrequency: 'yearly', priority: 0.5 },
    { url: `${BASE}/login`, lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${BASE}/legal/mentions-legales`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/legal/cgv`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${BASE}/legal/confidentialite`, lastModified: now, changeFrequency: 'yearly', priority: 0.2 },
  ];
}
