import type { MetadataRoute } from 'next';

const BASE = 'https://app.tiktrends.co';

/**
 * robots.txt · on ouvre les pages publiques (accueil, tarifs, inscription) et on
 * ferme l'application derrière l'authentification · elle n'a rien à faire dans un
 * index. On pointe le sitemap.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/dashboard',
          '/analytics',
          '/veille',
          '/radar',
          '/saved',
          '/tags',
          '/jarvis',
          '/studio',
          '/assets',
          '/adsmap',
          '/brands',
          '/team',
          '/connections',
          '/usage',
          '/billing',
          '/settings',
          '/support',
          '/onboarding',
          '/c/',
        ],
      },
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
