import { describe, expect, it } from 'vitest';
import {
  ANNONCEURS_MIN_TAG_RECURRENT, OBJECTIF_MAX, PREUVES_MAX_HYPOTHESE_TAG, REFUS_TAG_NON_RECURRENT, SELECTION_PROJET_MAX, SELECTION_VIDE, SEUIL_TAG_RECURRENT,
  briefInspirationSauvegardes, composerHypothese, lienNouveauProjet, libelleOrigine, lireContexteNouveauProjet, lireOrigineHypothese, lireRefsNouveauProjet,
  propositionHypotheseTag, refOrigineHypothese, tagRecurrent, titreSelectionProjet, validerSaisieHypothese, variableDepuisTag, verdictSelectionProjet,
} from '../src';

/**
 * Lot 6 bis V5 · des sauvegardes de Veille au projet et à l'hypothèse · règles
 * PURES (`spatial/veille/selection-projet`, `spatial/veille/hypothese-tag`).
 * Chaque garde lit un RÉSULTAT · le lien écrit et relu, la phrase de refus, le
 * texte proposé, la proposition (ou son absence).
 */

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const X = { id: 'b-x', nom: 'Marque X' };

describe('SV01 · sélection → assistant Nouveau projet', () => {
  it('une sélection d’une marque (celle active) ouvre la préparation avec CHAQUE sauvegarde en `ref`, relues dans l’ordre', () => {
    const v = verdictSelectionProjet([{ id: u(1), marqueId: 'b-x' }, { id: u(2), marqueId: 'b-x' }, { id: u(3), marqueId: null }], { marqueActive: X });
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.n).toBe(3);
    const sp = new URLSearchParams(v.lien.split('?')[1]);
    expect(v.lien.startsWith('/studio/projets/nouveau?')).toBe(true);
    expect(sp.getAll('ref')).toEqual([u(1), u(2), u(3)]);
    expect(sp.get('type')).toBe('ads');
    // La préparation relit TOUTES les références, et `ref` (cas d'avant) reste la première.
    const lu = { ref: sp.getAll('ref') };
    expect(lireRefsNouveauProjet(lu)).toEqual([u(1), u(2), u(3)]);
    expect(lireContexteNouveauProjet(lu).ref).toBe(u(1));
    expect(lireContexteNouveauProjet(lu).aContexte).toBe(true);
  });

  it('une sélection de vidéos seules ouvre un projet vidéo', () => {
    const v = verdictSelectionProjet([{ id: u(1), marqueId: 'b-x', video: true }, { id: u(2), marqueId: 'b-x', video: true }], { marqueActive: X });
    expect(v.ok && new URLSearchParams(v.lien.split('?')[1]).get('type')).toBe('video');
  });

  it('plusieurs marques · refus, avec les marques nommées et la raison', () => {
    const v = verdictSelectionProjet([{ id: u(1), marqueId: 'b-x', marqueNom: 'Marque X' }, { id: u(2), marqueId: 'b-y', marqueNom: 'Marque Y' }], { marqueActive: X });
    expect(v).toEqual({ ok: false, raison: 'Ta sélection mêle 2 marques (Marque X, Marque Y) · un projet se fait pour une seule marque · ne garde que les sauvegardes de l’une d’elles.' });
  });

  it('une seule marque qui n’est pas l’active · refus qui dit d’ouvrir cette marque ; sans marque active, idem', () => {
    const sel = [{ id: u(1), marqueId: 'b-y', marqueNom: 'Marque Y' }];
    expect(verdictSelectionProjet(sel, { marqueActive: X })).toEqual({ ok: false, raison: 'Ces sauvegardes sont gardées pour Marque Y · ouvre cette marque pour en faire un projet.' });
    expect(verdictSelectionProjet(sel, { marqueActive: null }).ok).toBe(false);
    // Sauvegardes de l'espace (sans marque) · elles vont avec la marque active.
    expect(verdictSelectionProjet([{ id: u(1), marqueId: null }], { marqueActive: X }).ok).toBe(true);
  });

  it('vide ou au-delà des références d’un projet · refus dits', () => {
    expect(verdictSelectionProjet([], { marqueActive: X })).toEqual({ ok: false, raison: SELECTION_VIDE });
    const trop = Array.from({ length: SELECTION_PROJET_MAX + 2 }, (_, i) => ({ id: u(i + 1), marqueId: 'b-x' }));
    expect(verdictSelectionProjet(trop, { marqueActive: X })).toEqual({ ok: false, raison: `Un projet garde ${SELECTION_PROJET_MAX} références au plus · décoche-en 2.` });
    expect(SELECTION_PROJET_MAX).toBe(10);
  });

  it('l’adresse forgée · doublons, valeurs non valides et excédent ignorés', () => {
    const lien = lienNouveauProjet({ refs: [u(1), u(1), 'pas-un-id', u(2).toUpperCase()] });
    expect(new URLSearchParams(lien.split('?')[1]).getAll('ref')).toEqual([u(1), u(2)]);
    expect(lireRefsNouveauProjet({ ref: [u(3), '../x', u(3), ...Array.from({ length: 15 }, (_, i) => u(10 + i))] })).toHaveLength(10);
    expect(lireRefsNouveauProjet({ ref: 'forgé' })).toEqual([]);
    // Une seule sauvegarde · le lien d'avant, inchangé.
    expect(lienNouveauProjet({ type: 'ads', ref: u(1) })).toBe(`/studio/projets/nouveau?type=ads&ref=${u(1)}`);
  });

  it('le brief d’inspiration · tags communs comptés, annonceurs, notes · rien d’autre, jamais au-delà de l’intention', () => {
    const b = briefInspirationSauvegardes([
      { annonceur: 'Ploufy', tags: [{ cle: 'hook ugc', nom: 'Hook UGC' }, { cle: 'avant apres', nom: 'Avant / Après' }], note: 'Le hook en 2 s' },
      { annonceur: 'Nagette', tags: [{ cle: 'hook ugc', nom: 'Hook UGC' }], note: null },
    ]);
    expect(b).toBe([
      'Inspiration · 2 sauvegardes de la Veille, jointes en références',
      'Tags · Hook UGC (2), Avant / Après',
      '1 · Ploufy · Hook UGC, Avant / Après',
      'Note · Le hook en 2 s',
      '2 · Nagette · Hook UGC',
    ].join('\n'));
    expect(b).not.toContain('—');
    const longues = Array.from({ length: 10 }, (_, i) => ({ annonceur: `Annonceur ${i}`, tags: [{ cle: 't', nom: 'T' }], note: 'n'.repeat(1000) }));
    const court = briefInspirationSauvegardes(longues);
    expect([...court].length).toBeLessThanOrEqual(OBJECTIF_MAX);
    expect(court.split('\n').filter((l) => l.startsWith('Note · ')).every((l) => l.endsWith('…'))).toBe(true);
    expect(court).toContain('10 · Annonceur 9 · T');
    expect(briefInspirationSauvegardes([])).toBe('');
  });

  it('le titre proposé', () => {
    expect(titreSelectionProjet(['Ploufy', 'Ploufy'])).toBe('D’après Ploufy');
    expect(titreSelectionProjet(['Ploufy', 'Nagette', 'Lagonette'])).toBe('D’après 3 sauvegardes de la Veille');
  });
});

