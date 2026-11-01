import { describe, expect, it } from 'vitest';
import { MESSAGES_LOGO_SERVI, decisionLogoServi, empreinteDuLogo, empreintesLogosCharte, lireEmpreintesLogos } from '../src';

/**
 * L'empreinte d'un logo importé · on lit la TABLE rendue (ce qui sera écrit
 * en base) et la DÉCISION de service (servi, ou refusé avec sa cause et son
 * message), jamais la présence d'un appel.
 */
const MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
const MULTI = `${'a'.repeat(32)}-12`;
const U1 = 'https://cdn.exemple.test/bucket/assets/ws/1-ab-logo.png';
const U2 = 'https://cdn.exemple.test/bucket/assets/ws/2-cd-logo.png';
const EXT = 'https://site.exemple.fr/logo.png';

describe('lireEmpreintesLogos · la table relue en base', () => {
  it('garde les empreintes fortes bien formées, ignore le reste sans erreur', () => {
    expect(lireEmpreintesLogos({ [U1]: MD5, [U2]: MULTI })).toEqual({ [U1]: MD5, [U2]: MULTI });
    expect(lireEmpreintesLogos({ [U1]: 'W/"x"', [U2]: 'a"b', x: 3, '': MD5, y: 'z'.repeat(129) })).toEqual({});
    for (const v of [null, undefined, 'texte', 42, [MD5], true]) expect(lireEmpreintesLogos(v), String(v)).toEqual({});
  });
  it('« __proto__ » est une adresse comme une autre, jamais un prototype', () => {
    const t = lireEmpreintesLogos(JSON.parse(`{"__proto__":"${MD5}"}`));
    expect(Object.getPrototypeOf(t)).toBe(Object.prototype);
    expect(empreinteDuLogo(JSON.parse(`{"__proto__":"${MD5}"}`), '__proto__')).toBe(MD5);
    expect(empreinteDuLogo({}, 'toString')).toBeNull();
  });
  it('empreinteDuLogo · celle de l’adresse, sinon null (logo ancien, externe)', () => {
    expect(empreinteDuLogo({ [U1]: MD5 }, U1)).toBe(MD5);
    expect(empreinteDuLogo({ [U1]: MD5 }, EXT)).toBeNull();
    expect(empreinteDuLogo(null, U1)).toBeNull();
  });
});

describe('empreintesLogosCharte · la table écrite avec la charte', () => {
  it('logo nouveau relu · son empreinte est gardée ; logo externe ou ancien · rien', () => {
    expect(empreintesLogosCharte({ avant: null, charte: [U1, EXT, U1], relues: new Map([[U1, MD5]]) })).toEqual({ [U1]: MD5 });
    expect(empreintesLogosCharte({ avant: null, charte: [EXT], relues: new Map() })).toBeNull();
  });
  it('logo déjà en base · garde son empreinte ; logo retiré de la charte · la perd', () => {
    expect(empreintesLogosCharte({ avant: { [U1]: MD5, [U2]: MULTI }, charte: [U1, EXT], relues: new Map() })).toEqual({ [U1]: MD5 });
    expect(empreintesLogosCharte({ avant: { [U1]: MD5 }, charte: [EXT], relues: new Map() })).toBeNull();
  });
  it('relecture nouvelle · remplace l’ancienne ; relecture sans ETag fort · rien (jamais l’ancienne)', () => {
    expect(empreintesLogosCharte({ avant: { [U1]: MD5 }, charte: [U1], relues: new Map([[U1, MULTI]]) })).toEqual({ [U1]: MULTI });
    expect(empreintesLogosCharte({ avant: { [U1]: MD5 }, charte: [U1], relues: new Map([[U1, null]]) })).toBeNull();
    expect(empreintesLogosCharte({ avant: null, charte: [U1], relues: new Map([[U1, 'W/"faible"']]) })).toBeNull();
  });
});

describe('decisionLogoServi · servir ou transmettre un logo', () => {
  it('logo SANS empreinte (ancien, externe) · servi comme avant, sans vérification', () => {
    expect(decisionLogoServi({ empreinte: null })).toEqual({ servir: true, verifie: false });
    expect(decisionLogoServi({ empreinte: undefined, verification: { ok: false, raison: 'remplace' } })).toEqual({ servir: true, verifie: false });
  });
  it('objet confirmé (ETag relu égal) · servi, vérifié ; stockage qui ne rend pas l’ETag après If-Match accepté · servi', () => {
    expect(decisionLogoServi({ empreinte: MD5, verification: { ok: true, empreinte: MD5 } })).toEqual({ servir: true, verifie: true });
    expect(decisionLogoServi({ empreinte: MD5, verification: { ok: true, empreinte: null } })).toEqual({ servir: true, verifie: true });
  });
  it('objet REMPLACÉ · 412 sur If-Match, ou ETag relu différent · refusé « à réimporter »', () => {
    const attendu = { servir: false, cause: 'remplace', message: MESSAGES_LOGO_SERVI.remplace };
    expect(decisionLogoServi({ empreinte: MD5, verification: { ok: false, raison: 'remplace' } })).toEqual(attendu);
    expect(decisionLogoServi({ empreinte: MD5, verification: { ok: true, empreinte: MULTI } })).toEqual(attendu);
    expect(MESSAGES_LOGO_SERVI.remplace).toMatch(/^Logo à réimporter · /);
  });
  it('objet disparu · refusé ; stockage injoignable, hors espace ou non configuré · refusé, jamais servi sans vérification', () => {
    expect(decisionLogoServi({ empreinte: MD5, verification: { ok: false, raison: 'absent' } })).toEqual({ servir: false, cause: 'absent', message: MESSAGES_LOGO_SERVI.absent });
    for (const verification of [{ ok: false, raison: 'illisible' } as const, { ok: false, raison: 'hors_espace' } as const, null, undefined]) {
      expect(decisionLogoServi({ empreinte: MD5, verification }), JSON.stringify(verification)).toEqual({ servir: false, cause: 'illisible', message: MESSAGES_LOGO_SERVI.illisible });
    }
  });
  it('messages d’écran · sans tiret cadratin', () => {
    for (const m of Object.values(MESSAGES_LOGO_SERVI)) expect(m).not.toContain('—');
  });
});
