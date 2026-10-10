import { describe, it, expect } from 'vitest';
import {
  lignesDuDevis, GRILLE_STUDIO, PRICING_VERSION, profilDuNoeud, refusPlafondDollars,
  empreinteEntreesDevis, verifierApprobation, expirationDevis, dureeValidite, VALIDITE_DEVIS_MS,
  decisionIdempotence, cleIdempotenceValide, cleFournisseurDuJob,
  type DevisFige, type EntreesDevis,
} from '../src/studios/execution';
import { calculerPlanImpact } from '../src/studios/impact';
import { CREDIT_COSTS } from '../src/credits';
import { FIXED_COSTS } from '../src/spend-guard';
import { contenuVideo } from './studios-fixtures';

/**
 * L3 · devis, approbation, idempotence (cahier 01 §9.2, §9.3 · COST-02, COST-04).
 * On vérifie des VALEURS : prix dérivés du barème existant, empreintes, verdicts.
 */

const plan = calculerPlanImpact(contenuVideo(), contenuVideo(), { sortiesExistantes: [] });

describe('grille · dérivée du barème existant, aucun prix inventé', () => {
  it('image clé = CREDIT_COSTS.image, clip = CREDIT_COSTS.video, plafonds FIXED_COSTS en micro-dollars entiers', () => {
    expect(GRILLE_STUDIO.image_generation).toMatchObject({ credits: CREDIT_COSTS.image, usdMicros: Math.round(FIXED_COSTS.fal_image * 1e6) });
    expect(GRILLE_STUDIO.animation).toMatchObject({ credits: CREDIT_COSTS.video, usdMicros: Math.round(FIXED_COSTS.fal_video * 1e6) });
    for (const t of Object.values(GRILLE_STUDIO)) {
      if (t.credits !== null) expect(Number.isInteger(t.credits)).toBe(true);
      if (t.usdMicros !== null) expect(Number.isInteger(t.usdMicros)).toBe(true);
    }
    expect(PRICING_VERSION).toMatch(/^studio-v1-[a-f0-9]{12}$/);
  });

  it('profils · identité et image clé = image, clip = animation, voix = parole, calcul = calcul', () => {
    expect(profilDuNoeud('keyframe:s1', 'generation')).toBe('image_generation');
    expect(profilDuNoeud('identite:c1', 'generation')).toBe('image_generation');
    expect(profilDuNoeud('clip:s1', 'generation')).toBe('animation');
    expect(profilDuNoeud('voix:s1', 'generation')).toBe('speech');
    expect(profilDuNoeud('export', 'calcul')).toBe('calcul');
    expect(profilDuNoeud('inconnu:x', 'generation')).toBeNull();
  });

  it('lignes · une image clé et la composition · 4 crédits, une ligne incluse à 0', () => {
    const r = lignesDuDevis(plan, ['keyframe:s_ouverture', 'composition']);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (!r.ok) return;
    expect(r.lignes.map((l) => [l.operation, l.credits, l.inclus])).toEqual([['composition', 0, true], ['keyframe:s_ouverture', CREDIT_COSTS.image, false]]);
    expect(r.totalCredits).toBe(CREDIT_COSTS.image);
    expect(r.totalUsdMicros).toBe(80_000);
  });

  it('voix · aucun tarif dans l’offre ⇒ UNSUPPORTED_CAPABILITY, rien deviné', () => {
    const r = lignesDuDevis(plan, ['voix:s_ouverture', 'keyframe:s_fin']);
    expect(r).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY', cibles: ['voix:s_ouverture'] });
  });

  it('une opération hors du plan ne se devise pas', () => {
    expect(lignesDuDevis(plan, ['keyframe:invente'])).toMatchObject({ ok: false, code: 'INVALID_SCHEMA', cibles: ['keyframe:invente'] });
  });

  it('plafond dollars · refuse un devis qui dépasse le reste, laisse passer un devis nul', () => {
    expect(refusPlafondDollars({ capUsd: 10, depenseUsd: 9.95, bloque: false, devisUsdMicros: 80_000 })).toMatch(/ne couvre pas/);
    expect(refusPlafondDollars({ capUsd: 10, depenseUsd: 9.9, bloque: false, devisUsdMicros: 80_000 })).toBeNull();
    expect(refusPlafondDollars({ capUsd: 10, depenseUsd: 10, bloque: true, devisUsdMicros: 0 })).toBeNull();
    expect(refusPlafondDollars({ capUsd: 10, depenseUsd: 10, bloque: true, devisUsdMicros: 1 })).toMatch(/atteint/);
  });
});

const entrees = (): EntreesDevis => {
  const r = lignesDuDevis(plan, ['keyframe:s_ouverture']);
  if (!r.ok) throw new Error('lignes');
  return { workspaceId: 'w', brandId: 'b', projectId: 'p', projectVersionId: 'v1', contentHash: 'c'.repeat(64), impactPlanHash: plan.empreinte, pricingVersion: PRICING_VERSION, lignes: r.lignes, epinglage: null };
};

