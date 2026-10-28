import { describe, expect, it } from 'vitest';
import {
  RAISON_LECTEUR_PROPOSITIONS, bandeauTachesInterrompues, detailTache, differencesConflit, lectureImpact, noteEtatProposition, phraseSourcesIllisibles, provenanceSource,
} from '../src';

/**
 * Spatial · fiche projet · les phrases PORTÉES de la fiche V5 (retirée) ·
 * carte de proposition (état daté, plan d'impact, conflit) et provenance des
 * références. Pur.
 */

const base = { etat: 'proposed', perimee: false, baseVersion: { n: 1 }, expireLe: null, decideLe: null, versionAppliquee: null };

describe('proposition · note d’état', () => {
  it('base périmée annoncée AVANT le clic · seulement pour une proposition ouverte', () => {
    expect(noteEtatProposition({ ...base, perimee: true }, 3)).toEqual({ ton: 'warn', texte: 'Base périmée · cette proposition vise la version 1, le projet est en version 3. L’appliquer renverra un conflit · recharge puis redemande.' });
    expect(noteEtatProposition({ ...base, etat: 'rejected', perimee: true }, 3)!.texte).toBe('Rejetée · rien n’a été modifié.');
    expect(noteEtatProposition(base, 1)).toBeNull();
  });
  it('expirée, appliquée, rejetée · datées à l’heure de Paris', () => {
    expect(noteEtatProposition({ ...base, etat: 'expired', expireLe: '2026-10-14T10:00:00.000Z' }, 1)!.texte).toBe('Expirée le 14/10 12:00 · elle ne peut plus être appliquée. Demande une nouvelle proposition sur la version courante.');
    expect(noteEtatProposition({ ...base, etat: 'approved', versionAppliquee: { n: 2 }, decideLe: '2026-01-14T10:00:00.000Z' }, 2)).toEqual({ ton: 'ok', texte: 'Appliquée · version 2 créée le 14/01 11:00. Rien n’a été généré ni débité.' });
  });
});

describe('proposition · plan d’impact', () => {
  const n = (libelle: string, nature = 'generation') => ({ libelle, nature });
  it('indisponible · null ; sans média · une phrase ; coût indicatif non débité, accordé', () => {
    expect(lectureImpact(null)).toBeNull();
    const vide = lectureImpact({ touchees: [], aRefaire: [], reutilisees: [], obsoletes: [], creditsIndicatifs: 0, nonTarifees: [] })!;
    expect(vide.groupes).toHaveLength(1);
    expect(vide.sansMedia).toMatch(/^Aucun média n’a encore été produit/);
    expect(vide.cout).toBe('Aucune génération touchée · seule la composition ou le montage serait recalculé.');
    expect(vide.mention).toMatch(/Rien n’est généré et rien n’est débité/);
    // Tout est « à refaire » quand rien n'a encore été produit · c'est l'absence de média qui parle, pas une liste du graphe entier.
    expect(lectureImpact({ touchees: [n('A')], aRefaire: [n('A')], reutilisees: [], obsoletes: [], creditsIndicatifs: 1, nonTarifees: [] })!.sansMedia).not.toBeNull();
    const plein = lectureImpact({ touchees: [n('A'), n('B'), n('Montage', 'calcul')], aRefaire: [n('A')], reutilisees: [n('C')], obsoletes: [n('A')], creditsIndicatifs: 1, nonTarifees: ['voix'] })!;
    expect(plein.sansMedia).toBeNull();
    expect(plein.groupes.map((g) => g.titre)).toEqual(['Touché par ce changement · 3', 'À refaire · 1', 'Réutilisé · 1', 'Obsolète · 1']);
    expect(plein.groupes[0]!.elements).toEqual(['A · génération', 'B · génération', 'Montage']);
    expect(plein.cout).toBe('Coût indicatif si tu génères ensuite · 1 crédit pour 2 générations, non débité · un devis sera demandé. Sans tarif dans l’offre · voix (le devis les refusera).');
  });
  it('plus de douze éléments · le reste est compté, jamais tu', () => {
    const l = lectureImpact({ touchees: Array.from({ length: 14 }, (_, i) => n(`P${i}`, 'calcul')), aRefaire: [], reutilisees: [], obsoletes: [], creditsIndicatifs: 0, nonTarifees: [] })!;
    expect(l.groupes[0]!.elements.at(-1)).toBe('… et 2 autre(s)');
  });
});

