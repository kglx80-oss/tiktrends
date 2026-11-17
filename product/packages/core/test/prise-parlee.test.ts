import { describe, it, expect } from 'vitest';
import {
  consigneDeLaPrise, parametresDeLaPrise, priseDuClip, MOTS_PAR_SECONDE_NARRATION, consigneMouvementDuPlan, parametresDuClip, lireParametresClip, estPriseParlee,
  nonInclusDuRendu, planRenduFinal, timelineDesPlans, CONSIGNE_MOUVEMENT_MAX, CONSIGNE_SON_PRISE,
  type ContenuVersion, type PlanStudio,
} from '../src';

/**
 * Prise parlée · la consigne d'un plan dont la voix naît DANS la prise. On lit
 * la consigne produite : la réplique validée y est mot pour mot entre
 * guillemets, la langue et le mode de parole sont dits, la musique, les
 * sous-titres et le texte écran sont exclus · un plan muet garde la consigne
 * d'avant, à l'identique.
 */

const KF = '22222222-2222-4222-8222-222222222222';
const SHA = 'a'.repeat(64);
const plan = (o: Partial<PlanStudio> = {}): PlanStudio => ({
  shotId: 's1', purpose: 'Accroche', subject: 'Léa en veste jaune', action: 'se tourne vers la caméra et sourit', framing: 'plan rapproché',
  camera: 'travelling avant lent', lighting: 'lumière du matin', environment: 'salle de bain claire', referenceIds: [],
  narration: 'Tu en as marre des boutons ?', onScreenText: ['MARRE DES BOUTONS ?'], speechMode: 'lipsync', estimatedDurationMs: 4000, ...o,
});
const contenu = (p: PlanStudio): ContenuVersion => ({
  brief: null, productRef: null, styleRef: null, characterRefs: {}, shots: { order: [p.shotId], byId: { [p.shotId]: p } }, document: null, timeline: null,
} as unknown as ContenuVersion);
const consigne = (p: PlanStudio, langue?: string) => {
  const r = consigneDeLaPrise(p, langue);
  if (!r.ok) throw new Error(r.motif);
  return r.consigne;
};
/** La réplique telle qu'elle figure dans la consigne · le texte ENTRE les guillemets. */
const entreGuillemets = (c: string) => /« (.*?) »/.exec(c)?.[1] ?? null;
const nbFois = (c: string, s: string) => c.split(s).length - 1;

