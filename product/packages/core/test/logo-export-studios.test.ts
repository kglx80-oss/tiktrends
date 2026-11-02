import { describe, expect, it } from 'vitest';
import {
  codeRefusPreflight, decisionLogoServi, etatMediaLogoRefuse, messageRefusPreflight, preflightExport, verificationDeLecture,
  RAISONS_LOGO_EXPORT, type DisponiblesExport, type DocumentStudio,
} from '../src';

/**
 * L'export d'une version juge un logo de la charte par son EMPREINTE, comme
 * la route média et les générations · on lit le RÉSULTAT des règles :
 *  · `verificationDeLecture` · une lecture conditionnelle (`If-Match`) vue
 *    comme une vérification ;
 *  · `etatMediaLogoRefuse` · la décision du service dite pour le préflight ;
 *  · `preflightExport` · le calque logo refusé, nommé, avec sa raison, jamais
 *    « introuvable » ; un logo servi passe comme avant.
 */
const MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
const ID = 'logo_0123456789abcdef01234567';
const doc: DocumentStudio = {
  width: 200, height: 200, colorSpace: 'sRGB', fonts: {},
  layers: { logo: { id: 'logo', kind: 'logo', name: 'Logo', visible: true, locked: false, x: 10, y: 10, width: 80, height: 40, rotationDeg: 0, opacity: 1, z: 1, assetId: ID } },
} as DocumentStudio;
const dispo = (m: DisponiblesExport['medias'][string]): DisponiblesExport => ({ polices: [], medias: { [ID]: m } });

describe('verificationDeLecture · la lecture conditionnelle vue comme une vérification', () => {
  it('rien n’a pu partir · null (le noyau refuse « non vérifiable »)', () => {
    expect(verificationDeLecture(null)).toBeNull();
    expect(decisionLogoServi({ empreinte: MD5, verification: verificationDeLecture(null) })).toMatchObject({ servir: false, cause: 'illisible' });
  });
  it('lue · l’ETag rendu est relu (un stockage qui ignorerait If-Match est jugé)', () => {
    expect(verificationDeLecture({ ok: true, empreinte: MD5 })).toEqual({ ok: true, empreinte: MD5 });
    expect(decisionLogoServi({ empreinte: MD5, verification: verificationDeLecture({ ok: true, empreinte: 'f'.repeat(32) }) })).toMatchObject({ servir: false, cause: 'remplace' });
  });
  it('412, 404, hors espace gardés · trop lourd ou autre ⇒ illisible, jamais « remplacé »', () => {
    expect(verificationDeLecture({ ok: false, raison: 'remplace' })).toEqual({ ok: false, raison: 'remplace' });
    expect(verificationDeLecture({ ok: false, raison: 'absent' })).toEqual({ ok: false, raison: 'absent' });
    expect(verificationDeLecture({ ok: false, raison: 'hors_espace' })).toEqual({ ok: false, raison: 'hors_espace' });
    expect(verificationDeLecture({ ok: false, raison: 'trop_lourd' })).toEqual({ ok: false, raison: 'illisible' });
  });
});

describe('etatMediaLogoRefuse · la décision du service, pour le préflight', () => {
  it('servi (intact, ou sans empreinte) · null, le média se relit comme avant', () => {
    expect(etatMediaLogoRefuse(decisionLogoServi({ empreinte: MD5, verification: { ok: true, empreinte: MD5 } }))).toBeNull();
    expect(etatMediaLogoRefuse(decisionLogoServi({ empreinte: null }))).toBeNull();
  });
  it('remplacé ou disparu · à réimporter ; injoignable · non vérifiable', () => {
    expect(etatMediaLogoRefuse(decisionLogoServi({ empreinte: MD5, verification: { ok: false, raison: 'remplace' } }))).toEqual({ etat: 'logo_a_reimporter', cause: 'remplace' });
    expect(etatMediaLogoRefuse(decisionLogoServi({ empreinte: MD5, verification: { ok: false, raison: 'absent' } }))).toEqual({ etat: 'logo_a_reimporter', cause: 'absent' });
    expect(etatMediaLogoRefuse(decisionLogoServi({ empreinte: MD5, verification: { ok: false, raison: 'illisible' } }))).toEqual({ etat: 'logo_non_verifiable' });
  });
});

describe('preflightExport · un logo refusé par son empreinte n’est pas embarqué, et l’export le dit', () => {
  it('remplacé · refus ciblé (calque logo, média), phrase « Logo à réimporter », code MISSING_REFERENCE, aucun fichier', () => {
    const pf = preflightExport(doc, dispo({ etat: 'logo_a_reimporter', cause: 'remplace' }));
    expect(pf.ok).toBe(false);
    if (pf.ok) return;
    expect(pf.violations.map((v) => [v.cause, v.cible.calqueId, v.cible.kind, v.cible.assetId])).toEqual([['logo_a_reimporter', 'logo', 'logo', ID]]);
    expect(pf.violations[0]!.message).toBe(`Calque logo « Logo » · ${RAISONS_LOGO_EXPORT.remplace}`);
    expect(pf.violations[0]!.message).toContain('Logo à réimporter · son fichier a été remplacé dans le stockage depuis l’import. Il n’est pas embarqué dans l’export');
    expect(codeRefusPreflight(pf.violations)).toBe('MISSING_REFERENCE');
    expect(messageRefusPreflight(pf.violations)).toMatch(/^Export refusé · Calque logo « Logo » · Logo à réimporter .* Aucun fichier n’a été produit\.$/);
  });
  it('disparu · à réimporter aussi, avec sa raison ; non vérifiable · ni « à réimporter » ni « introuvable »', () => {
    const absent = preflightExport(doc, dispo({ etat: 'logo_a_reimporter', cause: 'absent' }));
    expect(!absent.ok && absent.violations[0]!.message).toBe(`Calque logo « Logo » · ${RAISONS_LOGO_EXPORT.absent}`);
    const nv = preflightExport(doc, dispo({ etat: 'logo_non_verifiable' }));
    expect(!nv.ok && nv.violations.map((v) => [v.cause, v.message])).toEqual([['logo_non_verifiable', `Calque logo « Logo » · ${RAISONS_LOGO_EXPORT.non_verifiable}`]]);
    expect(!nv.ok && nv.violations[0]!.message).not.toContain('réimporter');
    expect(!nv.ok && codeRefusPreflight(nv.violations)).toBe('MISSING_REFERENCE');
  });
  it('servi · le logo passe comme avant (un média compté)', () => {
    expect(preflightExport(doc, dispo({ etat: 'ok', largeur: 240, hauteur: 120 }))).toMatchObject({ ok: true, medias: 1 });
  });
});
