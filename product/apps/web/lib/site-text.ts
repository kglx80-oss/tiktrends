import 'server-only';
import { safeFetch } from '@tiktrends/integrations/src/safe-fetch';

/**
 * Récupère le texte visible d'une page (enrichissement de marque).
 *
 * Vit ici et non dans `@tiktrends/ai` : c'est un scraper, pas de l'IA, et le paquet
 * `ai` est importé par des composants client (constantes, types). Y laisser un
 * import de `node:dns` faisait échouer le bundle navigateur.
 *
 * L'URL vient d'un champ libre : safeFetch refuse les adresses internes et
 * revalide chaque redirection (sinon http://169.254.169.254 ferait lire les
 * métadonnées du VPS par notre propre serveur).
 */
export async function fetchSiteText(url: string): Promise<string> {
  const target = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const res = await safeFetch(target, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; TikTrendsBot/1.0)' },
    maxBytes: 4_000_000,
  });
  if (!res) throw new Error('Site inaccessible ou adresse refusée.');
  return res.body.toString('utf8')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
}