describe('prise parlée · la consigne', () => {
  it('exemple complet · lipsync en français', () => {
    expect(consigne(plan())).toBe(
      'Prise parlée en français, face caméra · le personnage dit la réplique à l’image, les lèvres synchronisées sur chaque mot. '
      + 'Réplique à dire mot pour mot, sans rien ajouter ni retirer : « Tu en as marre des boutons ? » '
      + 'Mouvement : se tourne vers la caméra et sourit. Caméra : travelling avant lent. '
      + 'À garder identique à l’image de départ : sujet Léa en veste jaune ; cadrage plan rapproché ; décor salle de bain claire ; lumière lumière du matin. '
      + 'Mouvement naturel et fluide. Son : la voix et le son du lieu seulement · pas de musique, pas de sous-titres, aucun texte à l’écran.',
    );
  });

  it('voix off · réplique mot pour mot entre guillemets, mode dit, musique, sous-titres et texte écran exclus une seule fois', () => {
    const c = consigne(plan({ speechMode: 'voiceover', narration: 'Trois gouttes le soir,\n\n  et ta peau respire.' }));
    expect(entreGuillemets(c)).toBe('Trois gouttes le soir, et ta peau respire.');
    expect(c).toContain('Prise parlée en français, voix off · une voix hors champ dit la réplique, personne ne parle à l’image');
    expect(c).toContain('pas de musique, pas de sous-titres, aucun texte à l’écran');
    expect(nbFois(c, 'aucun texte à l’écran')).toBe(1);
    expect(c).toContain('Mouvement : se tourne vers la caméra et sourit.');
    expect(c).not.toContain('MARRE DES BOUTONS');
  });

  it('chaque mot de la narration, dans l’ordre, et rien d’autre entre les guillemets', () => {
    const narration = 'Elle a dit "non" , puis : 3 € · 100 % naturel !\tVraiment.';
    const c = consigne(plan({ narration }));
    const dedans = c.slice(c.indexOf(': « ') + 4, c.lastIndexOf(' » '));
    expect(dedans.split(' ')).toEqual(narration.split(/\s+/));
  });

  it('guillemets « » dans la narration ⇒ refus dit (ils délimitent la réplique), rien n’est envoyé', () => {
    expect(consigneDeLaPrise(plan({ narration: 'Elle a dit « non ».' }))).toMatchObject({ ok: false, motif: expect.stringMatching(/guillemets « »/) });
    expect(consigneDeLaPrise(plan({ narration: 'Fin » piégée' }))).toMatchObject({ ok: false });
  });

  it('langue du projet · anglais accepté, langue inconnue refusée et dite', () => {
    expect(consigne(plan(), 'en')).toMatch(/^Prise parlée en anglais,/);
    expect(consigneDeLaPrise(plan(), 'de')).toMatchObject({ ok: false, motif: expect.stringMatching(/Langue « de »/) });
  });

  it('plan muet ou sans narration ⇒ consigne STRICTEMENT celle d’avant', () => {
    for (const p of [plan({ speechMode: 'none' }), plan({ speechMode: 'voiceover', narration: '   ' }), plan({ speechMode: 'lipsync', narration: '' })]) {
      expect(estPriseParlee(p)).toBe(false);
      expect(consigneDeLaPrise(p)).toEqual({ ok: true, consigne: consigneMouvementDuPlan(p), parlee: false });
    }
  });

  it('mouvement très long ⇒ c’est lui qui est raccourci · réplique et consigne de son intactes, bornée', () => {
    const long = 'mot '.repeat(1_000);
    const narration = 'Une réplique de taille normale, qui doit rester entière jusqu’au dernier mot.';
    const c = consigne(plan({ narration, action: long, camera: long, subject: long, environment: long, lighting: long, framing: long }));
    expect(c.length).toBeLessThanOrEqual(CONSIGNE_MOUVEMENT_MAX);
    expect(entreGuillemets(c)).toBe(narration);
    expect(c.endsWith(CONSIGNE_SON_PRISE)).toBe(true);
  });

  it('réplique trop longue pour la consigne ⇒ refus dit, jamais coupée', () => {
    expect(consigneDeLaPrise(plan({ narration: 'blabla '.repeat(200) }))).toMatchObject({ ok: false, motif: expect.stringMatching(/Réplique trop longue pour une prise .*jamais coupée/) });
  });
});

describe('prise parlée · les paramètres du clip', () => {
  const kf = { assetUuid: KF, sha256: SHA };
  const VEO = 'fal-ai/veo3.1/fast/image-to-video';
  const KLING = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';
  const base = (p: PlanStudio, modele: string = VEO) => {
    const r = parametresDuClip({ contenu: contenu(p), shotId: 's1', keyframe: kf, modele });
    if (!r.ok) throw new Error(r.motif);
    return r.parametres;
  };
  it('plan muet ⇒ paramètres identiques à ceux du catalogue', () => {
    const p = plan({ speechMode: 'none' });
    expect(parametresDeLaPrise({ contenu: contenu(p), shotId: 's1', keyframe: kf })).toEqual(parametresDuClip({ contenu: contenu(p), shotId: 's1', keyframe: kf }));
  });
  it('plan parlé, modèle SANS voix native (Kling, défaut) ⇒ consigne muette d’avant · rien de payé pour une voix qui ne viendra pas', () => {
    for (const speechMode of ['lipsync', 'voiceover'] as const) {
      const p = plan({ speechMode });
      for (const modele of [undefined, KLING]) {
        expect(parametresDeLaPrise({ contenu: contenu(p), shotId: 's1', keyframe: kf, modele })).toEqual(parametresDuClip({ contenu: contenu(p), shotId: 's1', keyframe: kf, modele }));
      }
      expect(priseDuClip({ ...base(p), audio: false }, p)).toEqual({ ok: true, parametres: { ...base(p), audio: false } });
    }
  });
  it('de bout en bout · Veo 3.1 (voix native) en lipsync ⇒ prise PARLÉE ; en voix off ⇒ clip muet, consigne d’avant', () => {
    const lip = plan({ speechMode: 'lipsync' });
    const r = parametresDeLaPrise({ contenu: contenu(lip), shotId: 's1', keyframe: kf, modele: VEO });
    expect(r.ok && r.parametres.audio).toBe(true);
    expect(r.ok && r.parametres.consigne).toBe(consigne(lip));
    const off = plan({ speechMode: 'voiceover' });
    expect(parametresDeLaPrise({ contenu: contenu(off), shotId: 's1', keyframe: kf, modele: VEO })).toEqual(parametresDuClip({ contenu: contenu(off), shotId: 's1', keyframe: kf, modele: VEO }));
  });
  it('voix native demandée à un modèle qui ne rend pas la voix (Kling, hors catalogue) ⇒ consigne muette · `modeleRendLaVoix` tranche', () => {
    const p = plan({ speechMode: 'lipsync' });
    for (const modele of [KLING, 'fal-ai/inconnu/image-to-video']) {
      const x = { ...base(p, KLING), modele, audio: true };
      expect(priseDuClip(x, p), modele).toEqual({ ok: true, parametres: x });
    }
  });
  it('plan parlé, voix native demandée au modèle ⇒ même clip, consigne de la prise, relue par le contrat', () => {
    const p = plan();
    const r = priseDuClip({ ...base(p), audio: true }, p);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect({ ...r.parametres, consigne: '' }).toEqual({ ...base(p), audio: true, consigne: '' });
    expect(r.parametres.consigne).toBe(consigne(p));
    expect(lireParametresClip(r.parametres).ok).toBe(true);
  });
  it('réplique plus longue que ce que la durée du clip permet de dire ⇒ refus AVANT le devis, raison écrite', () => {
    const p = plan({ narration: 'un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze' });
    const r = priseDuClip({ ...base(p), audio: true, dureeS: 5 }, p);
    expect(r).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    expect(!r.ok && r.motif).toBe(`La réplique se dit en 5,6 s environ (14 mots à ${String(MOTS_PAR_SECONDE_NARRATION).replace('.', ',')} mots par seconde), le clip en dure 5 · raccourcis-la ou allonge le plan, rien n’est parti.`);
    expect(priseDuClip({ ...base(p), audio: true, dureeS: 8 }, p).ok).toBe(true);
  });
  it('réplique avec un emplacement non résolu, ou image clé absente ⇒ refus', () => {
    const p = plan({ narration: 'Bonjour {{prenom}}' });
    expect(priseDuClip({ ...base(p), audio: true }, p)).toMatchObject({ ok: false, code: 'INVALID_SCHEMA' });
    expect(parametresDeLaPrise({ contenu: contenu(plan()), shotId: 's1', keyframe: null })).toMatchObject({ ok: false, code: 'MISSING_REFERENCE' });
  });
});

