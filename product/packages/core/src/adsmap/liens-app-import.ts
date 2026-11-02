/**
 * ADSMAP · les liens de l'APPLICATION qu'un export réimporté ramène.
 *
 * L'export Résultats écrit, pour un média rangé au stockage privé, l'adresse
 * ABSOLUE de la route gardée de l'ad (`${appUrl()}/api/adsmap/<id>/apercu`,
 * `?media=brief` pour le brief · #1015, #1019). Réimporté tel quel, ce lien
 * partait en base dans `asset_url` / `brief_url` de la NOUVELLE ad · un lien
 * vers l'ANCIENNE ad, que la route sert sous la garde de l'ancienne (inutile au
 * mieux, cassé dès que l'ancienne change de marque ou disparaît).
 *
 * La règle :
 *  1. n'est un lien de l'application que ce qui a EXACTEMENT l'origine de
 *     l'application (`origineApp`, celle de `appUrl()`), ou un chemin absolu
 *     sans hôte (`/api/…`, la forme que montrent les écrans) · `//hôte/…`,
 *     `/\hôte`, un sous-domaine, un autre port ou un autre schéma ne le sont
 *     PAS : la valeur reste ce qu'elle était, un lien externe saisi ;
 *  2. sous `/api/adsmap/`, seule la route exacte est reconnue · identifiant
 *     UUID, `/apercu`, au plus un paramètre `media` connu (`mediaAdDemande`),
 *     ni identifiants, ni fragment. Toute autre forme est un lien de
 *     l'application qui ne désigne rien · écarté ;
 *  3. la route est résolue vers l'adresse EN BASE du média de l'ad d'origine
 *     (`sourceMediaAd`, la règle même de la route) · seulement si l'appelant a
 *     trouvé cette ad dans la MÊME marque et le MÊME espace que l'import
 *     (`sources`) · sinon écartée, et le rapport le dit ;
 *  4. une adresse résolue qui serait elle-même un lien de l'application est
 *     écartée · on ne recopie jamais un lien vers une autre ad.
 *
 * Pur : l'appelant fournit l'origine et les sources déjà bornées à la marque.
 */

import { mediaAdDemande, sourceMediaAd, type AdressesAdAdsmap, type MediaAdAdsmap } from '../studios/sources/departs-assistant';
import type { ImportPlan } from './import-sheet';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SCHEMA = /^[a-z][a-z0-9+.-]*:/i;

export type LectureLienApp =
  | { type: 'externe' }
  | { type: 'invalide' }
  | { type: 'route'; adId: string; media: MediaAdAdsmap };

/** L'URL d'une valeur SI elle désigne l'application (règle 1), sinon `null`. */
function urlDeLApp(valeur: string, base: URL): URL | null {
  if (SCHEMA.test(valeur)) {
    let u: URL;
    try { u = new URL(valeur); } catch { return null; }
    return u.origin === base.origin ? u : null;
  }
  // Chemin absolu sans hôte · `//hôte` et `/\hôte` désignent un AUTRE hôte.
  if (!valeur.startsWith('/') || valeur.startsWith('//') || valeur.startsWith('/\\')) return null;
  let u: URL;
  try { u = new URL(valeur, base.origin); } catch { return null; }
  return u.origin === base.origin ? u : null;
}

/** Ce que désigne une valeur de « Lien de l'Ad » / « Lien du Brief créa », vue depuis l'application d'origine `origineApp`. */
export function lireLienApp(valeur: string, origineApp: string): LectureLienApp {
  let base: URL;
  try { base = new URL(origineApp); } catch { return { type: 'externe' }; }
  const v = valeur.trim();
  const u = v ? urlDeLApp(v, base) : null;
  if (!u) return { type: 'externe' };

  const prefixe = `${base.pathname.replace(/\/+$/, '')}/api/adsmap/`;
  if (!u.pathname.startsWith(prefixe)) return { type: 'externe' };

  const m = /^([^/]+)\/apercu$/.exec(u.pathname.slice(prefixe.length));
  let id = '';
  try { id = m ? decodeURIComponent(m[1]!) : ''; } catch { id = ''; }
  const cles = [...u.searchParams.keys()];
  const media = cles.length === 0 ? 'lien'
    : cles.length === 1 && cles[0] === 'media' ? mediaAdDemande(u.searchParams.get('media')) : null;
  if (!UUID.test(id) || !media || u.username || u.password || u.hash) return { type: 'invalide' };
  return { type: 'route', adId: id.toLowerCase(), media };
}

export type IssueLienApp = 'externe' | 'resolu' | 'ecarte';

/**
 * La valeur à écrire en base pour un lien du fichier · inchangée (externe),
 * l'adresse en base du média de l'ad d'origine (résolu), ou rien (écarté).
 * `sources` · les adresses des ads de la MÊME marque et du MÊME espace,
 * par identifiant (en minuscules) · une ad absente est hors de portée.
 */
export function resoudreLienApp(
  valeur: string, origineApp: string, sources: ReadonlyMap<string, AdressesAdAdsmap>,
): { valeur: string | null; issue: IssueLienApp } {
  const l = lireLienApp(valeur, origineApp);
  if (l.type === 'externe') return { valeur, issue: 'externe' };
  if (l.type === 'invalide') return { valeur: null, issue: 'ecarte' };
  const src = sources.get(l.adId);
  const adresse = src ? sourceMediaAd(l.media, src) : null;
  if (!adresse || lireLienApp(adresse, origineApp).type !== 'externe') return { valeur: null, issue: 'ecarte' };
  return { valeur: adresse, issue: 'resolu' };
}

/** Les ads d'origine que les liens du plan désignent · à chercher, bornées à la marque et à l'espace de l'import. */
export function idsLiensApp(plan: ImportPlan, origineApp: string): string[] {
  const ids = new Set<string>();
  for (const a of plan.ads) {
    for (const v of [a.assetLabel, a.briefLabel]) {
      if (!v) continue;
      const l = lireLienApp(v, origineApp);
      if (l.type === 'route') ids.add(l.adId);
    }
  }
  return [...ids];
}

/**
 * Le plan, liens de l'application résolus ou écartés (`resoudreLienApp`) · le
 * rapport compte les deux et le dit en une phrase chacun, avant que rien ne
 * soit écrit. Un plan sans lien de l'application revient à l'identique.
 */
export function resoudreLiensApp(plan: ImportPlan, origineApp: string, sources: ReadonlyMap<string, AdressesAdAdsmap>): ImportPlan {
  let resolus = 0, ecartes = 0;
  const lien = (v: string | null): string | null => {
    if (!v) return v;
    const r = resoudreLienApp(v, origineApp, sources);
    if (r.issue === 'resolu') resolus++;
    if (r.issue === 'ecarte') ecartes++;
    return r.valeur;
  };
  const ads = plan.ads.map((a) => ({ ...a, assetLabel: lien(a.assetLabel), briefLabel: lien(a.briefLabel) }));
  if (!resolus && !ecartes) return plan;

  const avertissements: string[] = [];
  if (resolus) avertissements.push(`${resolus} lien(s) de l'application (export repris) remplacé(s) par l'adresse du média de l'ad d'origine, de la même marque.`);
  if (ecartes) avertissements.push(`${ecartes} lien(s) de l'application écarté(s) · ils désignaient une ad d'une autre marque ou d'un autre espace, introuvable ou sans ce média, ou une adresse de l'application invalide : laissés vides.`);
  return {
    ...plan,
    ads,
    report: { ...plan.report, liensAppResolus: resolus, liensAppEcartes: ecartes, warnings: [...avertissements, ...plan.report.warnings] },
  };
}