describe('empreinte d’entrées · décrit l’intention, change avec chaque entrée', () => {
  it('mêmes entrées ⇒ même empreinte ; brief, prix, version, release ⇒ autre empreinte', () => {
    const base = empreinteEntreesDevis(entrees());
    expect(empreinteEntreesDevis(entrees())).toBe(base);
    const variantes: Array<[string, EntreesDevis]> = [
      ['contenu (brief)', { ...entrees(), contentHash: 'd'.repeat(64) }],
      ['version', { ...entrees(), projectVersionId: 'v2' }],
      ['prix', { ...entrees(), lignes: entrees().lignes.map((l) => ({ ...l, credits: l.credits + 1 })) }],
      ['grille', { ...entrees(), pricingVersion: 'studio-v1-autre' }],
      ['release', { ...entrees(), epinglage: { promptReleaseId: 'r', releaseHash: 'e'.repeat(64) } }],
      ['marque', { ...entrees(), brandId: 'b2' }],
    ];
    for (const [nom, e] of variantes) expect(empreinteEntreesDevis(e), `${nom} ne change pas l’empreinte`).not.toBe(base);
  });
});

describe('approbation · COST-04 devis périmé', () => {
  const t0 = new Date('2026-10-07T10:00:00Z');
  const devis: DevisFige = { id: 'q', projectVersionId: 'v1', inputHash: 'a'.repeat(64), maximumCredits: 4, expiresAt: expirationDevis(t0), pricingVersion: PRICING_VERSION, promptReleaseId: null };
  const ok = { inputHash: 'a'.repeat(64), creditsAnnonces: 4 };
  const etat = { maintenant: new Date(t0.getTime() + 60_000), versionCouranteId: 'v1' };

  it('devis valide, mêmes entrées, même prix, même version ⇒ accepté', () => {
    expect(verifierApprobation(devis, ok, etat)).toEqual({ ok: true });
  });
  it('expiré ⇒ QUOTE_EXPIRED (à la milliseconde d’expiration aussi)', () => {
    expect(verifierApprobation(devis, ok, { ...etat, maintenant: devis.expiresAt })).toMatchObject({ ok: false, code: 'QUOTE_EXPIRED' });
  });
  it('brief modifié (version courante changée) ⇒ VERSION_CONFLICT', () => {
    expect(verifierApprobation(devis, ok, { ...etat, versionCouranteId: 'v2' })).toMatchObject({ ok: false, code: 'VERSION_CONFLICT', motif: expect.stringMatching(/projet a changé/) });
  });
  it('prix annoncé différent ⇒ VERSION_CONFLICT ; prix non entier refusé', () => {
    expect(verifierApprobation(devis, { ...ok, creditsAnnonces: 3 }, etat)).toMatchObject({ ok: false, code: 'VERSION_CONFLICT', motif: expect.stringMatching(/prix/) });
    expect(verifierApprobation(devis, { ...ok, creditsAnnonces: 4.0001 }, etat)).toMatchObject({ ok: false });
    expect(verifierApprobation(devis, { ...ok, creditsAnnonces: '4' }, etat)).toMatchObject({ ok: false });
  });
  it('empreinte d’entrées différente ⇒ VERSION_CONFLICT', () => {
    expect(verifierApprobation(devis, { ...ok, inputHash: 'b'.repeat(64) }, etat)).toMatchObject({ ok: false, code: 'VERSION_CONFLICT' });
  });
  it('nouvelle grille SANS révocation ⇒ le devis épinglé reste valable ; grille révoquée ⇒ refus', () => {
    expect(verifierApprobation(devis, ok, { ...etat, grillesRevoquees: ['studio-v1-autre'] })).toEqual({ ok: true });
    expect(verifierApprobation(devis, ok, { ...etat, grillesRevoquees: [PRICING_VERSION] })).toMatchObject({ ok: false, code: 'QUOTE_EXPIRED' });
  });
  it('release épinglée révoquée ⇒ bloqué avec motif', () => {
    expect(verifierApprobation({ ...devis, promptReleaseId: 'r' }, ok, { ...etat, revocationRelease: 'fuite de consigne' })).toMatchObject({ ok: false, code: 'UNSUPPORTED_CAPABILITY', motif: expect.stringMatching(/fuite/) });
  });
  it('validité bornée', () => {
    expect(dureeValidite(undefined)).toBe(VALIDITE_DEVIS_MS);
    expect(dureeValidite(1)).toBe(60_000);
    expect(dureeValidite(1e12)).toBe(24 * 3_600_000);
  });
});

describe('idempotence · même clé ⇒ même job, autre intention ⇒ conflit', () => {
  it('décisions', () => {
    const d = { quoteId: 'q1', inputHash: 'h1' };
    expect(decisionIdempotence(null, d)).toBe('nouveau');
    expect(decisionIdempotence({ ...d }, d)).toBe('meme_job');
    expect(decisionIdempotence({ quoteId: 'q2', inputHash: 'h1' }, d)).toBe('conflit');
    expect(decisionIdempotence({ quoteId: 'q1', inputHash: 'h2' }, d)).toBe('conflit');
  });
  it('clés · 1 à 160 caractères sûrs', () => {
    expect(cleIdempotenceValide('clic-1:abc')).toBe(true);
    expect(cleIdempotenceValide('x'.repeat(160))).toBe(true);
    for (const k of ['', 'x'.repeat(161), ' espace', '__proto__/x', 42, null]) expect(cleIdempotenceValide(k), String(k)).toBe(false);
  });
  it('clé fournisseur · une par job, stable', () => {
    expect(cleFournisseurDuJob('j1')).toBe(cleFournisseurDuJob('j1'));
    expect(cleFournisseurDuJob('j1')).not.toBe(cleFournisseurDuJob('j2'));
  });
});
