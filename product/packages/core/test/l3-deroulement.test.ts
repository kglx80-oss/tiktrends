import { describe, it, expect } from 'vitest';
import {
  preuveSoumission, decisionBailExpire, decisionAnnulation, decisionStatut, decisionEvenement,
  fenetreWebhook, lireEvenement, acteurDepuis, chaineSignee,
  decisionReglement, bilanRegistre, violationsRegistreJob, refsDuJob,
  inspecterMedia, verdictQualiteAuto, vueJob,
  type EtatFournisseur,
} from '../src/studios/execution';
import { transitionJob, ETATS_JOB, type EtatJob } from '../src/studios/machines';

/**
 * L3 · décisions du worker, registre, décodage, vue (plan 06 §4, §8 · COST-06…11).
 */

describe('bail expiré · avant soumission prouvée ⇒ file ; après soumission possible ⇒ jamais d’aveugle', () => {
  it('preuve lue dans la tentative', () => {
    expect(preuveSoumission(null)).toBe('aucune');
    expect(preuveSoumission({ providerIdempotencyKey: null, providerRequestId: null })).toBe('aucune');
    expect(preuveSoumission({ providerIdempotencyKey: 'k', providerRequestId: null })).toBe('possible');
    expect(preuveSoumission({ providerIdempotencyKey: 'k', providerRequestId: 'r' })).toBe('acceptee');
  });

  it('table complète des décisions', () => {
    const avec = { rechercheParCle: true };
    const sans = { rechercheParCle: false };
    expect(decisionBailExpire('claimed', 'aucune', sans)).toBe('remettre_en_file');
    expect(decisionBailExpire('claimed', 'possible', avec)).toBe('reconciliation');
    expect(decisionBailExpire('running', 'acceptee', sans)).toBe('reprendre_suivi');
    expect(decisionBailExpire('running', 'possible', avec)).toBe('chercher_par_cle');
    expect(decisionBailExpire('running', 'possible', sans)).toBe('reconciliation');
    expect(decisionBailExpire('running', 'aucune', avec)).toBe('reconciliation');
    expect(decisionBailExpire('persisting', 'acceptee', sans)).toBe('reprendre_finalisation');
    expect(decisionBailExpire('cancel_requested', 'acceptee', sans)).toBe('reprendre_annulation');
    for (const e of ['queued', 'completed', 'failed', 'cancelled', 'reconciliation_required'] as const) expect(decisionBailExpire(e, 'aucune', avec)).toBe('rien');
  });

  it('aucune décision ne mène à une transition interdite par la machine', () => {
    const cible: Record<string, EtatJob | null> = { remettre_en_file: 'queued', reconciliation: 'reconciliation_required' };
    for (const e of ETATS_JOB) for (const p of ['aucune', 'possible', 'acceptee'] as const) for (const r of [true, false]) {
      const vers = cible[decisionBailExpire(e, p, { rechercheParCle: r })];
      if (vers) expect(transitionJob(e, vers, 'worker'), `${e} → ${vers}`).toEqual({ ok: true });
    }
  });
});

describe('annulation · avant et après démarrage', () => {
  it('rien de parti ⇒ arrêt sans frais ; requête connue ⇒ annulation distante ; résultat là ⇒ on le garde', () => {
    expect(decisionAnnulation('aucune', { rechercheParCle: false, resultatRecu: false })).toBe('annuler_sans_frais');
    expect(decisionAnnulation('acceptee', { rechercheParCle: false, resultatRecu: false })).toBe('demander_annulation_distante');
    expect(decisionAnnulation('possible', { rechercheParCle: true, resultatRecu: false })).toBe('chercher_par_cle');
    expect(decisionAnnulation('possible', { rechercheParCle: false, resultatRecu: false })).toBe('reconciliation');
    expect(decisionAnnulation('acceptee', { rechercheParCle: false, resultatRecu: true })).toBe('finaliser');
  });
});

