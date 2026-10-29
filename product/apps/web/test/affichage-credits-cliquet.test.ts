import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Facturation 100 % crédits · le CLIENT ne lit plus d'argent (décision de Kevin
 * du 29/10, point 1) · sauf le prix d'un forfait au moment de le choisir et
 * celui d'une recharge au moment de l'acheter. Le dollar reste au serveur
 * (plafond interne `sousPlafond`) et à l'Admin (coût réel).
 *
 * Balayage de TOUTES les vues client (`spatial/` hors `vues/admin/`, pages
 * `app/(spatial)/sp/` hors `admin/`, `console/`, `credits/`), commentaires
 * retirés :
 *  · aucun formateur de dollars ou d'euros de facturation (`libelleUsd`,
 *    `phraseCoutDevis`, `libelleCoutTexteEstime`, `libelleCaseControleVision`,
 *    `formatUsd`, `usdLisible`, `adminEuros`, `eurosFinance`) ;
 *  · aucun « $ » écrit (« 0,60 $ », « } $ », « ' $' ») hors des exceptions
 *    nommées ci-dessous ;
 *  · aucun « € » hors des exceptions nommées · ce sont les métriques
 *    PUBLICITAIRES du client (son CPA, son budget Meta, le prix de son produit,
 *    la dépense estimée d'un concurrent), qui sont ses euros à lui, et les deux
 *    moments autorisés (choix du forfait, achat d'une recharge).
 * Un fichier ne peut pas dépasser son compte ; un fichier absent de la table
 * n'en a droit à aucun. Les rendus (`spatial-studios-assistant-devis`,
 * `plafond-interne-client`) vérifient le même résultat dans le HTML.
 */
const RACINE = join(__dirname, '..');
const DOSSIERS = ['spatial', 'app/(spatial)/sp'];
const EXCLUS = ['spatial/vues/admin/', 'app/(spatial)/sp/admin/', 'app/(spatial)/sp/console/', 'app/(spatial)/sp/credits/'];

const DOLLARS_AUTORISES: Record<string, [number, string]> = {
  'spatial/vues/resultats/RadarAdsmap.tsx': [1, 'plafond global, PERSONNEL de la plateforme seulement (`vue.spend` absent pour un client)'],
};
const EUROS_AUTORISES: Record<string, [number, string]> = {
  'spatial/vues/coquille/ParcoursAccueil.tsx': [1, 'choix du forfait à l’accueil (autorisé)'],
  'app/(spatial)/sp/billing/page.tsx': [1, 'prix d’une recharge au moment de l’acheter (autorisé)'],
  'spatial/vues/marque/Offre.tsx': [1, 'prix du produit du client'],
  'spatial/vues/veille/client.tsx': [2, 'CPM de la veille · dépense publicitaire estimée des concurrents'],
  'app/(spatial)/sp/veille/cartes.ts': [1, 'CPM de la veille'],
  'spatial/vues/projet/Rattachement.tsx': [1, 'exemple d’objectif CPA du client'],
  'spatial/vues/resultats/Tests.tsx': [1, 'métriques Meta du client'],
  'spatial/vues/resultats/ReglagesProtocole.tsx': [2, 'budget et CPA cible du protocole du client'],
  'spatial/vues/resultats/ActionsLot.tsx': [1, 'budget publicitaire du lot'],
  'spatial/vues/resultats/Protocole.tsx': [1, 'CPA cible du client'],
  'spatial/vues/resultats/Suites.tsx': [1, 'dépense Meta engagée par le client'],
  'app/(spatial)/sp/settings/page.tsx': [1, 'devise des métriques du client'],
  'app/(spatial)/sp/adsmap/page.tsx': [1, 'CPA cible du client'],
  'app/(spatial)/sp/adsmap/lots/page.tsx': [2, 'CPA cible du client'],
  'app/(spatial)/sp/adsmap/tests/[id]/page.tsx': [1, 'métriques Meta du client'],
};

const FORMATEURS = /\b(libelleUsd|phraseCoutDevis|libelleCoutTexteEstime|libelleCaseControleVision|formatUsd|usdLisible|adminEuros|eurosFinance)\s*\(/;
const DOLLAR = /[\d}]\s\$(?![{\w])|['"`]\s?\$['"`]/;
const EURO = /€/;

function fichiers(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? fichiers(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}
const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function compter(motif: RegExp): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const f of DOSSIERS.flatMap((d) => fichiers(join(RACINE, d)))) {
    const rel = relative(RACINE, f).split('\\').join('/');
    if (EXCLUS.some((e) => rel.startsWith(e))) continue;
    const lignes = sansCommentaires(readFileSync(f, 'utf8')).split('\n').filter((l) => motif.test(l));
    if (lignes.length) out.set(rel, lignes.map((l) => l.trim().slice(0, 120)));
  }
  return out;
}

describe('affichage client · des crédits, jamais d’argent de facturation', () => {
  it('aucun formateur de dollars ou d’euros de facturation dans une vue client', () => {
    expect([...compter(FORMATEURS)].map(([f, l]) => `${f} · ${l.join(' | ')}`)).toEqual([]);
  });

  it('aucun « $ » hors des exceptions nommées', () => {
    const fautes = [...compter(DOLLAR)].filter(([f, l]) => l.length > (DOLLARS_AUTORISES[f]?.[0] ?? 0)).map(([f, l]) => `${f} · ${l.length} au lieu de ${DOLLARS_AUTORISES[f]?.[0] ?? 0} · ${l.join(' | ')}`);
    expect(fautes).toEqual([]);
  });

  it('aucun « € » hors des exceptions nommées (métriques publicitaires du client, choix du forfait, achat d’une recharge)', () => {
    const fautes = [...compter(EURO)].filter(([f, l]) => l.length > (EUROS_AUTORISES[f]?.[0] ?? 0)).map(([f, l]) => `${f} · ${l.length} au lieu de ${EUROS_AUTORISES[f]?.[0] ?? 0} · ${l.join(' | ')}`);
    expect(fautes).toEqual([]);
  });
});
