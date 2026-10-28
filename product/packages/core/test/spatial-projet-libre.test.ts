import { describe, expect, it } from 'vitest';
import {
  aideCanevasLibre, annonceDeplacement, messageEnregistrementLibre, modeDisposition, phraseAvalCarte, raisonCanevasIndisponible,
  rechercheDisposition, texteZoneLibre,
} from '../src';

/**
 * Spatial · fiche projet · règles PURES de la disposition libre (canvas métier
 * de la V5 porté). Le mode vit dans l'adresse, les phrases dites à l'écran
 * (annonce clavier, retour d'enregistrement, raisons) sont fixées ici.
 */

describe('disposition libre · le mode vit dans l’adresse', () => {
  it('seul `libre` ouvre le canvas libre · tout le reste garde les couloirs', () => {
    expect(modeDisposition('libre')).toBe('libre');
    expect(modeDisposition(['libre', 'x'])).toBe('libre');
    for (const v of [undefined, null, '', 'LIBRE', 'couloirs', 1, ['couloirs']]) expect(modeDisposition(v)).toBe('couloirs');
  });

  it('la recherche garde les autres paramètres · pose ou retire `disposition`', () => {
    expect(rechercheDisposition('?version=v2', 'libre')).toBe('?version=v2&disposition=libre');
    expect(rechercheDisposition('?version=v2&disposition=libre', 'couloirs')).toBe('?version=v2');
    expect(rechercheDisposition('', 'libre')).toBe('?disposition=libre');
    expect(rechercheDisposition('?disposition=libre', 'couloirs')).toBe('');
    expect(rechercheDisposition('disposition=libre', 'libre')).toBe('?disposition=libre');
  });
});

describe('disposition libre · ce que l’écran dit', () => {
  it('annonce clavier · la carte, le sens, la position atteinte', () => {
    expect(annonceDeplacement('Plan 1', 16, 0, { x: 116, y: 200 })).toBe('« Plan 1 » déplacée à droite · position 116, 200.');
    expect(annonceDeplacement('Plan 1', 0, -64, { x: 10.4, y: -3.6 })).toBe('« Plan 1 » déplacée vers le haut · position 10, -4.');
    expect(annonceDeplacement('Plan 1', -16, 0, null)).toBe('« Plan 1 » déplacée à gauche.');
    expect(annonceDeplacement('Plan 1', 0, 16, null)).toBe('« Plan 1 » déplacée vers le bas.');
  });

  it('zone aria-live · l’annonce, « Enregistrement… », puis le retour (une erreur commence par « Attention »)', () => {
    expect(texteZoneLibre(null, null)).toBe('');
    expect(texteZoneLibre('« A » déplacée à droite.', null)).toBe('« A » déplacée à droite. Enregistrement de ta disposition…');
    expect(texteZoneLibre('« A » déplacée à droite.', { ton: 'ok', texte: 'Fait.' })).toBe('« A » déplacée à droite. Fait.');
    expect(texteZoneLibre(null, { ton: 'err', texte: 'Raté.' })).toBe('Attention · Raté.');
  });

  it('retour d’enregistrement · fait, réinitialisé, conflit (rien d’écrasé), refus, coupure', () => {
    expect(messageEnregistrementLibre({ ok: true, reinitialise: false })).toEqual({ ton: 'ok', texte: 'Position enregistrée pour toi · l’ordre et les dépendances n’ont pas changé.' });
    expect(messageEnregistrementLibre({ ok: true, reinitialise: true }).texte).toMatch(/^Disposition réinitialisée/);
    expect(messageEnregistrementLibre({ ok: false, conflit: true, message: 'Changée ailleurs.' })).toEqual({ ton: 'err', texte: 'Changée ailleurs. Tes positions restent affichées ici.' });
    expect(messageEnregistrementLibre({ ok: false, conflit: false, message: 'Refus.' }).texte).toBe('Position non enregistrée · Refus. Tes positions restent affichées ; réessaie en déplaçant la carte.');
    expect(messageEnregistrementLibre({ ok: false, coupure: true }).texte).toMatch(/connexion interrompue/);
  });

  it('raison d’indisponibilité · capacité coupée, accès, contenu invalide, panne (avec identifiant support)', () => {
    expect(raisonCanevasIndisponible({ code: 'UNSUPPORTED_CAPABILITY', message: 'x', traceId: 't' })).toBe('La disposition libre n’est pas activée pour cet espace.');
    for (const code of ['FORBIDDEN', 'AUTH_REQUIRED', 'NOT_FOUND'] as const) expect(raisonCanevasIndisponible({ code, message: 'x', traceId: 't' })).toBe('La disposition libre n’est pas accessible pour ce projet.');
    expect(raisonCanevasIndisponible({ code: 'INVALID_SCHEMA', message: 'Contenu invalide.', traceId: 't' })).toMatch(/^Contenu invalide\. Ouvre une version antérieure/);
    expect(raisonCanevasIndisponible({ code: 'PERSISTENCE_FAILED', message: 'Panne.', traceId: 'tr-1' })).toBe('Panne. Identifiant support : tr-1.');
  });

  it('aval et aide · comptes accordés', () => {
    expect(phraseAvalCarte([])).toBe('La modifier ne rend aucune autre sortie obsolète.');
    expect(phraseAvalCarte([{ nature: 'generation' }, { nature: 'generation' }, { nature: 'calcul' }])).toBe('La modifier rendrait obsolètes 2 générations et 1 calcul en aval · rien n’est refait sans ton accord.');
    expect(aideCanevasLibre(1, 0)).toBe('1 carte · place automatique · glisse une carte ou utilise les flèches');
    expect(aideCanevasLibre(12, 2)).toBe('12 cartes · 2 placées à la main · ta disposition, personnelle');
  });
});
