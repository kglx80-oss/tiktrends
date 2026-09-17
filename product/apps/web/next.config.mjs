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
  async redirects() {
    return [
      { source: '/inspo', destination: '/veille', permanent: true },
      { source: '/inspo/:path*', destination: '/veille/:path*', permanent: true },
    ];
  },
};
export default nextConfig;
