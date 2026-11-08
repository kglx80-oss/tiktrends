import { describe, expect, it } from 'vitest';
import {
  accesHypothese, cartesHypotheses, completudeHypothese, composerHypothese, departDepuisAccroche, departDepuisApprentissage,
  departDepuisVeille, libelleOrigine, ligneHypotheseLibre, lireHypothese, lireOrigineHypothese, prioriteEstimee,
  refOrigineHypothese, validerSaisieHypothese, LONGUEUR_PARTIE_MAX, REFUS_HYPOTHESE_VIDE, VARIABLES_HYPOTHESE,
  type FaitsAdSpatial, type FaitsHypotheseAd, type OrigineHypotheseLibre,
} from '../src';

/**
 * Lot 1 V5 · hypothèses LIBRES · la phrase « Si…, alors…, parce que… », sa
 * complétude en mots, la validation de la saisie, la priorité estimée, la
 * provenance, et le RANGEMENT dans le tableau (« À formuler »).
 */

describe('la phrase · composée et relue', () => {
  it('complète · « Si X, alors Y, parce que Z. »', () => {
    expect(composerHypothese({ si: 'on montre le prix barré', alors: 'le taux de clic monte', parceQue: 'les avis parlent du prix' }))
      .toBe('Si on montre le prix barré, alors le taux de clic monte, parce que les avis parlent du prix.');
  });
  it('une partie absente se lit « … », comme la maquette', () => {
    expect(composerHypothese({ si: 'le prix barré apparaît dans l’image' })).toBe('Si le prix barré apparaît dans l’image, alors… ?');
    expect(composerHypothese({ alors: 'le coût baisse' })).toBe('Si…, alors le coût baisse.');
    expect(composerHypothese({ parceQue: 'le test 4 l’a montré' })).toBe('Si…, alors…, parce que le test 4 l’a montré.');
    expect(composerHypothese({})).toBe('');
  });
  it('les mots-clés tapés en double et la ponctuation de fin sont retirés', () => {
    expect(composerHypothese({ si: 'Si on tutoie.', alors: 'alors le clic tient', parceQue: 'parce que les concurrents tutoient…' }))
      .toBe('Si on tutoie, alors le clic tient, parce que les concurrents tutoient.');
  });
  it('l’élision du français · « S’il », « parce qu’on », et la relecture les rend', () => {
    const p = { si: 'il voit le produit dès la 1re seconde', alors: 'il reste', parceQue: 'on lève le doute tout de suite' };
    const t = composerHypothese(p);
    expect(t).toBe('S’il voit le produit dès la 1re seconde, alors il reste, parce qu’on lève le doute tout de suite.');
    expect(lireHypothese(t)).toEqual(p);
    expect(composerHypothese({ si: 'Si', alors: 'x', parceQue: 'parce qu’ils tutoient' })).toBe('Si…, alors x, parce qu’ils tutoient.');
  });
  it('relue · l’aller-retour rend les mêmes parties, virgules internes comprises', () => {
    const p = { si: 'on montre, en gros plan, le produit', alors: 'plus de gens regardent au-delà de 3 s', parceQue: 'trois concurrents le font' };
    expect(lireHypothese(composerHypothese(p))).toEqual(p);
    expect(lireHypothese(composerHypothese({ si: 'x' }))).toEqual({ si: 'x', alors: '', parceQue: '' });
    expect(lireHypothese(composerHypothese({ alors: 'y' }))).toEqual({ si: '', alors: 'y', parceQue: '' });
  });
  it('un texte libre (suite, import) n’est pas forcé dans des cases', () => {
    expect(lireHypothese('Changer l’accroche devrait améliorer la rétention')).toBeNull();
    expect(lireHypothese(null)).toBeNull();
  });
});

describe('complétude · ce qui manque, en mots', () => {
  it('rien ne manque · « Phrase complète »', () => {
    const c = completudeHypothese({ si: 'a', alors: 'b', parceQue: 'c' }, 'hook');
    expect(c).toEqual({ complete: true, manques: [], resume: 'Phrase complète' });
  });
  it('dit chaque manque, dans l’ordre de la phrase', () => {
    const c = completudeHypothese({ si: 'a' }, null);
    expect(c.complete).toBe(false);
    expect(c.resume).toBe('Il manque le résultat attendu (alors…), la raison (parce que…) et la variable testée');
  });
  it('le témoin n’est pas une variable d’hypothèse', () => {
    expect(completudeHypothese({ si: 'a', alors: 'b', parceQue: 'c' }, 'none_control').manques).toEqual(['la variable testée']);
    expect(VARIABLES_HYPOTHESE.map((v) => v.cle)).not.toContain('none_control');
    expect(VARIABLES_HYPOTHESE.find((v) => v.cle === 'hook')?.libelle).toBe('Accroche');
  });
});

