import { describe, expect, it } from 'vitest';
import {
  CLE_ENTREE_ETAT, DUREES_CONNUES_TRAVAIL, ECHEANCES_TRAVAIL_MS, ECHEANCE_PERSISTANCE_MS, ETATS_A_ECHEANCE, MARGE_ECHEANCE,
  RECUL_PERSISTANCE_BASE_MS, RECUL_PERSISTANCE_MAX_MS, IMAGE_MODELS, DELAI_VIDEO_HISTORIQUE_MS, IMAGES_PAR_APPEL_MAX, TELECHARGEMENTS_MEDIA_MAX,
  decisionEcheance, echeanceEtat, entreeDansEtat, lireEchecsPersistance, marqueEntreeEtat, profilEcheance, reculPersistanceMs, suitePersistance,
  transitionJob, decisionReglement, validerRaisonCloture, lireClotureDemandee, demandeCloture, motifClotureDemandee, RAISON_CLOTURE_MIN,
  ligneTacheAdmin, RAISON_CLOTURE_DEJA_DEMANDEE,
} from '../src';

/**
 * Studios · échéances du worker · aucun job sans issue (C1, I2).
 * Pur · on vérifie les VALEURS rendues (échéance, suite, recul), jamais qu'une
 * fonction est appelée.
 */

const MIN = 60_000;
const t0 = new Date('2026-11-16T10:00:00Z');
const plus = (ms: number) => new Date(t0.getTime() + ms);

describe('profil d’une tâche · lu dans les lignes de l’instantané', () => {
  it('image, clip, transcription · la ligne la plus longue l’emporte', () => {
    expect(profilEcheance([{ operation: 'keyframe:s1', profil: 'image_generation' }])).toBe('image');
    expect(profilEcheance([{ operation: 'clip:s1', profil: 'animation' }])).toBe('clip');
    expect(profilEcheance([{ operation: 'sous_titres:s1', profil: 'speech' }])).toBe('transcription');
    expect(profilEcheance([{ operation: 'transcription', profil: 'calcul' }])).toBe('transcription');
    expect(profilEcheance([{ operation: 'keyframe:s1', profil: 'image_generation' }, { operation: 'clip:s1', profil: 'animation' }])).toBe('clip');
    expect(profilEcheance(null)).toBe('image');
  });
});

describe('le tableau mesuré · l’échéance vaut la marge fois la plus longue durée connue', () => {
  it('les durées hautes viennent du code (catalogue image, ancien studio vidéo), pas d’une valeur posée', () => {
    expect(DUREES_CONNUES_TRAVAIL.image.hauteMs).toBe(Math.max(...IMAGE_MODELS.map((m) => m.timeoutMs ?? 0)));
    expect(DUREES_CONNUES_TRAVAIL.clip.hauteMs).toBe(DELAI_VIDEO_HISTORIQUE_MS);
    expect(DUREES_CONNUES_TRAVAIL.transcription.hauteMs, 'aucune mesure · la plus longue des mesurées').toBe(DUREES_CONNUES_TRAVAIL.clip.hauteMs);
  });

  it('20 min en image, 60 min en clip et en transcription · au moins 4 fois la plus longue durée connue, 50 fois la durée mesurée', () => {
    expect(ECHEANCES_TRAVAIL_MS).toEqual({ image: 20 * MIN, clip: 60 * MIN, transcription: 60 * MIN });
    for (const p of ['image', 'clip', 'transcription'] as const) {
      expect(ECHEANCES_TRAVAIL_MS[p]).toBeGreaterThanOrEqual(MARGE_ECHEANCE * DUREES_CONNUES_TRAVAIL[p].hauteMs);
      const m = DUREES_CONNUES_TRAVAIL[p].mesureeMs;
      if (m) expect(ECHEANCES_TRAVAIL_MS[p]).toBeGreaterThanOrEqual(20 * m[1]);
    }
  });

  it('persistance · 48 min, la marge fois le pire des téléchargements (4 sorties × 3 essais × 60 s)', () => {
    expect(ECHEANCE_PERSISTANCE_MS).toBe(MARGE_ECHEANCE * IMAGES_PAR_APPEL_MAX * TELECHARGEMENTS_MEDIA_MAX * 60_000);
    expect(ECHEANCE_PERSISTANCE_MS).toBe(48 * MIN);
  });

  it('chaque état surveillé a une échéance, les autres aucune', () => {
    expect([...ETATS_A_ECHEANCE].sort()).toEqual(['cancel_requested', 'persisting', 'reconciliation_required', 'running']);
    expect(echeanceEtat('running', 'image')).toBe(20 * MIN);
    expect(echeanceEtat('cancel_requested', 'clip')).toBe(60 * MIN);
    expect(echeanceEtat('reconciliation_required', 'image')).toBe(20 * MIN);
    expect(echeanceEtat('persisting', 'clip')).toBe(48 * MIN);
    expect(echeanceEtat('queued', 'image')).toBeNull();
    expect(echeanceEtat('claimed', 'image')).toBeNull();
    expect(echeanceEtat('completed', 'image')).toBeNull();
  });
});