describe('proposition · conflit et lecteur', () => {
  it('différences base → courante · dix au plus, valeurs lisibles', () => {
    const d = differencesConflit(Array.from({ length: 12 }, (_, i) => ({ chemin: `/c${i}`, base: ['a'], courant: null })));
    expect(d.lignes).toHaveLength(10);
    expect(d.reste).toBe(2);
    expect(differencesConflit(undefined)).toEqual({ lignes: [], reste: 0 });
    expect(RAISON_LECTEUR_PROPOSITIONS).toBe('Ton rôle permet de lire les propositions, pas de les trancher.');
  });
});

describe('référence · provenance', () => {
  const s = { statut: 'active' as const, revoqueeLe: null, droit: 'observation_publique' as const, empreinte: 'abcdef0123456789', modalites: [], absents: [], extraitAutorise: '' };
  it('active · accessible, droit et empreinte courte, ressources', () => {
    expect(provenanceSource(s, true)).toEqual({ statut: 'active', etat: 'Accessible', lignes: ['Droit · observation publique, structure seulement · empreinte abcdef012345', 'Ressources · aucune'] });
  });
  it('retirée · datée, observations conservées, plus aucun lien ; narration absente et extrait dits', () => {
    const p = provenanceSource({ ...s, statut: 'supprimee', revoqueeLe: '2026-10-20T08:00:00.000Z', absents: [{ element: 'narration', raison: 'Aucune transcription' }] as never, extraitAutorise: 'Votre peau' }, false);
    expect(p.etat).toBe('Source retirée · depuis le 20/10/2026 · observations conservées');
    expect(p.lignes).toContain('Narration · absente · Aucune transcription');
    expect(p.lignes).toContain('Extrait autorisé · « Votre peau »');
    expect(p.lignes.at(-1)).toBe('La source n’est plus accessible · aucun lien.');
    // Une source retirée qui garde un lien (archive) ne se dit pas « sans lien ».
    expect(provenanceSource({ ...s, statut: 'revoquee' }, true).lignes.join(' ')).not.toContain('aucun lien');
  });
  it('références illisibles · dites, accordées', () => {
    expect(phraseSourcesIllisibles(0)).toBeNull();
    expect(phraseSourcesIllisibles(1)).toBe('1 référence de source illisible · ignorée.');
    expect(phraseSourcesIllisibles(3)).toBe('3 références de source illisibles · ignorées.');
  });
});

describe('tâches · détail et bandeau', () => {
  it('le pourcentage n’apparaît que mesuré ; la fin est datée', () => {
    expect(detailTache({ libelleOperation: 'Image', creeLe: '2026-10-17T09:00:00.000Z', finiLe: null, progression: null })).toBe('Image · lancée le 17/10 11:00');
    expect(detailTache({ libelleOperation: 'Image', creeLe: '2026-10-17T09:00:00.000Z', finiLe: '2026-10-17T09:05:00.000Z', progression: 39.6 })).toBe('Image · lancée le 17/10 11:00 · terminée le 17/10 11:05 · avancement 40 %');
  });
  it('bandeau · rien sans interruption, accordé, jamais « aucun débit »', () => {
    expect(bandeauTachesInterrompues(0)).toBeNull();
    expect(bandeauTachesInterrompues(2)).toBe('2 tâches sont interrompues · le coût est en cours de rapprochement · la relance reste bloquée jusque-là.');
    expect(bandeauTachesInterrompues(1)!.toLowerCase()).not.toMatch(/aucun débit|gratuit/);
  });
});
