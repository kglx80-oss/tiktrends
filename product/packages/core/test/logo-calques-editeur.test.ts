import { describe, expect, it } from 'vitest';
import {
  RAISONS_LOGO_CHARTE, annonceLogosEditeur, bilanLogosCharte, cheminIdentiteMarque, logosPosesParCalques, rappelLogosExport,
  type CalqueLu, type LogoDuProjet, type VerificationEmpreinte,
} from '../src';

/**
 * Éditeur d'image · ce que disent les calques logo d'un logo de la charte
 * remplacé, disparu ou non vérifiable · on lit le RÉSULTAT de la règle, à
 * partir du MÊME bilan que la fiche et les Studios (`bilanLogosCharte`).
 */
const MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
const U1 = 'https://cdn.exemple.test/bucket/assets/ws/1-ab-logo.png';
const U2 = 'https://cdn.exemple.test/bucket/assets/ws/2-cd-logo.png';
const L1 = 'logo_aaaaaaaaaaaaaaaaaaaaaaaa';
const L2 = 'logo_bbbbbbbbbbbbbbbbbbbbbbbb';
const LOGOS: LogoDuProjet[] = [{ assetId: L1, url: U1, libelle: 'Logo principal' }, { assetId: L2, url: U2, libelle: 'Logo · variante 1' }];
const REMPLACE = { ok: false, raison: 'remplace' } as const;
const ABSENT = { ok: false, raison: 'absent' } as const;
const INJOIGNABLE = { ok: false, raison: 'illisible' } as const;
const CONFORME = { ok: true, empreinte: MD5 } as const;
const bilan = (v: Record<string, VerificationEmpreinte | null>, empreintes: Record<string, string> = { [U1]: MD5, [U2]: MD5 }) =>
  bilanLogosCharte({ logos: [U1, U2], defaut: null, empreintes, verifications: new Map(Object.entries(v)) });
const calque = (id: string, assetId: string | undefined, o: Partial<CalqueLu> = {}): CalqueLu => ({ id, name: o.name ?? id, kind: o.kind ?? 'logo', visible: o.visible ?? true, assetId });
const CALQUES = [calque('a', L1, { name: 'Logo' }), calque('b', L1, { name: 'Logo masqué', visible: false }), calque('c', L2, { name: 'Variante' }), calque('t', undefined, { kind: 'text' })];
const annonce = (v: Record<string, VerificationEmpreinte | null>, peutGerer = false, calques = CALQUES) =>
  annonceLogosEditeur({ calques, logos: LOGOS, bilan: bilan(v), brandId: 'b 1', peutGerer });

describe('logosPosesParCalques · les logos de la charte posés par des calques', () => {
  it('image ou logo à identifiant `logo_…`, chacun une fois · ni texte, ni média du projet, ni photo du catalogue', () => {
    expect(logosPosesParCalques([
      ...CALQUES, calque('i', L2, { kind: 'image' }), calque('m', '6b1c6f0e-6f3e-4f63-9a3d-1f1b8d1e2a11', { kind: 'image' }), calque('p', 'pph_cccccccccccccccccccccccc', { kind: 'image' }),
      calque('s', L1, { kind: 'shape' }),
    ])).toEqual([L1, L2]);
    expect(logosPosesParCalques([])).toEqual([]);
  });
});

