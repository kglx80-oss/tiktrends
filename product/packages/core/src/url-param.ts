/**
 * Ajouter un paramètre à une URL, sans casser celles qui n'en ont pas.
 *
 * ── Le défaut, deux fois ─────────────────────────────────────────────────────
 *
 * La grille des pubs demande des vignettes en collant `&t=1` à l'URL. Ça marche
 * pour une pub, dont l'adresse porte déjà `?v=…`. Ça ne marche pas pour une
 * référence de la bibliothèque, dont l'adresse est `/api/asset/<id>` toute nue :
 * on obtient `/api/asset/<id>&t=1`, le routeur lit un identifiant qui n'existe
 * pas, et la vignette s'affiche cassée.
 *
 * C'est la deuxième fois que les images de la bibliothèque cassent · la première
 * portait sur le mode de service, celle-ci sur la ponctuation d'une URL.
 * Concaténer des URL à la main marche jusqu'au jour où l'entrée change de forme,
 * et ce jour-là rien ne prévient.
 *
 * ── Ce qui est laissé intact ─────────────────────────────────────────────────
 *
 * Les `data:` et les `blob:` · une image encodée dans son adresse n'a pas de
 * paramètres, et lui en ajouter la rendrait illisible.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

export function withParam(url: string, key: string, value: string | number): string {
  const u = (url ?? '').trim();
  if (!u) return u;
  // Une adresse qui PORTE la donnée ne se paramètre pas.
  if (/^(data|blob):/i.test(u)) return u;

  // Le fragment reste en queue · un paramètre glissé après lui ne serait jamais
  // envoyé au serveur.
  const diese = u.indexOf('#');
  const corps = diese === -1 ? u : u.slice(0, diese);
  const fragment = diese === -1 ? '' : u.slice(diese);

  const sep = corps.includes('?') ? '&' : '?';
  return `${corps}${sep}${encodeURIComponent(key)}=${encodeURIComponent(String(value))}${fragment}`;
}
