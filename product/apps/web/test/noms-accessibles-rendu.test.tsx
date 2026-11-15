// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Des contrôles de ligne aux noms distincts (suite de #1089) · chaque vue
 * recensée (Résultats, lignée, Studios), RENDUE avec au moins deux lignes ·
 * on lit le DOM comme un lecteur d'écran (`aria-labelledby`, `aria-label`,
 * texte) et on exige ·
 *  · aucun nom accessible en double menant à deux cibles (WCAG 2.4.4 / 2.4.9) ;
 *  · chaque nom contient le libellé visible (WCAG 2.5.3) ;
 *  · ÉGALITÉ · hors des `aria-label` ajoutés (qui commencent par le libellé
 *    visible), le rendu est celui de la capture faite sur main avant le
 *    changement (`fixtures/noms-accessibles-avant.html`) · texte visible et
 *    balisage identiques.
 * 0 $ · rien n'est appelé (les actions serveur sont neutralisées), aucune date relative à l'horloge.
 */

vi.mock('next/navigation', () => ({ usePathname: () => '/adsmap', useRouter: () => ({ push() {}, refresh() {}, replace() {}, back() {}, prefetch() {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/adsmap-batch', () => ({ createBatchAction: async () => ({}), setBatchAdAction: async () => ({}), prepareBatchAction: async () => ({}), launchBatchAction: async () => ({}) }));
vi.mock('../app/actions/adsmap-verdict', () => ({ validateVerdictAction: async () => ({}), createIterationAction: async () => ({}) }));
vi.mock('../app/actions/adsmap', () => ({ exportAdsCsvAction: async () => ({}), syncAdsMapAction: async () => ({}) }));
vi.mock('../app/actions/adsmap-bridge', () => ({ conceptBriefAction: async () => ({}) }));
vi.mock('../app/actions/adsmap-decisions', () => ({ resolveDecisionAction: async () => ({}), refreshDecisionsAction: async () => ({}) }));
vi.mock('../app/actions/adsmap-share', () => ({ createShareLinkAction: async () => ({}), revokeShareLinkAction: async () => ({}) }));
vi.mock('../app/actions/adsmap-curation', () => ({ validateNodeAction: async () => ({}), rejectNodeAction: async () => ({}), validateManyAction: async () => ({}), mergeCandidatesAction: async () => ({ personas: [] }), mergePlanAction: async () => ({}), mergePersonasAction: async () => ({}) }));
vi.mock('../app/actions/adsmap-propose', () => ({ proposePersonasAction: async () => ({}), proposeDesiresAction: async () => ({}), proposeAnglesAction: async () => ({}), proposeConceptsAction: async () => ({}) }));
vi.mock('../app/actions/studios/archivage', () => ({ supprimerProjet: async () => ({ ok: true }), restaurerProjet: async () => ({ ok: true }) }));
vi.mock('../app/actions/studios/sources', () => ({ creerProjetDepuisContexte: async () => ({ ok: true }) }));
vi.mock('../app/actions/studios/projets', () => ({ creerProjet: async () => ({ ok: true }) }));
vi.mock('../app/actions/brands', () => ({ setActiveBrand: async () => {} }));

import { COUT_PROPOSITION_CARTE } from '@tiktrends/core';
import { avecSpatial } from './spatial/fournisseur';
import { VUES_NOMS } from './helpers/noms-accessibles-vues';
import { ecartsDeNoms, nomAccessible, sansNomsAjoutes } from './helpers/noms-accessibles';

const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
/** Le rendu d'une vue · React place un `<link rel=preload>` par image en tête · retiré. */
const rendreVue = (cle: string) => renderToStaticMarkup(avecSpatial(VUES_NOMS[cle]!())).replace(/^(?:<link[^>]*>)+/, '');

/** La capture faite sur main · une section par vue, rangée par clé. */
function capture(): Record<string, string> {
  const brut = readFileSync(join(__dirname, 'fixtures/noms-accessibles-avant.html'), 'utf8');
  const out: Record<string, string> = {};
  for (const m of brut.matchAll(/<!-- vue · (.+?) -->\n([^]*?)\n<!-- fin · \1 -->/g)) out[m[1]!] = m[2]!;
  return out;
}

/**
 * Les contrôles de ligne que la vue DOIT porter en double au moins (sinon la
 * garde ne regarde rien) · le libellé visible, et combien de fois au moins.
 */
const ATTENDUS: Record<string, ReadonlyArray<[string, number]>> = {
  'resultats/lot · fiche conclue': [['Fiche', 3]],
  'resultats/actions-lot · composition': [['Fiche', 2], ['Retirer', 2], ['Ajouter', 2]],
  'resultats/actions-lot · arbitrage': [['Valider le verdict', 2], ['Cette variante', 2]],
  'resultats/lots': [['Voir', 2]],
  'resultats/tests': [['Arbitrer', 1], ['Ouvrir', 1], ['Studio', 2]],
  'resultats/decisions': [['Ouvrir la fiche', 2], ['Fait', 2], ['Pas un problème', 2]],
  'resultats/fiche-test · filiation': [['Ouvrir', 3]],
  'resultats/hypotheses': [['Voir', 2]],
  'resultats/boucle': [['Formuler', 2], ['Compléter', 2], ['Suivre', 2], ['Conclure', 2]],
  'resultats/apprentissages': [['Itérer', 2]],
  'resultats/vue-ensemble': [['Suivre', 2]],
  'resultats/partage': [['Copier', 2], ['Révoquer', 2]],
  'resultats/tri': [['Valider', 2], ['Refuser', 2]],
  'resultats/carte': [[`Proposer des désirs · ${COUT_PROPOSITION_CARTE}`, 2]],
  'projet/lignee': [['Montrer sur le canvas', 4], ['Ouvrir le test dans Adsmap', 3]],
  'studios/prompts': [['Utiliser', 2], ['Copier', 2], ['Lancer comme itération', 2]],
  'studios/iterations': [['Itérer', 2]],
};

describe('la garde commune n’a AUCUNE exception (l’écart déclaré de #1089 est retiré)', () => {
  it('« Fiche », « Montrer sur le canvas », « Ouvrir le test dans Adsmap » en double vers deux cibles · signalés comme tout autre nom', () => {
    const d = dom(['Fiche', 'Montrer sur le canvas', 'Ouvrir le test dans Adsmap'].map((n, k) => `<a href="/x${k}a">${n}</a><a href="/x${k}b">${n}</a>`).join(''));
    expect(ecartsDeNoms(d).doublons, 'la garde laisse passer un nom de ligne en double').toEqual([
      'Fiche → lien /x0a | lien /x0b', 'Montrer sur le canvas → lien /x1a | lien /x1b', 'Ouvrir le test dans Adsmap → lien /x2a | lien /x2b',
    ]);
  });
  it('un nom qui ne contient pas le libellé visible · signalé', () => {
    const d = dom('<button type="button" aria-label="Voir V3 sur le canvas">Montrer sur le canvas</button>');
    expect(ecartsDeNoms(d).sansLibelle, 'la garde laisse passer un nom sans le libellé visible').toEqual(['Voir V3 sur le canvas ⇐ Montrer sur le canvas']);
  });
});

describe('des contrôles de ligne aux noms distincts · chaque vue recensée, rendue', () => {
  it('préalable · toutes les vues recensées ont leurs attendus et leur capture', () => {
    expect(Object.keys(ATTENDUS).sort(), 'une vue recensée sans attendus (ou l’inverse)').toEqual(Object.keys(VUES_NOMS).sort());
    expect(Object.keys(capture()).sort(), 'une vue recensée sans capture faite sur main').toEqual(Object.keys(VUES_NOMS).sort());
  });

  for (const cle of Object.keys(VUES_NOMS)) {
    it(`${cle} · aucun nom en double vers deux cibles · chaque nom contient le libellé visible`, () => {
      const d = dom(rendreVue(cle));
      for (const [libelle, n] of ATTENDUS[cle] ?? []) {
        const de = [...d.querySelectorAll('a[href], button')].filter((x) => (x.textContent ?? '').replace(/\s+/g, ' ').trim() === libelle);
        expect(de.length, `préalable · « ${libelle} » rendu ${de.length} fois, attendu au moins ${n}`).toBeGreaterThanOrEqual(n);
        for (const x of de) expect(nomAccessible(x, d).startsWith(libelle), `le nom de « ${libelle} » ne commence pas par son libellé visible · « ${nomAccessible(x, d)} »`).toBe(true);
      }
      const e = ecartsDeNoms(d);
      expect(e.doublons, 'deux contrôles de même nom accessible mènent à des cibles différentes').toEqual([]);
      expect(e.sansLibelle, 'un nom accessible ne contient pas le libellé visible').toEqual([]);
    });
  }
});

describe('égalité · hors des aria-label ajoutés, la capture de main', () => {
  for (const cle of Object.keys(VUES_NOMS)) {
    it(`${cle} · texte visible et balisage identiques à la capture`, () => {
      const avant = capture()[cle]!;
      const apres = rendreVue(cle);
      const { html, avant: reference, retires } = sansNomsAjoutes(apres, avant);
      expect(retires, 'préalable · aucun nom ajouté sur cette vue').toBeGreaterThan(0);
      expect(dom(apres).textContent, 'le texte visible a changé').toBe(dom(avant).textContent);
      expect(html, 'hors des aria-label ajoutés, le rendu a changé').toBe(reference);
    });
  }
});