describe('validation de la saisie (écran et serveur)', () => {
  it('une phrase incomplète est acceptée · une vide est refusée', () => {
    const v = validerSaisieHypothese({ si: 'on montre le prix' });
    expect(v.ok && v.texte).toBe('Si on montre le prix, alors… ?');
    expect(v.ok && v.completude.complete).toBe(false);
    expect(validerSaisieHypothese({ si: '   ', alors: '.' })).toEqual({ ok: false, erreur: REFUS_HYPOTHESE_VIDE });
  });
  it('une partie trop longue est refusée en le disant', () => {
    const v = validerSaisieHypothese({ si: 'x'.repeat(LONGUEUR_PARTIE_MAX + 1) });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.erreur).toMatch(/^Ce qu’on change \(Si…\) dépasse 280 caractères/);
  });
  it('variable ou note hors liste · refus, jamais remplacée en silence', () => {
    expect(validerSaisieHypothese({ si: 'a', variable: 'prix' })).toEqual({ ok: false, erreur: 'Variable inconnue · choisis-la dans la liste.' });
    expect(validerSaisieHypothese({ si: 'a', impact: '5' })).toEqual({ ok: false, erreur: 'Note « impact » hors échelle · de 1 à 3.' });
    const v = validerSaisieHypothese({ si: 'a', variable: 'offer', impact: '3', confiance: 2, effort: '' });
    expect(v.ok && v.variable).toBe('offer');
    expect(v.ok && v.estimation).toEqual({ impact: 3, confiance: 2, effort: null });
  });
  it('un champ non texte (requête forgée) se lit comme vide', () => {
    expect(validerSaisieHypothese({ si: { $ne: 1 } as unknown as string, alors: 'b' })).toMatchObject({ ok: true, texte: 'Si…, alors b.' });
  });
});

describe('priorité estimée · moyenne, effort inversé', () => {
  it('trois notes · 1 à 3 barres', () => {
    expect(prioriteEstimee({ impact: 3, confiance: 3, effort: 1 })).toBe(3);
    expect(prioriteEstimee({ impact: 1, confiance: 1, effort: 3 })).toBe(1);
    expect(prioriteEstimee({ impact: 2, confiance: 2, effort: 2 })).toBe(2);
    expect(prioriteEstimee({ impact: 3, confiance: 2, effort: 3 })).toBe(2);
  });
  it('une note manque · pas de priorité devinée', () => {
    expect(prioriteEstimee({ impact: 3, confiance: null, effort: 1 })).toBeNull();
    expect(prioriteEstimee(null)).toBeNull();
  });
});

describe('provenance', () => {
  it('aller-retour par `source_ref_json` · le JSON abîmé n’est pas une hypothèse libre', () => {
    const o: OrigineHypotheseLibre = { type: 'persona', persona: 'Léa, 34 ans', personaId: '0b6b5a2e-1c1e-4e8a-9a51-1f9c1d0d9a01', accroche: 'enfin une crème qui ne colle pas' };
    expect(lireOrigineHypothese(refOrigineHypothese(o))).toEqual(o);
    expect(lireOrigineHypothese({ generationId: 'x' })).toBeNull();
    expect(lireOrigineHypothese({ hypotheseLibre: { type: 'pirate' } })).toBeNull();
    expect(lireOrigineHypothese(null)).toBeNull();
  });
  it('ce que la carte dit · « Idée d’équipe » comme la maquette', () => {
    expect(libelleOrigine({ type: 'libre' })).toBe('Idée d’équipe');
    expect(libelleOrigine({ type: 'veille', annonceur: 'Ploufy', savedAdId: null })).toBe('Veille · Ploufy');
    expect(libelleOrigine({ type: 'persona', persona: 'Léa, 34 ans', personaId: null, accroche: null })).toBe('Persona · Léa');
    expect(libelleOrigine({ type: 'apprentissage', enonce: 'Les questions accrochent mieux', learningId: null })).toBe('Apprentissage · Les questions accrochent mieux');
  });
  it('points de départ · seulement ce que le geste dit, ni résultat ni raison inventés', () => {
    expect(departDepuisVeille({ annonceur: 'Ploufy' })).toEqual({ parties: { si: 'on reprend la structure de la pub de Ploufy', alors: '', parceQue: '' }, variable: null });
    expect(departDepuisAccroche('ça ne colle pas')).toEqual({ parties: { si: 'l’accroche reprend ses mots « ça ne colle pas »', alors: '', parceQue: '' }, variable: 'hook' });
    expect(departDepuisApprentissage('Les questions accrochent mieux')).toEqual({ parties: { si: '', alors: '', parceQue: 'Les questions accrochent mieux' }, variable: null });
  });
  it('accès hors de Résultats · formule, rôle, puis marque active', () => {
    expect(accesHypothese({ adsmap: 'ok', marqueActive: true })).toEqual({ ouvert: true, raison: null });
    expect(accesHypothese({ adsmap: 'plan', marqueActive: true }).raison).toMatch(/offre Plus/);
    expect(accesHypothese({ adsmap: 'role', marqueActive: true }).raison).toMatch(/Ton rôle/);
    expect(accesHypothese({ adsmap: 'ok', marqueActive: false }).raison).toMatch(/marque active/);
  });
});