describe('decisionEcheance · au-delà, une issue', () => {
  it('running échu → reconciliation_required par le worker (le coût reste incertain, jamais une resoumission)', () => {
    expect(decisionEcheance({ etat: 'running', profil: 'image', entreeLe: t0, maintenant: plus(20 * MIN) })).toEqual({ echu: false });
    const d = decisionEcheance({ etat: 'running', profil: 'image', entreeLe: t0, maintenant: plus(20 * MIN + 1) });
    expect(d).toMatchObject({ echu: true, vers: 'reconciliation_required', acteur: 'worker' });
    expect(d.echu && d.motif).toContain('20 min');
    expect(d.echu && transitionJob('running', d.vers, d.acteur).ok).toBe(true);
  });

  it('cancel_requested échu → reconciliation_required par le worker', () => {
    const d = decisionEcheance({ etat: 'cancel_requested', profil: 'clip', entreeLe: t0, maintenant: plus(61 * MIN) });
    expect(d).toMatchObject({ echu: true, vers: 'reconciliation_required', acteur: 'worker' });
    expect(d.echu && transitionJob('cancel_requested', d.vers, d.acteur).ok).toBe(true);
  });

  it('reconciliation_required échu → failed en facture_sans_livrable par le réconciliateur · crédits rendus, coût fournisseur gardé', () => {
    expect(decisionEcheance({ etat: 'reconciliation_required', profil: 'clip', entreeLe: t0, maintenant: plus(59 * MIN) }).echu).toBe(false);
    const d = decisionEcheance({ etat: 'reconciliation_required', profil: 'clip', entreeLe: t0, maintenant: plus(60 * MIN + 1) });
    expect(d).toMatchObject({ echu: true, vers: 'failed', acteur: 'reconciliateur', issue: 'facture_sans_livrable' });
    expect(d.echu && transitionJob('reconciliation_required', d.vers, d.acteur).ok).toBe(true);
    // Le règlement qui suit · aucun crédit consommé, le plafond dollars retenu (coût inconnu).
    const r = decisionReglement({ issue: 'facture_sans_livrable', reserve: { credits: 4, usdMicros: 80_000 }, lignes: [], coutFournisseurUsdMicros: null });
    expect(r).toEqual({ settle: { credits: 0, usdMicros: 80_000 }, release: { credits: 4, usdMicros: 0 } });
  });

  it('persisting échu → failed en facture_sans_livrable par le finaliseur', () => {
    const d = decisionEcheance({ etat: 'persisting', profil: 'image', entreeLe: t0, maintenant: plus(48 * MIN + 1) });
    expect(d).toMatchObject({ echu: true, vers: 'failed', acteur: 'finaliseur', issue: 'facture_sans_livrable' });
    expect(d.echu && transitionJob('persisting', d.vers, d.acteur).ok).toBe(true);
  });

  it('un état sans échéance n’est jamais échu, même très ancien', () => {
    expect(decisionEcheance({ etat: 'queued', profil: 'image', entreeLe: t0, maintenant: plus(1e9) }).echu).toBe(false);
  });
});

describe('entrée dans l’état · la marque du worker, sinon la dernière écriture', () => {
  it('la marque compte quand elle désigne l’état courant', () => {
    const r = { [CLE_ENTREE_ETAT]: marqueEntreeEtat('running', t0) };
    expect(entreeDansEtat({ state: 'running', result: r, updatedAt: plus(5 * MIN) }).toISOString()).toBe(t0.toISOString());
  });
  it('une marque d’un autre état, absente ou illisible · repli sur `updated_at`', () => {
    const r = { [CLE_ENTREE_ETAT]: marqueEntreeEtat('running', t0) };
    expect(entreeDansEtat({ state: 'reconciliation_required', result: r, updatedAt: plus(5 * MIN) }).toISOString()).toBe(plus(5 * MIN).toISOString());
    expect(entreeDansEtat({ state: 'running', result: null, updatedAt: plus(1) }).toISOString()).toBe(plus(1).toISOString());
    expect(entreeDansEtat({ state: 'running', result: { [CLE_ENTREE_ETAT]: { etat: 'running', a: 'pas une date' } }, updatedAt: plus(2) }).toISOString()).toBe(plus(2).toISOString());
  });
  it('en persisting sans marque · l’entrée notée au premier échec, stable même quand `updated_at` avance', () => {
    const error = { code: 'PERSISTENCE_FAILED', depuis: t0.toISOString(), echecsPersistance: 4 };
    expect(entreeDansEtat({ state: 'persisting', result: {}, updatedAt: plus(30 * MIN), error }).toISOString()).toBe(t0.toISOString());
    expect(entreeDansEtat({ state: 'running', result: {}, updatedAt: plus(30 * MIN), error }).toISOString()).toBe(plus(30 * MIN).toISOString());
  });
});

