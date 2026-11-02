import { describe, expect, it } from 'vitest';
import { RAISONS_LOGO_CHARTE, bilanLogosCharte, charteAvecLogoImporte, charteAvecLogoReimporte, etatLogoCharte, logosAVerifier } from '../src';

/**
 * La fiche Identité · chaque logo de la charte jugé par la MÊME décision que
 * le service (`decisionLogoServi`) · on lit l'ÉTAT rendu (servi, à réimporter
 * avec sa raison, indisponible), la liste de ce qui sera vérifié (aucun logo
 * sans empreinte), et la charte écrite par un import « à la place ».
 */
const MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
const AUTRE = `${'b'.repeat(32)}`;
const U1 = 'https://cdn.exemple.test/bucket/assets/ws/1-ab-logo.png';
const U2 = 'https://cdn.exemple.test/bucket/assets/ws/2-cd-logo.png';
const EXT = 'https://site.exemple.fr/logo.png';

describe('etatLogoCharte · ce que la fiche dit d’un logo', () => {
  it('sans empreinte · servi, quelle que soit la vérification (aucune n’est demandée)', () => {
    expect(etatLogoCharte({ empreinte: null })).toEqual({ etat: 'servi' });
    expect(etatLogoCharte({ empreinte: null, verification: { ok: false, raison: 'remplace' } })).toEqual({ etat: 'servi' });
  });
  it('objet confirmé · servi', () => {
    expect(etatLogoCharte({ empreinte: MD5, verification: { ok: true, empreinte: MD5 } })).toEqual({ etat: 'servi' });
  });
  it('remplacé (412, ou ETag relu différent) · à réimporter, avec sa raison', () => {
    const attendu = { etat: 'a_reimporter', cause: 'remplace', raison: RAISONS_LOGO_CHARTE.remplace };
    expect(etatLogoCharte({ empreinte: MD5, verification: { ok: false, raison: 'remplace' } })).toEqual(attendu);
    expect(etatLogoCharte({ empreinte: MD5, verification: { ok: true, empreinte: AUTRE } })).toEqual(attendu);
  });
  it('disparu · à réimporter, raison « n’est plus dans le stockage »', () => {
    expect(etatLogoCharte({ empreinte: MD5, verification: { ok: false, raison: 'absent' } })).toEqual({ etat: 'a_reimporter', cause: 'absent', raison: RAISONS_LOGO_CHARTE.absent });
  });
  it('stockage injoignable, hors espace, ou vérification qui n’a pas pu partir · indisponible, JAMAIS à réimporter', () => {
    for (const verification of [{ ok: false, raison: 'illisible' } as const, { ok: false, raison: 'hors_espace' } as const, null, undefined]) {
      expect(etatLogoCharte({ empreinte: MD5, verification }), JSON.stringify(verification)).toEqual({ etat: 'indisponible', raison: RAISONS_LOGO_CHARTE.illisible });
    }
  });
  it('raisons d’écran · sans tiret cadratin', () => {
    for (const m of Object.values(RAISONS_LOGO_CHARTE)) expect(m).not.toContain('—');
  });
});

describe('logosAVerifier · seuls les logos AVEC empreinte partent au stockage', () => {
  it('un logo sans empreinte (externe, ancien) n’est jamais vérifié ; chaque adresse une fois', () => {
    expect(logosAVerifier({ [U1]: MD5 }, [U1, EXT, U1, null, '', U2])).toEqual([{ url: U1, empreinte: MD5 }]);
    expect(logosAVerifier(null, [U1, EXT])).toEqual([]);
    expect(logosAVerifier({ [U1]: 'W/"faible"' }, [U1])).toEqual([]);
  });
});

describe('bilanLogosCharte · la charte entière, logo par défaut signalé', () => {
  const remplace = new Map([[U1, { ok: false, raison: 'remplace' } as const]]);
  it('défaut remplacé · signalé en tête, et dans les états ; variante sans empreinte absente des états', () => {
    const b = bilanLogosCharte({ logos: [U1, EXT], defaut: U1, empreintes: { [U1]: MD5 }, verifications: remplace });
    expect(b.defaut).toEqual({ etat: 'a_reimporter', cause: 'remplace', raison: RAISONS_LOGO_CHARTE.remplace });
    expect(b.etats).toEqual({ [U1]: b.defaut });
  });
  it('variante remplacée · dans les états, défaut non signalé', () => {
    const b = bilanLogosCharte({ logos: [EXT, U1], defaut: EXT, empreintes: { [U1]: MD5 }, verifications: remplace });
    expect(b.defaut).toBeNull();
    expect(Object.keys(b.etats)).toEqual([U1]);
  });
  it('logo confirmé · aucun état ; logo à empreinte sans réponse · indisponible', () => {
    expect(bilanLogosCharte({ logos: [U1], defaut: U1, empreintes: { [U1]: MD5 }, verifications: new Map([[U1, { ok: true, empreinte: MD5 }]]) })).toEqual({ etats: {}, defaut: null });
    expect(bilanLogosCharte({ logos: [U1], defaut: U1, empreintes: { [U1]: MD5 }, verifications: new Map() }).defaut).toEqual({ etat: 'indisponible', raison: RAISONS_LOGO_CHARTE.illisible });
  });
});

describe('charteAvecLogoReimporte · importer À LA PLACE du logo à réimporter', () => {
  it('le défaut à réimporter · le fichier importé prend sa place et son rôle, les variantes restent', () => {
    expect(charteAvecLogoReimporte({ logos: [U1, EXT], defaut: U1 }, U1, U2)).toEqual({ logoUrl: U2, logos: [U2, EXT] });
  });
  it('une variante à réimporter · remplacée à sa place, le défaut ne change pas', () => {
    expect(charteAvecLogoReimporte({ logos: [EXT, U1], defaut: EXT }, U1, U2)).toEqual({ logoUrl: EXT, logos: [EXT, U2] });
  });
  it('un défaut absent de la liste · le fichier importé le remplace et rejoint la liste', () => {
    expect(charteAvecLogoReimporte({ logos: [EXT], defaut: U1 }, U1, U2)).toEqual({ logoUrl: U2, logos: [EXT, U2] });
  });
  it('un ancien inconnu de la charte · import ordinaire', () => {
    expect(charteAvecLogoReimporte({ logos: [EXT], defaut: EXT }, U1, U2)).toEqual(charteAvecLogoImporte({ logos: [EXT], defaut: EXT }, U2));
  });
});
