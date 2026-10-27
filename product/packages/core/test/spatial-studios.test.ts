import { describe, expect, it } from 'vitest';
import {
  autresIterationsSpatial, choixInitialIteration, choixIterationSpatial, depuisSpatial, ecranSpatial, etapesNouveauSpatial, filtresProjetsSpatial,
  infoEtapeNouveau, lienIterationStudio, pastilleIterationSpatiale, refusStudiosSpatial, repriseCarteSpatiale, segmentsEtapeSpatiale, videIterationSpatial,
  CLASSE_ETAPE_SPATIALE, DEPARTS_SPATIAL, ECRANS_SPATIAUX, JARVIS_NOUVEAU, LIVRABLES_SPATIAL, MAX_CHOIX_ITERATION, NOTE_ITERATION_SPATIALE,
  RAISON_NON_GAGNANTE, RAISON_ROLE_ITERATION, TYPES_NOUVEAU_PROJET, VIDE_PROMPTS_SPATIAL, ETAPES_ITERATION_SPATIALE,
  type LignePlanSpatial,
} from '../src';

const MAINTENANT = new Date('2026-10-27T12:00:00Z');
const il = (ms: number) => new Date(MAINTENANT.getTime() - ms).toISOString();

describe('Spatial · Studios · liste des projets', () => {
  it('la barre d’étapes suit l’étape RÉELLE · faites, en cours, à venir', () => {
    expect(segmentsEtapeSpatiale('brief_a_completer')).toEqual(['cur', '', '']);
    expect(segmentsEtapeSpatiale('brief_pret')).toEqual(['on', 'cur', '']);
    expect(segmentsEtapeSpatiale('production')).toEqual(['on', 'on', 'cur']);
    expect(CLASSE_ETAPE_SPATIALE).toEqual({ brief_a_completer: '', brief_pret: 'w', production: 'c' });
  });

  it('la fraîcheur se dit comme la maquette, et retombe sur la date au-delà de cinq semaines', () => {
    expect(depuisSpatial(il(20_000), MAINTENANT)).toBe('à l’instant');
    expect(depuisSpatial(il(12 * 60_000), MAINTENANT)).toBe('il y a 12 min');
    expect(depuisSpatial(il(5 * 3_600_000), MAINTENANT)).toBe('il y a 5 h');
    expect(depuisSpatial(il(2 * 86_400_000), MAINTENANT)).toBe('il y a 2 j');
    expect(depuisSpatial(il(8 * 86_400_000), MAINTENANT)).toBe('il y a 1 sem.');
    expect(depuisSpatial('2026-08-01T00:00:00Z', MAINTENANT)).toBe('le 01/08/2026');
    expect(depuisSpatial(null, MAINTENANT)).toBe('');
    expect(depuisSpatial('pas une date', MAINTENANT)).toBe('');
  });

  it('la phrase de reprise dit d’abord ce qui BLOQUE, sinon les sources', () => {
    const quand = il(2 * 86_400_000);
    expect(repriseCarteSpatiale({ manques: [{ cle: 'sources', libelle: 'Aucune source liée', bloquant: false }, { cle: 'produit', libelle: 'Produit de la marque à choisir', bloquant: true }], sources: 0, updatedAt: quand }, MAINTENANT))
      .toBe('Produit de la marque à choisir · il y a 2 j');
    expect(repriseCarteSpatiale({ manques: [], sources: 1, updatedAt: quand }, MAINTENANT)).toBe('1 source · il y a 2 j');
    expect(repriseCarteSpatiale({ manques: [], sources: 3, updatedAt: quand }, MAINTENANT)).toBe('3 sources · il y a 2 j');
  });

  it('les filtres sont « Tous » puis les étapes réelles, chacun avec son compteur réel (zéro compris)', () => {
    const c = (etape: 'brief_a_completer' | 'brief_pret' | 'production') => ({ etape, title: 't', marque: 'm', libelleType: 'x' });
    expect(filtresProjetsSpatial([c('production'), c('production'), c('brief_a_completer')])).toEqual([
      { cle: 'tous', libelle: 'Tous · 3' }, { cle: 'brief_a_completer', libelle: 'Brief à compléter · 1' },
      { cle: 'brief_pret', libelle: 'Brief prêt · 0' }, { cle: 'production', libelle: 'En production · 2' },
    ]);
  });

  it('la pastille d’une itération porte le verdict ARBITRÉ et le lot · conclu = vert', () => {
    expect(pastilleIterationSpatiale({ verdict: 'Gagnante', lot: 'Lot #3 conclu' })).toEqual({ libelle: 'Gagnante · Lot #3 conclu', classe: 'g', icone: 'check' });
    expect(pastilleIterationSpatiale({ verdict: 'Gagnante', lot: 'Hors lot' })).toEqual({ libelle: 'Gagnante · Hors lot', classe: 'w', icone: 'flask' });
    expect(autresIterationsSpatial(5, 2)).toBe('3 autres gagnantes prouvées à reprendre');
    expect(autresIterationsSpatial(3, 2)).toBe('1 autre gagnante prouvée à reprendre');
    expect(autresIterationsSpatial(2, 2)).toBe('Choisir une autre pub mesurée par tes tests');
    // Aucun devis n'existe avant la génération · la note ne promet aucun prix.
    expect(NOTE_ITERATION_SPATIALE.iterer).not.toMatch(/\d+\s*crédit/);
  });

  it('un refus dit pourquoi · capacité coupée, offre, rôle, panne avec identifiant', () => {
    expect(refusStudiosSpatial({ capacites: ['projets'], code: 'UNSUPPORTED_CAPABILITY', plan: false }).titre).toBe('Non activé pour cet espace');
    expect(refusStudiosSpatial({ capacites: [], code: 'FORBIDDEN', plan: true }).lien).toEqual({ href: '/billing', libelle: 'Voir les forfaits' });
    expect(refusStudiosSpatial({ capacites: [], code: 'FORBIDDEN', plan: false }).titre).toBe('Accès réservé');
    expect(refusStudiosSpatial({ capacites: [], code: 'PERSISTENCE_FAILED', plan: false, message: 'Panne.', traceId: 'tr-1' }).texte).toBe('Panne. · identifiant support : tr-1');
  });
});

