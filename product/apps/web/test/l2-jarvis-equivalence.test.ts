import { describe, it, expect } from 'vitest';
import { chatSystemPrompt, actionsPromptBlock, type NiveauAccueil } from '@tiktrends/core';
import { assemblerConsigneJarvis, validerPolitiqueConversation, type DonneesConversation } from '../lib/studios/prompts/conversation';
import { POLITIQUE_JARVIS_1_0_0 } from '../lib/studios/prompts/complement-tiktrends';

/**
 * Le branchement de Jarvis sur le registre ne change PAS son comportement.
 *
 * La politique `jarvis.conversation` 1.0.0 (complément du registre) assemblée
 * par le code donne, au caractère près, la consigne que l'ancien code envoyait
 * (`chatSystemPrompt`), sur toutes les combinaisons de contexte qui changent
 * un bloc : mémoire vide, courte ou au-delà du plafond ; effectifs autour des
 * seuils de prudence ; registre ; « où envoyer » ; actions ; règles maison ;
 * identité courte ou longue. On compare des RÉSULTATS (les textes), pas des
 * appels.
 */

const memoires = ['', '  ', 'listicle : 3 gagnantes sur 8', 'x'.repeat(12000)];
const effectifs = [0, 1, 9, 10, 39, 40, 500];
const niveaux: Array<NiveauAccueil | null | undefined> = [undefined, null, 'debut', 'intermediaire', 'avance'];
const regles = [null, '', '   ', 'Jamais de compte à rebours.', 'R'.repeat(3000)];
const identites = [null, '', 'Sérum · peaux sèches', 'I'.repeat(2000)];

describe('jarvis.conversation 1.0.0 · identique au code d’avant', () => {
  it('la politique migrée est valide', () => {
    expect(validerPolitiqueConversation(POLITIQUE_JARVIS_1_0_0).ok).toBe(true);
  });

  it('même consigne au caractère près sur toutes les combinaisons', () => {
    let n = 0;
    const ecarts: string[] = [];
    for (const memory of memoires) for (const measuredAds of effectifs) for (const niveau of niveaux)
      for (const canAdsmap of [true, false]) for (const canPropose of [true, false, undefined])
        for (const rules of regles) for (const identity of identites) {
          const ctx = { brandName: 'Neva', memory, measuredAds, niveau, canAdsmap, canPropose, rules, identity };
          const attendu = chatSystemPrompt(ctx);
          const d: DonneesConversation = { ...ctx, niveau: niveau ?? null, blocActions: actionsPromptBlock() };
          const obtenu = assemblerConsigneJarvis(POLITIQUE_JARVIS_1_0_0, d);
          n++;
          if (obtenu !== attendu && ecarts.length < 3) ecarts.push(JSON.stringify({ memory: memory.slice(0, 20), measuredAds, niveau, canAdsmap, canPropose, rules: rules?.slice(0, 10), identity: identity?.slice(0, 10) }));
        }
    expect(ecarts, `consigne différente pour : ${ecarts.join(' | ')}`).toEqual([]);
    expect(n).toBeGreaterThan(5000);
  });

  it('une section modifiée change la consigne · le registre est bien la source du texte', () => {
    const modifiee = { ...POLITIQUE_JARVIS_1_0_0, sections: { ...POLITIQUE_JARVIS_1_0_0.sections, socle: POLITIQUE_JARVIS_1_0_0.sections.socle.replace('Réponds court.', 'Réponds court et clair.') } };
    const d: DonneesConversation = { brandName: 'Neva', memory: '', measuredAds: 0, canAdsmap: false, blocActions: '' };
    expect(assemblerConsigneJarvis(modifiee, d)).toContain('Réponds court et clair.');
    expect(assemblerConsigneJarvis(POLITIQUE_JARVIS_1_0_0, d)).not.toContain('Réponds court et clair.');
  });

  it('une variable inconnue ou mal placée refuse la politique', () => {
    const avec = (section: string, texte: string) => ({ ...POLITIQUE_JARVIS_1_0_0, sections: { ...POLITIQUE_JARVIS_1_0_0.sections, [section]: texte } });
    const codes = (p: unknown) => { const v = validerPolitiqueConversation(p); return v.ok ? [] : v.constats.map((c) => c.code); };
    expect(codes(avec('socle', 'Tu es {{secret}}'))).toContain('PACK_VARIABLE_INCONNUE');
    expect(codes(avec('prudencePeu', 'PRUDENCE\nPeu de tests.'))).toContain('PACK_VARIABLE_ABSENTE');
    expect(codes(avec('socle', 'accolade {{ orpheline'))).toContain('PACK_GABARIT_MAL_FORME');
    expect(codes({ ...POLITIQUE_JARVIS_1_0_0, key: 'jarvis.autre' })).toContain('CONVERSATION_CLE_INCONNUE');
  });
});
