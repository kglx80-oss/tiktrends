import { execSync } from 'node:child_process';

/**
 * L'empreinte du commit et l'heure du build, posées ICI, au build.
 *
 * ── Pourquoi au build et pas au déploiement ──────────────────────────────────
 *
 * « Réconcilier code et app » (CDC v7 · lot 0) demande de savoir quel commit
 * tourne réellement. Le lire ici — depuis le dépôt qu'on est en train de bâtir —
 * ne dépend d'aucune variable posée à la main dans le script de déploiement · le
 * build capte le commit qu'il compile, point. Un `BUILD_SHA` déjà fourni par
 * l'environnement l'emporte (CI qui le sait mieux) ; sinon on demande à git ;
 * sinon on ne prétend rien (`''`, affiché « inconnu »).
 */
function gitSha() {
  if (process.env.BUILD_SHA) return process.env.BUILD_SHA;
  try {
    return execSync('git rev-parse --short=8 HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', transpilePackages: ['@tiktrends/ui', '@tiktrends/core', '@tiktrends/ai', '@tiktrends/db', '@tiktrends/integrations'],
  env: {
    BUILD_SHA: gitSha(),
    BUILD_TIME: process.env.BUILD_TIME || new Date().toISOString(),
  },
  // La Veille s'appelait `/inspo` · la route est renommée `/veille` pour coller au
  // libellé. Un redirect permanent garde les anciens favoris et liens vivants.
  // Purge du cache navigateur, une fois par navigateur (règle
  // `regleEnTetesPurgeCache`, noyau `purge-cache.ts`) · un SVG piégé servi
  // avant #798 restait en cache `immutable` trente jours sur /api/asset/<id>.
  // Littéraux exigés ici (fichier lu par Node, sans TypeScript) · tenus égaux
  // à la règle du noyau par le test `purge-cache-config`.
  async headers() {
    return [
      {
        source: '/:path*',
        has: [
          { type: 'cookie', key: 'tt_session' },
          { type: 'header', key: 'accept', value: '.*text/html.*' },
        ],
        missing: [{ type: 'cookie', key: 'tt_cache_v', value: '2' }],
        headers: [
          { key: 'Clear-Site-Data', value: '"cache"' },
          { key: 'Set-Cookie', value: 'tt_cache_v=2; Max-Age=31536000; Path=/; SameSite=Lax' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      { source: '/inspo', destination: '/veille', permanent: true },
      { source: '/inspo/:path*', destination: '/veille/:path*', permanent: true },
    ];
  },
};
export default nextConfig;