describe('annonceLogosEditeur · le calque dit pourquoi son logo n’est pas affiché', () => {
  it('REMPLACÉ · « Logo à réimporter » sur ce logo seulement, raison de la fiche, sans lien pour qui ne gère pas', () => {
    const a = annonce({ [U1]: REMPLACE, [U2]: CONFORME });
    expect(a?.logos).toEqual({ [L1]: { etat: 'a-reimporter', libelle: 'Logo à réimporter', raison: RAISONS_LOGO_CHARTE.remplace, lien: null, aide: 'Un administrateur de l’espace peut le réimporter dans l’Identité de la marque.' } });
    expect(a?.rappelExport, 'le rappel d’export ne compte que les calques visibles').toEqual({
      etat: 'a-reimporter', calques: ['a'], lien: null,
      message: 'Logo à réimporter · l’export refusera le calque « Logo » tant que son logo n’est pas réimporté. Un administrateur de l’espace peut le réimporter dans l’Identité de la marque.',
    });
  });

  it('REMPLACÉ, admin · le lien vers l’Identité de la marque, sur le calque et près de l’export', () => {
    const a = annonce({ [U1]: REMPLACE, [U2]: CONFORME }, true);
    expect(a?.logos[L1]).toMatchObject({ etat: 'a-reimporter', lien: cheminIdentiteMarque('b 1'), aide: 'Réimporte-le dans l’Identité de la marque.' });
    expect(a?.rappelExport).toEqual({ etat: 'a-reimporter', calques: ['a'], lien: '/brands/b%201/identite', message: 'Logo à réimporter · l’export refusera le calque « Logo » tant que son logo n’est pas réimporté.' });
  });

  it('DISPARU · « à réimporter » avec la raison de l’absence', () => {
    expect(annonce({ [U1]: ABSENT, [U2]: CONFORME })?.logos[L1]).toMatchObject({ etat: 'a-reimporter', raison: RAISONS_LOGO_CHARTE.absent });
  });

  it('STOCKAGE INJOIGNABLE (ou rien n’a pu partir) · « non vérifiable », JAMAIS « à réimporter », jamais de lien même pour un admin', () => {
    for (const v of [INJOIGNABLE, null]) {
      const a = annonce({ [U1]: v, [U2]: v }, true);
      expect(a?.logos).toEqual({
        [L1]: { etat: 'non-verifiable', libelle: 'Logo non vérifiable', raison: RAISONS_LOGO_CHARTE.illisible, lien: null, aide: null },
        [L2]: { etat: 'non-verifiable', libelle: 'Logo non vérifiable', raison: RAISONS_LOGO_CHARTE.illisible, lien: null, aide: null },
      });
      expect(a?.rappelExport).toEqual({
        etat: 'non-verifiable', calques: ['a', 'c'], lien: null,
        message: 'Logos non vérifiables pour l’instant (stockage injoignable) · les calques « Logo », « Variante » ne sont pas affichés, l’export les revérifiera · réessaie dans un instant.',
      });
      expect(JSON.stringify(a)).not.toContain('réimport');
    }
  });

  it('les deux · le rappel d’export dit d’abord ce qui sera refusé', () => {
    const a = annonce({ [U1]: INJOIGNABLE, [U2]: REMPLACE });
    expect(a?.logos[L1]?.etat).toBe('non-verifiable');
    expect(a?.logos[L2]?.etat).toBe('a-reimporter');
    expect(a?.rappelExport).toMatchObject({ etat: 'a-reimporter', calques: ['c'] });
  });

  it('plusieurs calques visibles à réimporter · le pluriel', () => {
    const a = annonce({ [U1]: REMPLACE, [U2]: ABSENT }, false);
    expect(a?.rappelExport?.message).toBe('Logos à réimporter · l’export refusera les calques « Logo », « Variante » tant que leurs logos ne sont pas réimportés. Un administrateur de l’espace peut les réimporter dans l’Identité de la marque.');
  });

  it('seul un calque MASQUÉ pose le logo · le signal reste (calque), aucun rappel d’export (le préflight ne le relit pas)', () => {
    const a = annonce({ [U1]: REMPLACE }, false, [calque('b', L1, { visible: false })]);
    expect(a?.logos[L1]?.etat).toBe('a-reimporter');
    expect(a?.rappelExport).toBeNull();
  });

  it('intact, sans empreinte, ou logo remplacé mais posé par aucun calque · rien à dire', () => {
    expect(annonce({ [U1]: CONFORME, [U2]: CONFORME })).toBeNull();
    expect(annonceLogosEditeur({ calques: CALQUES, logos: LOGOS, bilan: bilan({}, {}), brandId: 'b', peutGerer: true })).toBeNull();
    expect(annonce({ [U1]: CONFORME, [U2]: REMPLACE }, true, [calque('a', L1)])).toBeNull();
    expect(annonce({ [U1]: REMPLACE }, true, [calque('t', undefined, { kind: 'text' })])).toBeNull();
  });
});

describe('rappelLogosExport · relu sur le document COURANT', () => {
  const signaux = annonce({ [U1]: REMPLACE, [U2]: INJOIGNABLE }, true)!.logos;
  it('le calque à réimporter masqué puis retiré · le rappel passe au non vérifiable, puis à rien', () => {
    expect(rappelLogosExport(CALQUES, signaux)).toMatchObject({ etat: 'a-reimporter', calques: ['a'], lien: '/brands/b%201/identite' });
    const masque = CALQUES.map((c) => (c.id === 'a' ? { ...c, visible: false } : c));
    expect(rappelLogosExport(masque, signaux)).toMatchObject({ etat: 'non-verifiable', calques: ['c'], lien: null });
    expect(rappelLogosExport(masque.filter((c) => c.id !== 'c'), signaux)).toBeNull();
  });
});