describe('statut fournisseur et webhooks · ordre quelconque, doublons, état final stable', () => {
  it('statuts', () => {
    const t: Record<EtatFournisseur, string> = { en_cours: 'attendre', reussi: 'persister', echoue: 'echec', annule: 'annule', inconnu: 'reconciliation' };
    for (const [s, a] of Object.entries(t)) expect(decisionStatut(s as EtatFournisseur)).toBe(a);
  });

  it('succès dupliqué, progrès en retard, échec contradictoire ⇒ ignorés après le succès', () => {
    expect(decisionEvenement('running', 'succeeded').action).toBe('persister');
    for (const e of ['persisting', 'completed'] as const) {
      for (const t of ['succeeded', 'progress', 'failed', 'cancelled'] as const) expect(decisionEvenement(e, t).action, `${e}/${t}`).toBe('ignorer');
    }
    for (const e of ['failed', 'cancelled'] as const) expect(decisionEvenement(e, 'succeeded').action).toBe('ignorer');
    expect(decisionEvenement('running', 'progress').action).toBe('progression');
    expect(decisionEvenement('cancel_requested', 'succeeded').action).toBe('persister');
    expect(decisionEvenement('reconciliation_required', 'failed').action).toBe('echec');
    expect(decisionEvenement('queued', 'succeeded').action).toBe('ignorer');
  });

  it('les transitions déclenchées par un événement sont permises à l’acteur désigné', () => {
    const vers = { persister: 'persisting', echec: 'failed', annule: 'cancelled' } as const;
    for (const e of ETATS_JOB) for (const t of ['progress', 'succeeded', 'failed', 'cancelled'] as const) {
      const a = decisionEvenement(e, t).action;
      if (a in vers) expect(transitionJob(e, vers[a as keyof typeof vers], acteurDepuis(e)), `${e}/${t}`).toEqual({ ok: true });
    }
  });

  it('fenêtre anti-rejeu · 5 minutes de part et d’autre', () => {
    expect(fenetreWebhook(1000, 1000)).toBe('ok');
    expect(fenetreWebhook(1000 - 301, 1000)).toBe('trop_ancien');
    expect(fenetreWebhook(1000 + 301, 1000)).toBe('futur');
    expect(fenetreWebhook(Number.NaN, 1000)).toBe('trop_ancien');
    expect(chaineSignee(12, '{"a":1}')).toBe('12.{"a":1}');
  });

  it('lecture d’événement · forme stricte', () => {
    expect(lireEvenement({ id: 'e1', type: 'succeeded', requestId: 'r', emisA: 1 })).toEqual({ id: 'e1', type: 'succeeded', requestId: 'r', emisA: 1 });
    for (const x of [null, {}, { id: 'e', type: 'boom', requestId: 'r', emisA: 1 }, { id: 'e', type: 'progress', requestId: '', emisA: 1 }, { id: 'e', type: 'progress', requestId: 'r', emisA: 'x' }]) expect(lireEvenement(x)).toBeNull();
  });
});

describe('registre · un règlement, settle + release = réserve, jamais de flottant', () => {
  const lignes = [{ operation: 'keyframe:a', credits: 4, usdMicros: 80_000, unites: 1 }, { operation: 'composition', credits: 0, usdMicros: 0, unites: 1 }];
  const reserve = { credits: 4, usdMicros: 80_000 };

  it('livré ⇒ prix devisé réglé, rien rendu ; coût fournisseur réel retenu s’il est connu', () => {
    expect(decisionReglement({ issue: 'livre', reserve, lignes, coutFournisseurUsdMicros: 39_000 })).toEqual({ settle: { credits: 4, usdMicros: 39_000 }, release: { credits: 0, usdMicros: 41_000 } });
    expect(decisionReglement({ issue: 'livre', reserve, lignes })).toEqual({ settle: { credits: 4, usdMicros: 80_000 }, release: { credits: 0, usdMicros: 0 } });
  });
  it('livraison partielle ⇒ ce qui n’est pas livré est rendu', () => {
    expect(decisionReglement({ issue: 'livre', reserve, lignes, operationsLivrees: ['composition'] }).release.credits).toBe(4);
  });
  it('échec ou annulation sans frais ⇒ tout est rendu', () => {
    for (const issue of ['echec_sans_frais', 'annule_sans_frais'] as const) expect(decisionReglement({ issue, reserve, lignes })).toEqual({ settle: { credits: 0, usdMicros: 0 }, release: reserve });
  });
  it('facturé sans livrable ⇒ crédits rendus au client, dollars réglés au fournisseur', () => {
    expect(decisionReglement({ issue: 'facture_sans_livrable', reserve, lignes, coutFournisseurUsdMicros: 50_000 })).toEqual({ settle: { credits: 0, usdMicros: 50_000 }, release: { credits: 4, usdMicros: 30_000 } });
  });
  it('un coût fournisseur au-delà du plafond est borné à la réserve', () => {
    expect(decisionReglement({ issue: 'livre', reserve, lignes, coutFournisseurUsdMicros: 999_999 }).settle.usdMicros).toBe(80_000);
  });
  it('compte illimité (réserve 0 crédit) ⇒ 0 crédit réglé', () => {
    expect(decisionReglement({ issue: 'livre', reserve: { credits: 0, usdMicros: 80_000 }, lignes }).settle.credits).toBe(0);
  });

  it('violations · double réserve, double règlement, dépassement, terminal ouvert, réconciliation réglée', () => {
    const r = { kind: 'reserve' as const, credits: 4, usdMicros: 80_000 };
    const s = { kind: 'settle' as const, credits: 4, usdMicros: 80_000 };
    const l = { kind: 'release' as const, credits: 4, usdMicros: 0 };
    expect(violationsRegistreJob([r, s], 'completed')).toEqual([]);
    expect(violationsRegistreJob([r, r, s], 'completed').join()).toMatch(/réserves : 2/);
    expect(violationsRegistreJob([r, s, s], 'completed').join()).toMatch(/règlements : 2/);
    expect(violationsRegistreJob([r, s, l], 'completed').join()).toMatch(/dépasse/);
    expect(violationsRegistreJob([r], 'failed').join()).toMatch(/sans règlement/);
    expect(violationsRegistreJob([r, s], 'reconciliation_required').join()).toMatch(/déjà réglé/);
    expect(violationsRegistreJob([r], 'running')).toEqual([]);
    expect(bilanRegistre([r, s]).ouvert).toEqual({ credits: 0, usdMicros: 0 });
  });

  it('références identiques côté studio et côté crédits', () => {
    expect(refsDuJob('j')).toEqual({ reserve: 'studio:job:j:reserve', settle: 'studio:job:j:settle', release: 'studio:job:j:release' });
  });
});

