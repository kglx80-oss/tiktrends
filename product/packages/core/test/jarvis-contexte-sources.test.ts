import { describe, it, expect } from 'vitest';
import {
  PUCES_CONTEXTE_JARVIS, PUCES_REELLES, contexteSelonPuces, chatSystemPrompt,
} from '../src/index';

/**
 * UX V5 · les puces de contexte · de VRAIS interrupteurs, un RÉSULTAT.
 *
 * On éprouve deux choses :
 *  · la règle `contexteSelonPuces` décide ce qui est inclus · seule « Fiche
 *    marque » est réelle ; Meta / TikTok / Veille n'ajoutent jamais rien, quoi
 *    que le client envoie (pas de faux interrupteur, pas de faux connecteur) ;
 *  · le CONTEXTE ASSEMBLÉ change réellement · décocher « Fiche marque » retire
 *    l'identité et la mémoire de la consigne de Jarvis (on lit le texte compilé).
 */

describe('les quatre puces de la maquette', () => {
  it('seule « Fiche marque » est un interrupteur réel · les autres sont montrées mais inertes', () => {
    expect(PUCES_CONTEXTE_JARVIS.map((p) => p.cle)).toEqual(['meta', 'tiktok', 'veille', 'fiche']);
    expect(PUCES_REELLES).toEqual(['fiche']);
    for (const p of PUCES_CONTEXTE_JARVIS) {
      if (p.reel) expect(p.aVenir).toBeNull();
      else expect(p.aVenir, p.cle).toMatch(/À venir/);
    }
  });
});

describe('contexteSelonPuces · seule une puce réelle inclut quelque chose', () => {
  it('défaut (sélection absente) · tout le contexte réel est inclus', () => {
    expect(contexteSelonPuces(null)).toEqual({ ficheMarque: true });
    expect(contexteSelonPuces(undefined)).toEqual({ ficheMarque: true });
  });
  it('« Fiche marque » cochée l’inclut, décochée l’exclut', () => {
    expect(contexteSelonPuces(['fiche'])).toEqual({ ficheMarque: true });
    expect(contexteSelonPuces([])).toEqual({ ficheMarque: false });
  });
  it('Meta / TikTok / Veille n’incluent JAMAIS rien, même envoyées cochées', () => {
    expect(contexteSelonPuces(['meta', 'tiktok', 'veille'])).toEqual({ ficheMarque: false });
  });
});

describe('le contexte serveur change VRAIMENT selon « Fiche marque »', () => {
  const identite = 'Crème solaire minérale sans traces blanches, promesse « zéro trace ».';
  // Un repère distinctif, absent du socle figé de la consigne.
  const memoireRepere = 'MEMOIRE_REPERE_Z42 · accroche gagnante 5 fois sur 6';
  const base = { brandName: 'Neva', measuredAds: 4, canAdsmap: true, memory: memoireRepere };

  it('cochée · identité et mémoire sont dans la consigne', () => {
    const avec = chatSystemPrompt({ ...base, identity: identite });
    expect(avec).toContain(identite);
    expect(avec).toContain(memoireRepere);
  });

  it('décochée · identité et mémoire DISPARAISSENT · Jarvis dit qu’il n’a rien de mesuré', () => {
    // Ce que le serveur fait quand la puce est décochée (route) : identity null, memory ''.
    const sans = chatSystemPrompt({ ...base, identity: null, memory: '' });
    expect(sans).not.toContain(identite);
    expect(sans).not.toContain(memoireRepere);
    expect(sans).toMatch(/Rien de mesuré/);
  });
});
