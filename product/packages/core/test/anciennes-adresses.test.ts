import { describe, it, expect } from 'vitest';
import {
  destinationAncienneAdresse, lienNouveauProjet, lireContexteNouveauProjet, notesContexte, objectifDepuisIteration, lienIterationStudio,
  ANCIENNES_ADRESSES_STUDIO, CHEMIN_PROJETS, CHEMIN_NOUVEAU_PROJET, PARAMS_NOUVEAU_PROJET, briefDepuisTest, contexteVeille,
} from '../src';

const REF = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const ITER = 'ada00000-0000-4000-8000-000000000002';
const lire = (href: string) => {
  const u = new URL(href, 'https://x.test');
  return { chemin: u.pathname, p: Object.fromEntries(u.searchParams) };
};

describe('anciennes adresses · une destination utile, jamais une boucle ni un 404', () => {
  it('favori simple (sans contexte) ⇒ la liste des projets, pour chaque ancien studio', () => {
    for (const a of ANCIENNES_ADRESSES_STUDIO) expect(destinationAncienneAdresse(a, {})).toBe(CHEMIN_PROJETS);
    expect(destinationAncienneAdresse('/studio/ads', { mode: 'clone' })).toBe(CHEMIN_PROJETS);
  });

  it('aucune destination ne revient sous un ancien studio', () => {
    const cas: Array<[string, Record<string, string>]> = [
      ['/studio/ads', { angle: 'Hook', ref: REF, src: 'meta:1', srcnom: 'X', depuis: 'veille', rv: contexteVeille({ q: 'serum' }) }],
      ['/studio/video', { prompt: 'Plan serré' }], ['/studio/textes', { brand: 'Sérum', inspo: 'Avant/après' }], ['/studio', { angle: 'x' }],
    ];
    for (const [a, sp] of cas) {
      const d = destinationAncienneAdresse(a, sp);
      expect(ANCIENNES_ADRESSES_STUDIO.some((x) => lire(d).chemin === x)).toBe(false);
      expect([CHEMIN_PROJETS, CHEMIN_NOUVEAU_PROJET]).toContain(lire(d).chemin);
    }
  });

  it('Pubs IA depuis la Veille ⇒ préparation, annonce sauvegardée, angle, provenance et retour Veille repris', () => {
    const rv = contexteVeille({ q: 'serum', p: 'meta' }, 'ad-meta-123');
    const d = lire(destinationAncienneAdresse('/studio/ads', { mode: 'clone', ref: REF, angle: 'Avant/après en 3 s', src: 'meta:123', srcnom: 'Glow', depuis: 'veille', rv }));
    expect(d.chemin).toBe(CHEMIN_NOUVEAU_PROJET);
    expect(d.p).toEqual({ type: 'ads', ref: REF, angle: 'Avant/après en 3 s', src: 'meta:123', srcnom: 'Glow', depuis: 'veille', rv });
  });

  it('itération Adsmap, prompt vidéo, produit et inspiration des textes ⇒ repris', () => {
    expect(lire(destinationAncienneAdresse('/studio/ads', { iter: ITER })).p).toEqual({ type: 'ads', iter: ITER });
    expect(lire(destinationAncienneAdresse('/studio/video', { prompt: 'Plan serré sur le flacon' })).p).toEqual({ type: 'video', angle: 'Plan serré sur le flacon' });
    expect(lire(destinationAncienneAdresse('/studio/textes', { brand: 'Sérum', inspo: 'Avant/après' })).p).toEqual({ type: 'text', angle: 'Avant/après', produit: 'Sérum' });
  });

  it('valeurs forgées ignorées · ref et iter non UUID, rv qui n’est pas un contexte de Veille, src sans clé', () => {
    expect(destinationAncienneAdresse('/studio/ads', { ref: '../../x', iter: 'javascript:alert(1)', src: 'pas-de-cle', depuis: 'veille', rv: 'https://evil.test' })).toBe(CHEMIN_PROJETS);
    expect(lienNouveauProjet({ type: 'campagne' as never, angle: '   ' })).toBe(CHEMIN_NOUVEAU_PROJET);
  });

  it('bornes · angle 300, produit 120, caractères de contrôle retirés', () => {
    const p = lire(lienNouveauProjet({ angle: 'a'.repeat(400) + '\u0000', produit: 'p'.repeat(200) })).p;
    expect(p.angle).toHaveLength(300);
    expect(p.produit).toHaveLength(120);
  });

  it('lienIterationStudio ⇒ la préparation d’un projet pub, test repris', () => {
    expect(lienIterationStudio(ITER)).toBe(`${CHEMIN_NOUVEAU_PROJET}?type=ads&iter=${ITER}`);
  });
});

