import { describe, it, expect } from 'vitest';
import { deciderPlage, entetesPlage, corpsPlage, servirPlage, type PlageOctets } from '../src/plage-octets';

/**
 * Requêtes partielles HTTP · la règle pure qui fait lire nos vidéos sur Safari
 * et l'iPhone (ils exigent `206`). On vérifie ce qui SORT : statut, bornes,
 * en-têtes exacts et octets servis.
 */

const T = 1000;
const d = (range: string | null, o: { taille?: number; ifRange?: string | null; etag?: string | null } = {}): PlageOctets =>
  deciderPlage({ taille: o.taille ?? T, range, ifRange: o.ifRange ?? null, etag: o.etag ?? null });

describe('sans plage, ou plage ignorée ⇒ 200 entier', () => {
  it('pas d’en-tête, en-tête vide ou blanc', () => {
    for (const r of [null, '', '   ']) expect(d(r), String(r)).toEqual({ statut: 200, debut: 0, fin: 999, longueur: 1000, motif: 'sans-plage' });
  });
  it('unité inconnue : ignorée (RFC 9110 §14.2 « MUST ignore »)', () => {
    for (const r of ['items=0-5', 'octets=0-1', 'n’importe quoi']) expect(d(r), r).toMatchObject({ statut: 200, motif: 'unite-inconnue', longueur: 1000 });
  });
  it('l’unité est insensible à la casse', () => {
    expect(d('BYTES=0-1')).toEqual({ statut: 206, debut: 0, fin: 1, longueur: 2 });
  });
  it('plages multiples : ignorées proprement, fichier entier, jamais de multipart', () => {
    for (const r of ['bytes=0-1,5-9', 'bytes=0-1, 10-', 'bytes=-5,0-1']) expect(d(r), r).toEqual({ statut: 200, debut: 0, fin: 999, longueur: 1000, motif: 'plages-multiples' });
  });
});

describe('plage satisfaisable ⇒ 206', () => {
  it('bytes=a-b : bornes incluses', () => {
    expect(d('bytes=0-99')).toEqual({ statut: 206, debut: 0, fin: 99, longueur: 100 });
    expect(d('bytes=10-10')).toEqual({ statut: 206, debut: 10, fin: 10, longueur: 1 });
  });
  it('bytes=0-1 · la toute première sonde de Safari', () => {
    expect(d('bytes=0-1')).toEqual({ statut: 206, debut: 0, fin: 1, longueur: 2 });
  });
  it('bytes=a-b dont la fin déborde : bornée à la taille', () => {
    expect(d('bytes=900-5000')).toEqual({ statut: 206, debut: 900, fin: 999, longueur: 100 });
    expect(d('bytes=999-999999999999999')).toEqual({ statut: 206, debut: 999, fin: 999, longueur: 1 });
  });
  it('bytes=a- : jusqu’à la fin', () => {
    expect(d('bytes=0-')).toEqual({ statut: 206, debut: 0, fin: 999, longueur: 1000 });
    expect(d('bytes=250-')).toEqual({ statut: 206, debut: 250, fin: 999, longueur: 750 });
    expect(d('bytes=999-')).toEqual({ statut: 206, debut: 999, fin: 999, longueur: 1 });
  });
  it('bytes=-n : les n derniers octets, tout le fichier si n dépasse', () => {
    expect(d('bytes=-100')).toEqual({ statut: 206, debut: 900, fin: 999, longueur: 100 });
    expect(d('bytes=-1')).toEqual({ statut: 206, debut: 999, fin: 999, longueur: 1 });
    expect(d('bytes=-5000')).toEqual({ statut: 206, debut: 0, fin: 999, longueur: 1000 });
  });
  it('espaces tolérés autour des nombres et de la valeur', () => {
    expect(d('  bytes = 5 - 9 ')).toEqual({ statut: 206, debut: 5, fin: 9, longueur: 5 });
  });
  it('une virgule finale vide ne fait pas une deuxième plage', () => {
    expect(d('bytes=0-9,')).toEqual({ statut: 206, debut: 0, fin: 9, longueur: 10 });
  });
});

