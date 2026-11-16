import { describe, it, expect } from 'vitest';
import {
  avecControleParole, avecControleVision, controleParoleApprouve, reserveControleParoleMicros, libelleLigneDevis, libelleCaseControleParole,
  vueLignesDevis, qualifierDevis, phraseCoutDevis, estLigneDeProduction, operationsDuSnapshot, coutSoumissionStudio, capacitesDesOperations,
  idDepenseControleParole, idDepenseDuJob, lireTranscriptionFal, corpsTranscriptionFal, prisesParleesDuDevis,
  OPERATION_CONTROLE_PAROLE, PROFIL_CONTROLE_PAROLE, TARIF_TRANSCRIPTION_MICROS_PAR_MINUTE, MODELE_FAL_TRANSCRIPTION, URL_TRANSCRIPTION_FAL,
  GRILLE_STUDIO, type LigneDevis, type SnapshotJob, type ContenuVersion,
} from '../src';

/**
 * Contrôle de la parole · la ligne du devis (réserve et prix annoncés avant
 * le clic), sa lecture à l'exécution, et la lecture stricte de la réponse
 * Scribe v2.
 */

const clip = (sid: string): LigneDevis => ({
  operation: `clip:${sid}`, nature: 'generation', profil: 'animation', unites: 1,
  credits: GRILLE_STUDIO.animation.credits!, usdMicros: GRILLE_STUDIO.animation.usdMicros!, inclus: false, natureCout: 'estimation', motifEstimation: 'forfait vidéo',
});

describe('réserve · durée × 0,008 $/min, au cent supérieur', () => {
  it('tarif relevé · 8 000 µ$ par minute', () => {
    expect(TARIF_TRANSCRIPTION_MICROS_PAR_MINUTE).toBe(8_000);
    expect([1, 5_000, 60_000, 75_000, 75_001, 90_000].map(reserveControleParoleMicros)).toEqual([10_000, 10_000, 10_000, 10_000, 20_000, 20_000]);
  });
});

describe('ligne « contrôle de la parole » du devis', () => {
  it('une unité par prise parlée, au montant de la plus longue, 0 crédit, borne', () => {
    const r = avecControleParole([clip('s1')], { actif: true, prises: [{ operation: 'clip:s1', dureeMs: 5_000 }] });
    expect(r.lignes).toEqual([clip('s1'), {
      operation: OPERATION_CONTROLE_PAROLE, nature: 'generation', profil: PROFIL_CONTROLE_PAROLE, unites: 1, credits: 0,
      usdMicros: 10_000, inclus: true, natureCout: 'borne', motifEstimation: null,
    }]);
    expect(r.totalCredits).toBe(GRILLE_STUDIO.animation.credits);
    expect(r.totalUsdMicros).toBe(GRILLE_STUDIO.animation.usdMicros! + 10_000);
  });

  it('inactive, sans prise parlée ou durée hors borne ⇒ aucune ligne', () => {
    expect(avecControleParole([clip('s1')], { actif: false, prises: [{ operation: 'clip:s1', dureeMs: 5_000 }] }).lignes).toEqual([clip('s1')]);
    expect(avecControleParole([clip('s1')], { actif: true, prises: [] }).lignes).toEqual([clip('s1')]);
    expect(avecControleParole([clip('s1')], { actif: true, prises: [{ operation: 'clip:s1', dureeMs: 200_000 }] }).lignes).toEqual([clip('s1')]);
  });

  it('posée APRÈS le contrôle visuel, les deux lignes cohabitent ; reposée, elle ne se double pas', () => {
    const v = avecControleVision([clip('s1')], { actif: true, modele: 'claude-sonnet-5' });
    const p = avecControleParole(avecControleParole(v.lignes, { actif: true, prises: [{ operation: 'clip:s1', dureeMs: 5_000 }] }).lignes, { actif: true, prises: [{ operation: 'clip:s1', dureeMs: 5_000 }] });
    expect(p.lignes.filter((l) => l.profil === PROFIL_CONTROLE_PAROLE)).toHaveLength(1);
  });

  it('ce que la personne lit avant le clic · libellé, montant, « au plus »', () => {
    const r = avecControleParole([clip('s1'), clip('s2')], { actif: true, prises: [{ operation: 'clip:s1', dureeMs: 5_000 }, { operation: 'clip:s2', dureeMs: 5_000 }] });
    const l = r.lignes.find((x) => x.profil === PROFIL_CONTROLE_PAROLE)!;
    expect(libelleLigneDevis(l)).toBe('Contrôle de la parole · 2 prises');
    expect(vueLignesDevis([l])).toEqual([{ libelle: 'Contrôle de la parole · 2 prises', usdMicros: 20_000, credits: 0, natureCout: 'borne', motifEstimation: null }]);
    expect(phraseCoutDevis(20_000, qualifierDevis([l]))).toBe('0,02 $ au plus de coût fournisseur');
    expect(libelleCaseControleParole(10_000)).toMatch(/^Contrôle de la parole de la prise livrée · 0,01 \$ au plus par prise, ajouté au devis/);
  });

  it('relue à l’exécution · approuvée ou absente', () => {
    const r = avecControleParole([clip('s1')], { actif: true, prises: [{ operation: 'clip:s1', dureeMs: 5_000 }] });
    expect(controleParoleApprouve(r.lignes)).toEqual({ unites: 1, usdMicros: 10_000, totalUsdMicros: 10_000 });
    expect(controleParoleApprouve([clip('s1')])).toBeNull();
    expect(controleParoleApprouve([{ operation: OPERATION_CONTROLE_PAROLE, profil: PROFIL_CONTROLE_PAROLE, unites: 1, usdMicros: 0 }])).toBeNull();
    expect(controleParoleApprouve('pas une liste')).toBeNull();
  });

  it('n’est pas une ligne de production · le clip part seul chez le fournisseur vidéo, au forfait vidéo', () => {
    const lignes = avecControleParole([clip('s1')], { actif: true, prises: [{ operation: 'clip:s1', dureeMs: 5_000 }] }).lignes;
    expect(lignes.filter(estLigneDeProduction).map((l) => l.operation)).toEqual(['clip:s1']);
    const snap = { lignes } as unknown as SnapshotJob;
    expect(operationsDuSnapshot(snap)).toEqual([{ operation: 'clip:s1', profil: 'animation' }]);
    expect(coutSoumissionStudio(operationsDuSnapshot(snap))).toMatchObject({ ok: true, poste: 'fal_video' });
  });

  it('interrupteur · la ligne relève de la capacité vidéo, aucun interrupteur nouveau', () => {
    expect(capacitesDesOperations([OPERATION_CONTROLE_PAROLE])).toEqual(['video']);
    expect(capacitesDesOperations(['clip:s1', OPERATION_CONTROLE_PAROLE])).toEqual(['video']);
  });

  it('les prises parlées d’un devis · clips dont le plan a une réplique et un mode de parole', () => {
    const plan = (sid: string, narration: string, speechMode: string) => ({ shotId: sid, narration, speechMode, estimatedDurationMs: 4_000 });
    const contenu = { shots: { order: ['s1', 's2', 's3'], byId: { s1: plan('s1', 'Découvre la crème.', 'lipsync'), s2: plan('s2', '', 'voiceover'), s3: plan('s3', 'Texte', 'none') } } } as unknown as ContenuVersion;
    expect(prisesParleesDuDevis(contenu, [clip('s1'), clip('s2'), clip('s3')], 5_000)).toEqual([{ operation: 'clip:s1', dureeMs: 5_000 }]);
  });
});