const ligne = (o: Partial<LignePlanSpatial> & { adId: string }): LignePlanSpatial => ({
  label: `Concept · ${o.adId}`, mode: 'more', modeLabel: 'Décliner', rationale: 'Raison.', variableLabel: 'Accroche', freezeLabels: ['Visuel', 'Offre'],
  parentVerdict: 'winner', parentComparable: true, edgeLegal: true, spend: 3120, ...o,
});

describe('Spatial · Studios · nouvelle itération', () => {
  const rows = [
    ligne({ adId: 'a', mode: 'better', modeLabel: 'Corriger', parentVerdict: 'loser', edgeLegal: false }),
    ligne({ adId: 'b' }),
    ligne({ adId: 'b', variableLabel: 'Visuel' }),
    ligne({ adId: 'c', parentComparable: false }),
    ligne({ adId: 'd', spend: null }),
  ];
  const ctx = (id: string) => (id === 'b' ? { roas: 2.1, vignette: 'https://cdn.x/b.jpg' } : id === 'd' ? { roas: null, vignette: 'page-de-partage' } : undefined);

  it('une pub par ligne (la première proposition fait foi) · seule une gagnante PROUVÉE est sélectionnable', () => {
    const c = choixIterationSpatial(rows, ctx, { peutIterer: true });
    expect(c.map((x) => [x.adId, x.selectionnable])).toEqual([['a', false], ['b', true], ['c', false], ['d', true]]);
    expect(c[1]!.change).toEqual({ variable: 'Accroche', garde: 'Visuel et Offre' });
    expect(c[0]!.raison).toBe(RAISON_NON_GAGNANTE);
    expect(c[2]!.raison).toBe(RAISON_NON_GAGNANTE);
    expect(c[0]!.lien).toBeNull();
    expect(c[1]!.lien).toBe(lienIterationStudio('b'));
  });

  it('« Conseillé » marque la PREMIÈRE pub sélectionnable seulement · le mode a sa couleur', () => {
    const c = choixIterationSpatial(rows, ctx, { peutIterer: true });
    expect(c[0]!.pastilles).toEqual([{ libelle: 'Corriger', classe: 'w' }]);
    expect(c[1]!.pastilles).toEqual([{ libelle: 'Conseillé', classe: 'g' }, { libelle: 'Décliner', classe: 'g' }]);
    expect(c[3]!.pastilles).toEqual([{ libelle: 'Décliner', classe: 'g' }]);
  });

  it('les chiffres sont ceux MESURÉS · rien quand la mesure manque, jamais un zéro inventé ; une vignette non affichable tombe', () => {
    const c = choixIterationSpatial(rows, ctx, { peutIterer: true });
    expect(c[1]!.chiffres).toEqual([{ libelle: 'ROAS', valeur: '2,10' }, { libelle: 'Dépense', valeur: '3\u202f120 €' }]);
    expect(c[3]!.chiffres).toEqual([]);
    expect(c[1]!.vignette).toBe('https://cdn.x/b.jpg');
    expect(c[3]!.vignette).toBeNull();
  });

  it('sans le droit de créer le projet, rien n’est sélectionnable et la raison le dit', () => {
    const c = choixIterationSpatial(rows, ctx, { peutIterer: false });
    expect(c.every((x) => !x.selectionnable && x.lien === null)).toBe(true);
    expect(c[1]!.raison).toBe(RAISON_ROLE_ITERATION);
    expect(c.flatMap((x) => x.pastilles.map((p) => p.libelle))).not.toContain('Conseillé');
  });

  it('la liste est bornée · et la présélection suit l’adresse si la pub est sélectionnable', () => {
    const beaucoup = Array.from({ length: 30 }, (_, i) => ligne({ adId: `x${i}` }));
    expect(choixIterationSpatial(beaucoup, () => undefined, { peutIterer: true })).toHaveLength(MAX_CHOIX_ITERATION);
    const c = choixIterationSpatial(rows, ctx, { peutIterer: true });
    expect(choixInitialIteration(c, 'D')).toBe('d');
    expect(choixInitialIteration(c, 'a')).toBe('b');
    expect(choixInitialIteration(c, null)).toBe('b');
    expect(choixInitialIteration([], 'b')).toBeNull();
  });

  it('l’état vide dit pourquoi, dans l’ordre des gardes · et se tait quand il y a des pubs', () => {
    const base = { refus: null, marque: true, erreur: null, lignes: 3, resume: 'r' } as const;
    expect(videIterationSpatial({ ...base, refus: 'plan' })!.lien!.href).toBe('/billing');
    expect(videIterationSpatial({ ...base, refus: 'role' })!.titre).toBe('Accès réservé');
    expect(videIterationSpatial({ ...base, marque: false })!.lien!.href).toBe('/brands');
    expect(videIterationSpatial({ ...base, erreur: 'Panne' })!.texte).toBe('Panne');
    expect(videIterationSpatial({ ...base, lignes: 0, resume: 'Aucun test arbitré.' })).toEqual({ titre: 'Rien à itérer pour l’instant', texte: 'Aucun test arbitré.', lien: { href: '/adsmap', libelle: 'Voir les Résultats' } });
    expect(videIterationSpatial(base)).toBeNull();
    expect(ETAPES_ITERATION_SPATIALE).toHaveLength(4);
  });
});