describe('plage invalide ou hors taille ⇒ 416', () => {
  it('syntaxe invalide', () => {
    for (const r of ['bytes=', 'bytes=,', 'bytes=-', 'bytes=abc', 'bytes=5', 'bytes=x-9', 'bytes=0-y', 'bytes=9-3', 'bytes=-x', 'bytes=+1-2', 'bytes=1.5-2', 'bytes=--5', 'bytes=0x10-20', 'bytes=1234567890123456-']) {
      expect(d(r), r).toEqual({ statut: 416, motif: 'syntaxe' });
    }
  });
  it('hors taille', () => {
    for (const r of ['bytes=1000-', 'bytes=1000-1000', 'bytes=5000-6000', 'bytes=-0']) expect(d(r), r).toEqual({ statut: 416, motif: 'hors-taille' });
  });
  it('fichier vide : aucune plage n’est satisfaisable, mais sans plage on sert 200 vide', () => {
    expect(d('bytes=0-', { taille: 0 })).toEqual({ statut: 416, motif: 'hors-taille' });
    expect(d('bytes=-10', { taille: 0 })).toEqual({ statut: 416, motif: 'hors-taille' });
    expect(d(null, { taille: 0 })).toEqual({ statut: 200, debut: 0, fin: -1, longueur: 0, motif: 'sans-plage' });
  });
  it('taille de ressource absurde : erreur de programmation, pas une réponse', () => {
    expect(() => deciderPlage({ taille: -1, range: null })).toThrow(/taille de ressource invalide/);
    expect(() => deciderPlage({ taille: 1.5, range: null })).toThrow(/taille de ressource invalide/);
  });
});

describe('If-Range · jamais un morceau d’une autre version', () => {
  const etag = '"abc"';
  it('même ETag fort ⇒ la plage est servie', () => {
    expect(d('bytes=0-9', { ifRange: '"abc"', etag })).toEqual({ statut: 206, debut: 0, fin: 9, longueur: 10 });
  });
  it('ETag différent, ETag faible, date, ou ressource sans ETag ⇒ 200 entier', () => {
    for (const ifRange of ['"zzz"', 'W/"abc"', 'Tue, 01 Oct 2026 10:00:00 GMT']) {
      expect(d('bytes=0-9', { ifRange, etag }), ifRange).toMatchObject({ statut: 200, motif: 'if-range-different', longueur: 1000 });
    }
    expect(d('bytes=0-9', { ifRange: '"abc"', etag: null })).toMatchObject({ statut: 200, motif: 'if-range-different' });
  });
  it('If-Range vide : sans effet', () => {
    expect(d('bytes=0-9', { ifRange: '', etag })).toMatchObject({ statut: 206 });
  });
});

describe('en-têtes et octets servis', () => {
  const octets = Uint8Array.from({ length: 256 }, (_, i) => i);

  it('200 : accept-ranges et longueur totale, pas de content-range', () => {
    const r = servirPlage(octets, { range: null });
    expect(r.statut).toBe(200);
    expect(r.entetes).toEqual({ 'accept-ranges': 'bytes', 'content-length': '256' });
    expect([...r.corps!]).toEqual([...octets]);
  });

  it('206 : content-range exact, longueur du morceau, octets exacts', () => {
    const r = servirPlage(octets, { range: 'bytes=10-19' });
    expect(r.statut).toBe(206);
    expect(r.entetes).toEqual({ 'accept-ranges': 'bytes', 'content-length': '10', 'content-range': 'bytes 10-19/256' });
    expect([...r.corps!]).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]);
  });

  it('206 suffixe : les derniers octets', () => {
    const r = servirPlage(octets, { range: 'bytes=-3' });
    expect(r.entetes['content-range']).toBe('bytes 253-255/256');
    expect([...r.corps!]).toEqual([253, 254, 255]);
  });

  it('416 : content-range « bytes */taille », aucun corps', () => {
    const r = servirPlage(octets, { range: 'bytes=256-' });
    expect(r.statut).toBe(416);
    expect(r.entetes).toEqual({ 'accept-ranges': 'bytes', 'content-range': 'bytes */256', 'content-length': '0' });
    expect(r.corps).toBeNull();
  });

  it('entetesPlage et corpsPlage s’accordent : la longueur annoncée est celle envoyée', () => {
    for (const range of ['bytes=0-0', 'bytes=0-', 'bytes=100-200', 'bytes=-50', 'bytes=200-9999', null]) {
      const p = deciderPlage({ taille: octets.length, range });
      expect(Number(entetesPlage(p, octets.length)['content-length']), String(range)).toBe(corpsPlage(octets, p)!.length);
    }
  });
});
