import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { contenuVide, type ContenuVersion } from '../src/studios/document';
import { GRILLE_STUDIO } from '../src/studios/execution/tarifs';
import {
  mesurerDureeAudio, formatAudio, capacitesVoix, modesParole, refusMode, changementsModeParole, plansLipsyncIndisponible,
  narrationValidee, garderTexteVoix, recalculerTemps, FOURNISSEURS_VOIX, type SortieVoix,
} from '../src/studios/voix';
import { planVideo } from './l6b-fixtures';

/**
 * L6-B · voix (VIDEO-06, VIDEO-07), règles pures.
 *
 * Durées : fixtures RÉELLES générées localement (`fixtures/l6b-generer-audio.py`),
 * comparées à des oracles INDÉPENDANTS du code mesuré, relevés une fois :
 *  · WAV · module `wave` de Python : 27 200 trames à 16 000 Hz = 1 700 ms ;
 *    11 025 trames à 44 100 Hz = 250 ms ;
 *  · MP3 · décodeur de Chromium (`decodeAudioData`) : 2,6122448979591835 s
 *    (CBR, ID3v2 + ID3v1) et 1,3061224489795917 s (en-tête Xing, MPEG-2).
 */

const fixture = (n: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', n)));

describe('VIDEO-06 · durée RÉELLE lue dans l’en-tête audio', () => {
  it('WAV · `wave` de Python et Chromium disent 1 700 ms et 250 ms ; la lecture des octets aussi', () => {
    expect(mesurerDureeAudio(fixture('l6b-voix-16k.wav'))).toEqual({ ok: true, format: 'wav', dureeMs: 1700, echantillons: 27200, frequence: 16000, canaux: 1, methode: 'wav_data', tronque: false, trames: null });
    expect(mesurerDureeAudio(fixture('l6b-voix-liste.wav'))).toMatchObject({ ok: true, format: 'wav', dureeMs: 250, echantillons: 11025, frequence: 44100, canaux: 2 });
  });

  it('MP3 · trames parcourues (CBR, étiquettes ID3v2 et ID3v1) et en-tête Xing · égal au décodeur de Chromium', () => {
    expect(mesurerDureeAudio(fixture('l6b-voix-cbr.mp3'))).toEqual({ ok: true, format: 'mp3', dureeMs: Math.round(2.6122448979591835 * 1000), echantillons: 115200, frequence: 44100, canaux: 1, methode: 'mp3_trames', tronque: false, trames: 100 });
    expect(mesurerDureeAudio(fixture('l6b-voix-xing.mp3'))).toEqual({ ok: true, format: 'mp3', dureeMs: Math.round(1.3061224489795917 * 1000), echantillons: 28800, frequence: 22050, canaux: 1, methode: 'mp3_xing', tronque: false, trames: 50 });
  });

  it('le format se lit dans les octets · un PNG, du texte ou un MP3 coupé en plein milieu sont refusés sans estimation', () => {
    expect(formatAudio(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBeNull();
    expect(mesurerDureeAudio(new TextEncoder().encode('Bonjour, ceci est une voix.'))).toEqual({ ok: false, motif: 'format non reconnu · seuls WAV et MP3 sont mesurés' });
    const mp3 = fixture('l6b-voix-cbr.mp3');
    const casse = mp3.slice(); casse.fill(0x41, 40 + 208 * 10, 40 + 208 * 10 + 4); // ID3v2 de 40 octets, 11e trame
    expect(mesurerDureeAudio(casse)).toMatchObject({ ok: false, motif: expect.stringContaining('trame invalide') });
  });

  it('WAV tronqué · mesuré sur ce qui est présent, et dit tronqué', () => {
    const w = fixture('l6b-voix-16k.wav').slice(0, 44 + 16000 * 2); // une seconde de données présentes
    expect(mesurerDureeAudio(w)).toMatchObject({ ok: true, dureeMs: 1000, tronque: true });
  });
});

describe('capacités voix · disponibles seulement avec un tarif ET un fournisseur', () => {
  it('aujourd’hui · ni tarif voix, ni fournisseur : synthèse et lipsync indisponibles, dites telles', () => {
    expect(GRILLE_STUDIO.speech.credits).toBeNull();
    expect(FOURNISSEURS_VOIX).toEqual({ synthese: [], lipsync: [] });
    const c = capacitesVoix();
    expect(c.synthese).toEqual({ disponible: false, raison: 'La synthèse vocale n’est pas disponible · aucun tarif de voix n’existe dans l’offre et aucun fournisseur de voix n’est branché.' });
    expect(c.lipsync.disponible).toBe(false);
  });

  it('un fournisseur sans tarif, ou un tarif sans fournisseur, ne rend rien disponible ; les deux, si', () => {
    const tarif = { credits: 2, usdMicros: 10_000, source: 'hypothèse de test' };
    expect(capacitesVoix({ fournisseurs: { synthese: ['tts-x'], lipsync: ['ls-x'] } }).synthese.disponible).toBe(false);
    expect(capacitesVoix({ tarif, fournisseurs: { synthese: [], lipsync: [] } }).synthese.disponible).toBe(false);
    expect(capacitesVoix({ tarif, fournisseurs: { synthese: ['tts-x'], lipsync: [] } })).toMatchObject({ synthese: { disponible: true }, lipsync: { disponible: false } });
    expect(capacitesVoix({ tarif, fournisseurs: { synthese: ['tts-x'], lipsync: ['ls-x'] } }).lipsync.disponible).toBe(true);
  });
});

describe('VIDEO-07 · voix off et lipsync, deux modes distincts, aucun lipsync simulé', () => {
  it('modes offerts · voix off proposée, lipsync non choisissable avec sa raison, sans voix', () => {
    const m = modesParole(capacitesVoix());
    expect(m.map((x) => [x.mode, x.disponible])).toEqual([['voiceover', true], ['lipsync', false], ['none', true]]);
    expect(m[1]!.raison).toContain('Elle n’est jamais simulée');
    expect(refusMode('lipsync', capacitesVoix())).toContain('n’est pas disponible');
    expect(refusMode('voiceover', capacitesVoix())).toBeNull();
    expect(refusMode('chant', capacitesVoix())).toBe('mode de parole voix off, lipsync ou sans voix attendu');
  });

  it('un plan en lipsync est signalé, et sa bascule en voix off ne touche que ce plan', () => {
    const c: ContenuVersion = { ...contenuVide(), shots: { order: ['s1', 's2'], byId: { s1: planVideo('s1', [], { speechMode: 'lipsync', narration: 'Salut' }), s2: planVideo('s2', [], { speechMode: 'voiceover', narration: 'Go' }) } } };
    expect(plansLipsyncIndisponible(c, capacitesVoix())).toEqual(['s1']);
    const r = changementsModeParole(c, ['s1', 's2'], 'voiceover');
    expect(r).toEqual({ ok: true, changes: [{ op: 'replace', path: '/shots/byId/s1/speechMode', newValue: 'voiceover', reason: 'Mode de parole du plan s1 : voiceover' }], allowedPaths: ['/shots/byId/s1/speechMode'] });
  });
});

describe('VIDEO-06 · texte prononcé = narration validée, sans préambule ni réécriture', () => {
  const narration = 'Lumea Verre 3 · 92 % des testeuses la recommandent.';
  const sortie = (o: Partial<SortieVoix> = {}): SortieVoix => ({ spokenText: narration, voiceId: 'voix-claire-fr', language: 'fr', deliveryNotes: 'Débit posé.', pronunciations: [{ text: 'Lumea', pronunciation: 'lu-mé-a' }], ...o });
  const garde = (s: SortieVoix) => garderTexteVoix({ narration, voiceId: 'voix-claire-fr', language: 'fr', sortie: s }).map((v) => v.code);

  it('sortie exacte · aucune violation', () => expect(garde(sortie())).toEqual([]));
  it('préambule, ajout final, reformulation · chacun nommé', () => {
    expect(garde(sortie({ spokenText: `Voici le texte : ${narration}` }))).toEqual(['PREAMBULE']);
    expect(garderTexteVoix({ narration, voiceId: 'voix-claire-fr', language: 'fr', sortie: sortie({ spokenText: `Voici le texte : ${narration}` }) })[0]!.message).toBe('Préambule ajouté avant la narration : « Voici le texte : » · refusé, seule la narration validée est prononcée.');
    expect(garde(sortie({ spokenText: `${narration} Bonne journée !` }))).toEqual(['AJOUT_FINAL']);
    expect(garde(sortie({ spokenText: 'Lumea Verre 3, recommandée par 92 % des testeuses.' }))).toEqual(['REECRITURE']);
  });
  it('direction dans le texte, prononciation hors texte, voix ou langue changées', () => {
    expect(garde(sortie({ spokenText: `${narration} Débit posé.`, deliveryNotes: 'Débit posé.' }))).toEqual(['AJOUT_FINAL', 'DIRECTION_DANS_TEXTE']);
    expect(garde(sortie({ pronunciations: [{ text: 'Lumière', pronunciation: 'lu' }] }))).toEqual(['PRONONCIATION_HORS_TEXTE']);
    expect(garde(sortie({ voiceId: 'voix-grave', language: 'en' }))).toEqual(['VOIX_REMPLACEE', 'LANGUE_ALTEREE']);
  });

  it('la narration validée vient du plan de la version · sans voix ou vide ⇒ rien à prononcer', () => {
    const c: ContenuVersion = { ...contenuVide(), shots: { order: ['s1', 's2', 's3'], byId: { s1: planVideo('s1', [], { narration, speechMode: 'voiceover' }), s2: planVideo('s2', [], { narration, speechMode: 'none' }), s3: planVideo('s3', [], { narration: '  ', speechMode: 'voiceover' }) } } };
    expect(narrationValidee(c, 's1')).toEqual({ ok: true, texte: narration, mode: 'voiceover' });
    expect(narrationValidee(c, 's2')).toMatchObject({ ok: false });
    expect(narrationValidee(c, 's3')).toMatchObject({ ok: false, raison: 'ce plan n’a pas de narration' });
  });
});

describe('VIDEO-06 · temps recalculés sur les durées mesurées', () => {
  it('une prise plus longue allonge son plan, le dépassement de la cible est dit en clair', () => {
    const c: ContenuVersion = { ...contenuVide(), shots: { order: ['s1', 's2'], byId: { s1: planVideo('s1', [], { estimatedDurationMs: 1500 }), s2: planVideo('s2', [], { estimatedDurationMs: 2000 }) } } };
    const t = recalculerTemps(c, { s1: 1700, s2: 1306 });
    expect(t.plans.map((p) => [p.shotId, p.mesureMs, p.retenuMs, p.depassementMs])).toEqual([['s1', 1700, 1700, 200], ['s2', 1306, 2000, 0]]);
    expect(t).toMatchObject({ cibleMs: 3500, totalMs: 3700, depassementMs: 200, message: 'Durée recalculée 3,70 s pour une cible de 3,50 s · dépassement de 0,20 s.' });
    expect(recalculerTemps(c, {}).message).toBe('Durée recalculée 3,50 s · dans la cible de 3,50 s.');
  });
});