/** En-têtes SEULS (signature + IHDR) · ce qui passait avant la recette du 8 octobre. */
function png(l: number, h: number): Uint8Array {
  const o = new Uint8Array(33);
  o.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(o.buffer).setUint32(16, l);
  new DataView(o.buffer).setUint32(20, h);
  return o;
}

describe('premier filtre · lire la structure réelle, pas le type annoncé', () => {
  it('un en-tête seul n’est pas un fichier · PNG, JPEG, MP4 refusés (fichiers complets : l3-media-complet)', () => {
    expect(inspecterMedia(png(2, 3))).toBeNull();
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 5, 0, 4, 1, 1, 0x11, 0]);
    expect(inspecterMedia(jpeg)).toBeNull();
    const mp4 = new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(inspecterMedia(mp4)).toBeNull();
  });
  it('octets tronqués, dimensions nulles, texte ⇒ pas même plausible', () => {
    expect(inspecterMedia(png(0, 3))).toBeNull();
    expect(inspecterMedia(png(2, 3).subarray(0, 20))).toBeNull();
    expect(inspecterMedia(new TextEncoder().encode('<html>erreur 502</html>'))).toBeNull();
    expect(inspecterMedia(new Uint8Array())).toBeNull();
  });
});

describe('qualité automatique · un constat négatif suffit, l’absence n’est pas une validation', () => {
  it('verdicts', () => {
    expect(verdictQualiteAuto([{ produitConforme: true }, { produitConforme: false }])).toBe('requires_review');
    expect(verdictQualiteAuto([{ produitConforme: true }])).toBe('pending');
    expect(verdictQualiteAuto([null, { produitConforme: null }])).toBe('pending');
  });
});

describe('vue · aucun remboursement annoncé avant d’être écrit', () => {
  const bilan = (release = 0, regle = false) => bilanRegistre([
    { kind: 'reserve', credits: 4, usdMicros: 80_000 },
    ...(regle ? [{ kind: 'settle' as const, credits: 4 - release, usdMicros: 0 }] : []),
    ...(release ? [{ kind: 'release' as const, credits: release, usdMicros: 0 }] : []),
  ]);
  it('annulation demandée après envoi ⇒ le fournisseur peut facturer, pas de promesse', () => {
    const v = vueJob({ etat: 'cancel_requested', qualite: 'pending', preuve: 'acceptee', bilan: bilan() });
    expect(v.message).toMatch(/peut encore facturer/);
    expect(v.message).not.toMatch(/rendu|rembours/);
    expect(v.creditsRendus).toBeNull();
  });
  it('réconciliation ⇒ rien n’est relancé, pas de remboursement annoncé', () => {
    const v = vueJob({ etat: 'reconciliation_required', qualite: 'pending', preuve: 'possible', bilan: bilan() });
    expect(v.message).toMatch(/rien n’est relancé/);
    expect(v.creditsRendus).toBeNull();
  });
  it('annulé avec libération écrite ⇒ montant exact', () => {
    expect(vueJob({ etat: 'cancelled', qualite: 'pending', preuve: 'aucune', bilan: bilan(4, true) }).message).toBe('Annulé · 4 crédits rendus.');
  });
  it('completed ≠ validé', () => {
    expect(vueJob({ etat: 'completed', qualite: 'requires_review', preuve: 'acceptee', bilan: bilan(0, true) }).message).toMatch(/à relire/);
  });
  it('aucun tiret cadratin dans les messages', () => {
    for (const e of ETATS_JOB) expect(vueJob({ etat: e, qualite: 'pending', preuve: 'acceptee', bilan: bilan() }).message).not.toMatch(/—/);
  });
});