describe('préparation · ce qu’elle relit de son adresse', () => {
  it('chaque paramètre produit est relu (aller-retour)', () => {
    const rv = contexteVeille({ q: 'serum' });
    const href = lienNouveauProjet({ type: 'video', angle: 'Hook', produit: 'Sérum', ref: REF, iter: ITER, src: 'tiktok:9', srcnom: 'Glow', retourVeille: rv });
    const p = lire(href).p;
    expect(Object.keys(p).sort()).toEqual([...PARAMS_NOUVEAU_PROJET].sort());
    expect(lireContexteNouveauProjet(p)).toEqual({
      type: 'video', typeDonne: true, objectif: 'Hook\nProduit : Sérum', ref: REF, iter: ITER,
      sourceVeille: { cle: 'tiktok:9', nom: 'Glow' }, retourVeille: rv, aContexte: true,
    });
  });

  it('sans rien · type pub par défaut, aucun contexte', () => {
    expect(lireContexteNouveauProjet({})).toEqual({ type: 'ads', typeDonne: false, objectif: '', ref: null, iter: null, sourceVeille: null, retourVeille: null, aContexte: false });
  });

  it('ce qui n’est pas repris est DIT · annonce Veille non jointe, sauvegarde inaccessible, test non éligible ou illisible', () => {
    const veille = lireContexteNouveauProjet({ src: 'meta:1', srcnom: 'Glow' });
    expect(notesContexte(veille, { refJointe: false, iteration: null })).toEqual([expect.stringContaining('L’annonce de Glow vue dans la Veille n’est pas jointe')]);
    const sauvegarde = lireContexteNouveauProjet({ ref: REF, src: 'meta:1' });
    expect(notesContexte(sauvegarde, { refJointe: true, iteration: null })).toEqual([]);
    expect(notesContexte(sauvegarde, { refJointe: false, iteration: null })).toEqual([expect.stringContaining('L’annonce sauvegardée de ce lien n’est plus accessible')]);
    const iter = lireContexteNouveauProjet({ iter: ITER });
    expect(notesContexte(iter, { refJointe: false, iteration: { etat: 'non_eligible', motif: 'Ce test n’a pas de verdict arbitré.' } })).toEqual(['Le test Adsmap n’a pas été repris · Ce test n’a pas de verdict arbitré.']);
    expect(notesContexte(iter, { refJointe: false, iteration: { etat: 'refuse' } })[0]).toMatch(/n’est pas lisible ici/);
    expect(notesContexte(iter, { refJointe: false, iteration: { etat: 'reprise' } })).toEqual([]);
  });

  it('objectif d’une itération · angle, audience, hypothèse, apprentissages et chiffres', () => {
    const b = briefDepuisTest({
      adId: ITER, variantCode: 'v2', concept: 'Concept 2', angle: 'Avant/après', persona: 'Mamans actives', personaId: null,
      verdictStatus: 'validated', validated: 'winner', comparable: true, testedVariable: 'hook', variableValue: 'Question',
      metrics: { cpa: 12, hookRate: 0.31, ctr: 0.021 }, learnings: [{ statement: 'La question en ouverture accroche', confidence: 0.8, scope: 'marque' }],
    });
    if (!b.eligible) throw new Error(b.motif);
    const o = objectifDepuisIteration(b);
    expect(o.titre).toBe('Itération de v2 · Concept 2');
    expect(o.objectif.split('\n')).toEqual([
      'Angle : Avant/après', 'Audience : Mamans actives', expect.stringMatching(/^Hypothèse suggérée : Garder ce qui a gagné/),
      'Appris : La question en ouverture accroche', expect.stringMatching(/^Mesuré : CPA 12 €/),
    ]);
  });
});