describe('Clore le rapprochement · la demande lue par le worker', () => {
  it('une raison écrite, bornée, espaces normalisés', () => {
    expect(validerRaisonCloture('  fal   confirme · rien reçu ')).toEqual({ ok: true, raison: 'fal confirme · rien reçu' });
    expect(validerRaisonCloture('court').ok).toBe(false);
    expect(validerRaisonCloture('x'.repeat(RAISON_CLOTURE_MIN - 1)).ok).toBe(false);
    expect(validerRaisonCloture('x'.repeat(501)).ok).toBe(false);
    expect(validerRaisonCloture(null).ok).toBe(false);
  });
  it('la demande posée se relit · illisible, elle n’existe pas', () => {
    const d = demandeCloture('u1', 'facture fal lue, aucune requête', t0);
    expect(lireClotureDemandee({ clotureDemandee: d })).toEqual({ par: 'u1', raison: 'facture fal lue, aucune requête', a: t0 });
    expect(lireClotureDemandee({ clotureDemandee: { ...d, raison: 'non' } })).toBeNull();
    expect(lireClotureDemandee({ clotureDemandee: { ...d, a: 'hier' } })).toBeNull();
    expect(lireClotureDemandee(null)).toBeNull();
    expect(motifClotureDemandee('facture lue')).toContain('facture lue');
  });
});

describe('recul de persistance · exponentiel, borné', () => {
  it('20 s, 40 s, 80 s… plafonné à 10 min', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(reculPersistanceMs)).toEqual([20_000, 40_000, 80_000, 160_000, 320_000, 600_000, 600_000, 600_000]);
    expect(RECUL_PERSISTANCE_BASE_MS).toBe(20_000);
    expect(RECUL_PERSISTANCE_MAX_MS).toBe(600_000);
    expect(reculPersistanceMs(0)).toBe(20_000);
    expect(reculPersistanceMs(Number.NaN)).toBe(20_000);
  });

  it('au plus une dizaine d’essais dans la fenêtre, au lieu d’un tous les 2 s', () => {
    let t = 0, n = 0;
    while (t < ECHEANCE_PERSISTANCE_MS) { n += 1; t += reculPersistanceMs(n); }
    expect(n).toBeLessThanOrEqual(10);
    expect(n).toBeGreaterThanOrEqual(5);
  });

  it('lit le compteur et le prochain essai dans l’erreur de persistance', () => {
    expect(lireEchecsPersistance(null)).toEqual({ echecs: 0, prochainEssai: null });
    expect(lireEchecsPersistance({ code: 'AUTRE', echecsPersistance: 3 })).toEqual({ echecs: 0, prochainEssai: null });
    expect(lireEchecsPersistance({ code: 'PERSISTENCE_FAILED', echecsPersistance: 3, prochainEssai: t0.toISOString() })).toEqual({ echecs: 3, prochainEssai: t0 });
  });

  it('suitePersistance · recul croissant tant que l’échéance tient, puis échec', () => {
    const s1 = suitePersistance({ erreur: null, entreeLe: t0, maintenant: plus(MIN), profil: 'image' });
    expect(s1).toEqual({ suite: 'reessayer', echecs: 1, prochainEssai: plus(MIN + 20_000) });
    const s2 = suitePersistance({ erreur: { code: 'PERSISTENCE_FAILED', echecsPersistance: 1 }, entreeLe: t0, maintenant: plus(2 * MIN), profil: 'image' });
    expect(s2).toEqual({ suite: 'reessayer', echecs: 2, prochainEssai: plus(2 * MIN + 40_000) });
    const proche = suitePersistance({ erreur: { code: 'PERSISTENCE_FAILED', echecsPersistance: 7 }, entreeLe: t0, maintenant: plus(45 * MIN), profil: 'image' });
    expect(proche, 'le dernier essai tombe à l’échéance, pas 10 min plus tard').toEqual({ suite: 'reessayer', echecs: 8, prochainEssai: plus(48 * MIN + 1) });
    const s3 = suitePersistance({ erreur: { code: 'PERSISTENCE_FAILED', echecsPersistance: 8 }, entreeLe: t0, maintenant: plus(48 * MIN + 1), profil: 'image' });
    expect(s3).toMatchObject({ suite: 'echec', echecs: 9 });
    expect(s3.suite === 'echec' && s3.motif).toContain('48 min');
  });
});

describe('la ligne de /admin/taches · « Clore le rapprochement » seulement sur une tâche en rapprochement', () => {
  const tache = (etat: string, erreur: unknown = null) => ({ id: 'j', operation: 'studio.generation', etat, lignes: null, projet: 'P', espace: 'E', creeLe: t0, erreur, registre: [] });
  it('permis sans demande, fermé avec sa raison une fois demandé, absent ailleurs', () => {
    expect(ligneTacheAdmin(tache('reconciliation_required'), plus(MIN)).clore).toEqual({ permis: true, raison: null });
    expect(ligneTacheAdmin(tache('reconciliation_required', { clotureDemandee: demandeCloture('u', 'facture fal lue, rien reçu', t0) }), plus(MIN)).clore).toEqual({ permis: false, raison: RAISON_CLOTURE_DEJA_DEMANDEE });
    for (const e of ['running', 'failed', 'persisting', 'cancel_requested']) expect(ligneTacheAdmin(tache(e), plus(MIN)).clore, e).toBeNull();
  });
});