describe('rangement dans le tableau', () => {
  const MANQUES_LIBRE = ['l’offre', 'la page de destination'];
  const ad = (o: Partial<FaitsAdSpatial> = {}): FaitsAdSpatial => ({
    id: 'h1', variante: 'v1', statut: 'draft', hypothese: 'Si on montre le prix barré, alors… ?', variable: null, plateforme: 'meta',
    texte: null, image: null, manques: ['la variable testée', ...MANQUES_LIBRE], verdict: null, ...o,
  });
  const libre = (o: Partial<FaitsHypotheseAd> = {}, a: Partial<FaitsAdSpatial> = {}): FaitsHypotheseAd => ({
    ad: ad(a), concept: 'Hypothèse · …', lot: null, bande: null, origine: { type: 'libre' }, estimation: null, ...o,
  });

  it('une hypothèse libre incomplète · « À formuler », ce qui manque et sa source, bouton « Compléter la phrase »', () => {
    const [c] = cartesHypotheses([libre()], []);
    expect(c!.colonne).toBe('formuler');
    expect(c!.meta).toBe('Il manque le résultat attendu (alors…), la raison (parce que…) et la variable testée · Idée d’équipe');
    expect(c!.edition).toMatchObject({ adId: 'h1', libelle: 'Compléter la phrase', parties: { si: 'on montre le prix barré', alors: '', parceQue: '' } });
    expect(c!.action).toBeNull();
    expect(c!.priorite).toBe(0);
  });
  it('phrase complète · reste « À formuler » tant que l’offre et la page manquent, et le dit', () => {
    const [c] = cartesHypotheses([libre({ origine: { type: 'veille', annonceur: 'Ploufy', savedAdId: null } }, {
      hypothese: 'Si on reprend la structure, alors le clic monte, parce que Ploufy scale.', variable: 'hook', manques: MANQUES_LIBRE,
    })], []);
    expect(c!.colonne).toBe('formuler');
    expect(c!.meta).toBe('Phrase complète · avant le test : l’offre et la page de destination · Veille · Ploufy');
    expect(c!.edition?.libelle).toBe('Modifier');
  });
  it('l’estimation complète prime sur le pré-score · incomplète, le pré-score reste', () => {
    expect(cartesHypotheses([libre({ bande: 'low', estimation: { impact: 3, confiance: 3, effort: 1 } })], [])[0]!.priorite).toBe(3);
    expect(cartesHypotheses([libre({ bande: 'low', estimation: { impact: 3, confiance: null, effort: 1 } })], [])[0]!.priorite).toBe(1);
  });
  it('hors brouillon · plus de bouton (la phrase d’une ad prête ne se réécrit pas)', () => {
    expect(cartesHypotheses([libre({}, { statut: 'proposed' })], [])[0]!.edition).toBeNull();
  });
  it('une ad ordinaire ne change pas · ni bouton, ni provenance', () => {
    const [c] = cartesHypotheses([{ ad: ad({ hypothese: null }), concept: 'Concept', lot: null, bande: null }], []);
    expect(c!.meta).toBe('Il manque la variable testée, l’offre et la page de destination');
    expect(c!.edition).toBeUndefined();
  });
  it('la ligne d’une hypothèse dont la phrase a été abîmée hors de l’outil · « Phrase à reprendre »', () => {
    expect(ligneHypotheseLibre({ texte: 'texte libre', variable: 'hook', manques: [], origine: { type: 'libre' } })).toEqual({ meta: 'Phrase à reprendre · Idée d’équipe', complete: false });
  });
});