describe('vidéo finale · « non inclus » dit la vérité sur la voix', () => {
  const U = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000000`;
  const c = (() => {
    const plans = [plan({ shotId: 's1', speechMode: 'voiceover', onScreenText: [] }), plan({ shotId: 's2', speechMode: 'none', onScreenText: [] }), plan({ shotId: 's3', speechMode: 'lipsync', onScreenText: [] })];
    const base = { brief: null, productRef: null, styleRef: null, characterRefs: {}, shots: { order: plans.map((p) => p.shotId), byId: Object.fromEntries(plans.map((p) => [p.shotId, p])) }, document: null, timeline: null } as unknown as ContenuVersion;
    return { ...base, timeline: { ...timelineDesPlans(base, null), subtitles: { enabled: true } } };
  })();
  const r = planRenduFinal({ contenu: c, clips: { s1: U(1), s2: U(2), s3: U(3) }, musique: null });
  if (!r.ok) throw new Error('plan');

  it('avant le clic · son inconnu, dit comme tel', () => {
    expect(r.plan.nonInclus).toEqual([
      'Voix · non garantie, seule une prise livrée avec du son dit la narration · vérifié à l’assemblage (plan 1, plan 3).',
      'Sous-titres · non incrustés.',
      'Musique · aucune choisie, la bande son sera le son des prises, un silence si elles sont muettes.',
    ]);
  });
  it('après l’assemblage · prises parlées sonores ⇒ son présent, mais réplique NON vérifiée (avoir du son n’est pas avoir dit sa réplique)', () => {
    expect(nonInclusDuRendu(r.plan, [true, false, true])).toEqual([
      'Voix · son présent dans la prise, réplique non vérifiée (plan 1, plan 3).',
      'Sous-titres · non incrustés.', 'Musique · aucune choisie, la bande son est le son des prises.',
    ]);
  });
  it('après l’assemblage · une prise parlée muette ⇒ nommée', () => {
    expect(nonInclusDuRendu(r.plan, [true, true, false]).slice(0, 2)).toEqual(['Voix · prise muette, la narration n’est pas dite (plan 3).', 'Voix · son présent dans la prise, réplique non vérifiée (plan 1).']);
    expect(nonInclusDuRendu(r.plan, [false, false, false])).toContain('Musique · aucune choisie, bande son silencieuse.');
  });
});