describe('hypothèse depuis un tag récurrent · seuil mesuré', () => {
  const tag = { cle: 'hook ugc', nom: 'Hook UGC' };
  const s = (id: number, annonceur: string) => ({ id: u(id), annonceur });

  it('les seuils sont ceux du tableau mesuré · 3 sauvegardes, 2 annonceurs', () => {
    expect(SEUIL_TAG_RECURRENT).toBe(3);
    expect(ANNONCEURS_MIN_TAG_RECURRENT).toBe(2);
  });

  it('sous le seuil · aucune proposition (2 sauvegardes, ou 3 d’un seul annonceur, ou des doublons)', () => {
    expect(propositionHypotheseTag(tag, [s(1, 'Ploufy'), s(2, 'Nagette')])).toBeNull();
    expect(propositionHypotheseTag(tag, [s(1, 'Ploufy'), s(2, 'ploufy'), s(3, ' Ploufy ')])).toBeNull();
    expect(propositionHypotheseTag(tag, [s(1, 'Ploufy'), s(1, 'Ploufy'), s(2, 'Nagette')])).toBeNull();
    // Un annonceur inconnu compte comme sauvegarde, pas comme annonceur.
    expect(tagRecurrent([s(1, 'Ploufy'), s(2, 'Nagette'), s(3, '')])).toBe(true);
    expect(tagRecurrent([s(1, 'Ploufy'), s(2, ''), s(3, '')])).toBe(false);
  });

  it('au seuil · formulaire pré-rempli · le trait, le constat, la variable que le tag nomme, les preuves', () => {
    const p = propositionHypotheseTag(tag, [s(1, 'Ploufy'), s(2, 'Nagette'), s(3, 'Ploufy')])!;
    expect(p).not.toBeNull();
    expect(p.depart.parties).toEqual({ si: 'nos pubs reprennent « Hook UGC »', alors: '', parceQue: '« Hook UGC » revient sur 3 pubs gardées de la Veille, chez 2 annonceurs (Ploufy, Nagette)' });
    expect(p.depart.variable).toBe('hook');
    expect(p.preuves.map((x) => x.id)).toEqual([u(1), u(2), u(3)]);
    expect(p.total).toBe(3);
    // La phrase composée est une hypothèse acceptée (incomplète · « alors » à écrire), rien d'inventé.
    expect(composerHypothese(p.depart.parties)).toBe('Si nos pubs reprennent « Hook UGC », alors…, parce que « Hook UGC » revient sur 3 pubs gardées de la Veille, chez 2 annonceurs (Ploufy, Nagette).');
    expect(validerSaisieHypothese({ ...p.depart.parties, variable: p.depart.variable }).ok).toBe(true);
  });

  it('les preuves sont bornées (stockage), le total reste exact', () => {
    const beaucoup = Array.from({ length: PREUVES_MAX_HYPOTHESE_TAG + 7 }, (_, i) => s(i + 1, `A${i % 4}`));
    const p = propositionHypotheseTag(tag, beaucoup)!;
    expect(p.preuves).toHaveLength(PREUVES_MAX_HYPOTHESE_TAG);
    expect(p.total).toBe(PREUVES_MAX_HYPOTHESE_TAG + 7);
    expect(p.depart.parties.parceQue).toContain('chez 4 annonceurs (A0, A1, A2 et 1 autre)');
  });

  it('la variable · seulement quand le tag en nomme UNE', () => {
    expect(variableDepuisTag('Hook UGC')).toBe('hook');
    expect(variableDepuisTag('Preuve sociale')).toBe('proof');
    expect(variableDepuisTag('Appel à l’action fort')).toBe('cta');
    expect(variableDepuisTag('Offre -30 %')).toBe('offer');
    expect(variableDepuisTag('Avant / Après')).toBeNull();
    expect(variableDepuisTag('Montre son produit')).toBeNull();
    expect(variableDepuisTag('Hook et offre')).toBeNull();
    expect(variableDepuisTag('Hookline')).toBeNull();
  });

  it('la provenance « tag » se garde sur l’ad et se relit · la carte la dit', () => {
    const o = { type: 'tag' as const, tag: 'Hook UGC', cle: 'hook ugc', savedAdIds: [u(1), u(2), u(3)], total: 4 };
    expect(lireOrigineHypothese(refOrigineHypothese(o))).toEqual(o);
    expect(libelleOrigine(o)).toBe('Veille · tag « Hook UGC » · 4 sauvegardes');
    expect(lireOrigineHypothese({ hypotheseLibre: { type: 'tag', tag: 'x', cle: 'x', savedAdIds: ['forgé', u(1)], total: -3 } })).toEqual({ type: 'tag', tag: 'x', cle: 'x', savedAdIds: [u(1)], total: 1 });
  });

  it('le refus de l’action dit le seuil', () => {
    expect(REFUS_TAG_NON_RECURRENT).toBe('Ce tag ne revient pas sur assez de sauvegardes de la marque active (3 au moins, chez 2 annonceurs) · rien n’a été enregistré.');
  });
});