describe('dépense · une ligne par transcription, distincte de celle du job', () => {
  it('dérivée du job, de la prise et de l’essai', () => {
    const job = '0b8a7e8e-5b2c-4f0e-9d5e-4b1c2a3d4e5f';
    const a = idDepenseControleParole(job, 'clip:s1', 1);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).toBe(idDepenseControleParole(job, 'clip:s1', 1));
    expect(new Set([a, idDepenseControleParole(job, 'clip:s1', 2), idDepenseControleParole(job, 'clip:s2', 1), idDepenseDuJob(job)]).size).toBe(4);
  });
});

describe('Scribe v2 · corps envoyé et lecture stricte de la réponse', () => {
  it('modèle, adresse, corps', () => {
    expect(MODELE_FAL_TRANSCRIPTION).toBe('fal-ai/elevenlabs/speech-to-text/scribe-v2');
    expect(URL_TRANSCRIPTION_FAL).toBe('https://fal.run/fal-ai/elevenlabs/speech-to-text/scribe-v2');
    expect(corpsTranscriptionFal({ audioUrl: 'https://s/p.mp4' })).toEqual({ audio_url: 'https://s/p.mp4', language_code: 'fra', tag_audio_events: false, diarize: false });
  });
  it('mots seulement (espaces et événements sonores ignorés), secondes → ms, champs inconnus ignorés', () => {
    const r = lireTranscriptionFal({ text: 'x', language_code: 'fra', extra: 1, words: [
      { text: 'Oui', start: 0.1, end: 0.25, type: 'word', speaker_id: 'speaker_0', logprob: -0.1 },
      { text: ' ', start: 0.25, end: 0.3, type: 'spacing' },
      { text: '(rires)', start: 0.3, end: 0.9, type: 'audio_event' },
      { text: 'merci !', start: 0.95, end: 1.3, type: 'word' },
    ] });
    expect(r).toEqual({ ok: true, transcription: { texte: 'Oui merci !', langue: 'fra', mots: [{ texte: 'Oui', debutMs: 100, finMs: 250 }, { texte: 'merci !', debutMs: 950, finMs: 1300 }] } });
  });
  it.each([
    ['pas un objet', null, /objet attendu/],
    ['sans mots', { text: 'Oui' }, /sans liste de mots/],
    ['temps non fini', { words: [{ text: 'Oui', start: 'a', end: 1, type: 'word' }] }, /mal horodaté/],
    ['fin avant début', { words: [{ text: 'Oui', start: 2, end: 1, type: 'word' }] }, /mal horodaté/],
    ['hors d’ordre', { words: [{ text: 'a', start: 2, end: 2.1, type: 'word' }, { text: 'b', start: 1, end: 1.1, type: 'word' }] }, /hors d’ordre/],
    ['texte manquant', { words: [{ start: 0, end: 1, type: 'word' }] }, /sans texte lisible/],
  ])('%s ⇒ refus', (_, corps, motif) => {
    const r = lireTranscriptionFal(corps);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.motif).toMatch(motif);
  });
});