describe('Spatial · Studios · nouveau projet', () => {
  it('les quatre livrables sont les quatre types RÉELS d’un projet', () => {
    expect(LIVRABLES_SPATIAL.map((l) => l.type).sort()).toEqual([...TYPES_NOUVEAU_PROJET].sort());
  });

  it('les départs mènent aux vrais écrans · « zéro » reste ici', () => {
    expect(DEPARTS_SPATIAL.map((d) => [d.cle, d.href])).toEqual([['zero', null], ['veille', '/veille'], ['test', '/studio/iterer']]);
  });

  it('les étapes suivent l’ordre réel · la courante « on », la précédente « done »', () => {
    expect(etapesNouveauSpatial(1).map((e) => e.classe)).toEqual(['on', '', '', '']);
    expect(etapesNouveauSpatial(2).map((e) => e.classe)).toEqual(['done', 'on', '', '']);
    expect(infoEtapeNouveau(2)).toMatch(/gratuit/);
  });

  it('aucun prix n’est promis sur cet écran · Jarvis annonce le sien dans le projet', () => {
    expect(`${JARVIS_NOUVEAU.titre} ${JARVIS_NOUVEAU.sous}`).not.toMatch(/\d+\s*crédit/);
    expect(JARVIS_NOUVEAU.sous).toMatch(/prix avant le clic/);
  });
});

describe('Spatial · Studios · écrans déclarés et textes', () => {
  it('les quatre adresses D1 sont portées, section studios · l’éditeur d’un projet n’est pas réécrit par erreur', () => {
    for (const c of ['/studio/projets', '/studio/prompts', '/studio/projets/nouveau', '/studio/iterer']) {
      expect(ECRANS_SPATIAUX.filter((e) => e.section === 'studios').map((e) => e.chemin)).toContain(c);
      expect(ecranSpatial(c)).toMatchObject({ interne: `/sp${c}`, section: 'studios' });
    }
    // Vague 2 · le nouveau concept créatif est porté à son tour (il n'est jamais pris pour un projet).
    expect(ecranSpatial('/studio/projets/nouveau/concept')).toMatchObject({ interne: '/sp/studio/projets/nouveau/concept', section: 'studios' });
  });

  it('aucun tiret cadratin ni nom de fournisseur dans les textes décidés ici', () => {
    const textes = [
      ...LIVRABLES_SPATIAL.flatMap((l) => [l.titre, l.sous]), ...DEPARTS_SPATIAL.flatMap((d) => [d.titre, d.sous]),
      JARVIS_NOUVEAU.titre, JARVIS_NOUVEAU.sous, VIDE_PROMPTS_SPATIAL.titre, VIDE_PROMPTS_SPATIAL.texte, RAISON_NON_GAGNANTE, RAISON_ROLE_ITERATION,
      NOTE_ITERATION_SPATIALE.iterer, NOTE_ITERATION_SPATIALE.role, ...ETAPES_ITERATION_SPATIALE,
    ];
    for (const t of textes) {
      expect(t, t).not.toMatch(/—/);
      expect(t, t).not.toMatch(/trendtrack/i);
    }
  });
});
