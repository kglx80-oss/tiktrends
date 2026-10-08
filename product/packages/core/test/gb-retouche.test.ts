import { describe, it, expect } from 'vitest';
import { composerParMasque, masqueVide, type PixelsBruts } from '../src/studios/rendu/masque';
import { composerRetoucheStricte, masqueDepuisGris, masqueDepuisRvba, boiteDuMasque } from '../src/studios/rendu/retouche';
import {
  parametresRetoucheDuDevis, lireParametresRetouche, estParametresRetouche, lireEntetePng, controlerFichierMasque, requeteFalRetouche,
  promptRetouche, SCHEMA_PARAMETRES_RETOUCHE, LIMITE_MASQUE_NON_TRANSMIS, type MediaRetouche,
} from '../src/studios/fournisseurs/retouche';
import { qualiteAFinalisation, controleComposantsAFinalisation } from '../src/studios/fournisseurs/qualite';
import { parametresImageDuDevis } from '../src/studios/fournisseurs/fal-image';

/**
 * G-B · règles pures de la retouche masquée et du contrôle qualité posé par
 * le worker. Les zones attendues sont recalculées ICI par force brute
 * (distance euclidienne au support), jamais par le code du noyau.
 */

function alea(graine: number) {
  let s = graine >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
function image(l: number, h: number, graine: number): PixelsBruts {
  const r = alea(graine);
  const d = new Uint8Array(l * h * 4);
  for (let i = 0; i < d.length; i++) d[i] = Math.floor(r() * 256);
  return { largeur: l, hauteur: h, canaux: 4, donnees: d };
}
const uni = (l: number, h: number, c: [number, number, number, number]): PixelsBruts => {
  const d = new Uint8Array(l * h * 4);
  for (let p = 0; p < l * h; p++) d.set(c, p * 4);
  return { largeur: l, hauteur: h, canaux: 4, donnees: d };
};
function masqueRect(l: number, h: number, x0: number, y0: number, x1: number, y1: number) {
  const m = masqueVide(l, h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m.donnees[y * l + x] = 255;
  return m;
}
/** Pixels changés hors (support + fondu), comptés par force brute. */
function horsZoneForceBrute(o: PixelsBruts, r: PixelsBruts, support: Uint8Array, fondu: number): number {
  const pts: Array<[number, number]> = [];
  for (let p = 0; p < support.length; p++) if (support[p]) pts.push([p % o.largeur, Math.floor(p / o.largeur)]);
  let n = 0;
  for (let p = 0; p < support.length; p++) {
    const x = p % o.largeur, y = Math.floor(p / o.largeur);
    let d2 = Infinity;
    for (const [sx, sy] of pts) d2 = Math.min(d2, (sx - x) ** 2 + (sy - y) ** 2);
    if (d2 <= fondu * fondu) continue;
    if ([0, 1, 2, 3].some((k) => o.donnees[p * 4 + k] !== r.donnees[p * 4 + k])) n++;
  }
  return n;
}

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SRC: MediaRetouche = { assetId: 'sta_11111111-1111-4111-8111-111111111111', assetVersion: 'sha256-aaaa', sha256: SHA_A, largeur: 96, hauteur: 64 };
const MSQ: MediaRetouche = { assetId: 'sta_22222222-2222-4222-8222-222222222222', assetVersion: 'sha256-bbbb', sha256: SHA_B, largeur: 96, hauteur: 64 };
const CONSIGNE = { generationInstruction: 'Une étoile dans la zone.', preserve: ['le fond'], expectedChanges: ['une étoile'] };
const params = (o: Partial<{ source: MediaRetouche; masque: MediaRetouche; fonduPx: number }> = {}) =>
  parametresRetoucheDuDevis({ consigne: CONSIGNE, source: o.source ?? SRC, masque: o.masque ?? MSQ, fonduPx: o.fonduPx ?? 2 });
const OPS = [{ operation: 'retouche:fond', profil: 'image_generation' as const }];
const MODELES = { generation: 'fal-ai/nano-banana-2', edition: 'fal-ai/nano-banana-2/edit' };
const URL_SOURCE = 'https://medias.test/studios/ws/source.png';
const sourceOk = { assetId: SRC.assetId, etat: 'autorise' as const, url: URL_SOURCE, sha256: SHA_A };
const masqueOk = { violations: [], boite: { x0: 10, y0: 8, x1: 40, y1: 56, pixels: 1440 } };

describe('composition stricte (règle commune au worker et au benchmark)', () => {
  it('une génération qui repeint TOUT : 0 pixel hors support + fondu (force brute), le support prend la génération', () => {
    for (const [fondu, graine] of [[0, 1], [3, 2], [7, 3]] as const) {
      const original = image(64, 48, graine);
      const generation = uni(64, 48, [255, 0, 255, 255]);
      const masque = masqueRect(64, 48, 20, 10, 36, 30);
      const r = composerRetoucheStricte({ original, generation, masque, featherPx: fondu });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(horsZoneForceBrute(original, r.resultat, masque.donnees, fondu), `fondu ${fondu}`).toBe(0);
      let support = 0;
      for (let p = 0; p < masque.donnees.length; p++) if (masque.donnees[p] && r.resultat.donnees[p * 4] === 255 && r.resultat.donnees[p * 4 + 1] === 0) support++;
      expect(support).toBe(16 * 20);
      expect(r.controle).toMatchObject({ pixelsHorsZone: 0, conforme: true });
    }
  });

  it('une composition fautive (alpha ignoré) est refusée avec le compte · rien à livrer', () => {
    const original = image(32, 32, 9);
    const masque = masqueRect(32, 32, 4, 4, 8, 8);
    const r = composerRetoucheStricte({ original, generation: uni(32, 32, [0, 0, 0, 255]), masque, featherPx: 0, composer: (o, g, a) => composerParMasque(o, g, a.map(() => 255)) });
    expect(r).toMatchObject({ ok: false, raison: expect.stringMatching(/^1008 pixel\(s\) modifié\(s\) hors de la zone autorisée/) });
  });

  it('dimensions : génération ou masque d’une autre taille que la source ⇒ refus, rien n’est composé', () => {
    const original = image(32, 32, 4);
    expect(composerRetoucheStricte({ original, generation: image(31, 32, 5), masque: masqueRect(32, 32, 0, 0, 4, 4), featherPx: 0 })).toMatchObject({ ok: false, raison: expect.stringContaining('dimensions différentes de la source') });
    expect(composerRetoucheStricte({ original, generation: image(32, 32, 5), masque: masqueRect(16, 16, 0, 0, 4, 4), featherPx: 0 })).toMatchObject({ ok: false, raison: expect.stringContaining('doit avoir les dimensions de la source') });
  });

  it('masques : conversion RVBA du jeu (rouge > 127), boîte du support, masque vide ⇒ null', () => {
    const rvba = new Uint8Array(4 * 3 * 4);
    rvba.set([200, 0, 0, 255], (1 * 4 + 2) * 4);
    rvba.set([127, 255, 255, 255], 0);
    const m = masqueDepuisRvba(4, 3, rvba);
    expect([...m.donnees]).toEqual([0, 0, 0, 0, 0, 0, 255, 0, 0, 0, 0, 0]);
    expect(boiteDuMasque(m)).toEqual({ x0: 2, y0: 1, x1: 3, y1: 2, pixels: 1 });
    expect(boiteDuMasque(masqueDepuisGris(4, 3, new Uint8Array(12)))).toBeNull();
  });
});

describe('paramètres d’une retouche (`studio_retouche/1`)', () => {
  it('relus tels qu’écrits ; reconnus par leur schéma seulement', () => {
    const p = params();
    expect(lireParametresRetouche(p)).toEqual({ ok: true, parametres: p });
    expect(p.schema).toBe(SCHEMA_PARAMETRES_RETOUCHE);
    expect(p.masque.format).toBe('png_gris8');
    expect(estParametresRetouche(p)).toBe(true);
    expect(estParametresRetouche(parametresImageDuDevis({ consigne: { generationInstruction: 'x', negativeConstraints: [], protectedComponents: [], needsDeterministicOverlay: false, referenceBindings: [] }, references: [], largeur: 1080, hauteur: 1080 }))).toBe(false);
    expect(estParametresRetouche({})).toBe(false);
  });

  it('refus : masque d’une autre résolution, autre format, média hors studio, masque = source, fondu hors borne, gabarit', () => {
    const v = (x: unknown) => { const r = lireParametresRetouche(x); return r.ok ? [] : r.violations; };
    expect(v(params({ masque: { ...MSQ, largeur: 48, hauteur: 32 } }))).toEqual(['/parametres/masque : résolution 48×32 différente de la source 96×64']);
    expect(v({ ...params(), masque: { ...params().masque, format: 'png_rvba' } })).toEqual(['/parametres/masque/format : png_gris8 attendu (PNG gris 8 bits)']);
    expect(v(params({ source: { ...SRC, assetId: 'pph_0123456789abcdef01234567' } }))).toEqual(['/parametres/source/assetId : média studio sta_<uuid> attendu']);
    expect(v(params({ masque: { ...SRC } }))).toEqual(['/parametres/masque/assetId : le masque doit être un autre média que la source']);
    expect(v(params({ fonduPx: 513 }))).toEqual(['/parametres/fonduPx : entier de 0 à 512']);
    expect(v({ ...params(), consigne: { ...CONSIGNE, generationInstruction: 'Une {{étoile}}' } })).toEqual(['/parametres/consigne : emplacement de gabarit non résolu']);
    expect(v({ schema: 'studio_image/1' })[0]).toContain('studio_retouche/1 attendu');
  });
});

describe('fichier du masque · format canonique PNG gris 8 bits', () => {
  const ihdr = (l: number, h: number, profondeur: number, type: number) => {
    const o = new Uint8Array(33);
    o.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
    new DataView(o.buffer).setUint32(16, l);
    new DataView(o.buffer).setUint32(20, h);
    o[24] = profondeur; o[25] = type;
    return o;
  };
  const attendu = { sha256: SHA_B, largeur: 96, hauteur: 64 };
  const source = { largeur: 96, hauteur: 64 };
  it('en-tête relu dans les octets ; conforme seulement en gris 8 bits, à la résolution de la source, à l’empreinte du devis', () => {
    expect(lireEntetePng(ihdr(96, 64, 8, 0))).toEqual({ largeur: 96, hauteur: 64, profondeur: 8, typeCouleur: 0 });
    expect(lireEntetePng(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(controlerFichierMasque({ entete: lireEntetePng(ihdr(96, 64, 8, 0)), sha256: SHA_B, attendu, source })).toEqual([]);
    expect(controlerFichierMasque({ entete: lireEntetePng(ihdr(96, 64, 8, 2)), sha256: SHA_B, attendu, source })).toEqual(['masque PNG gris 8 bits attendu (profondeur 8, type de couleur 2)']);
    expect(controlerFichierMasque({ entete: lireEntetePng(ihdr(96, 64, 16, 0)), sha256: SHA_B, attendu, source })).toEqual(['masque PNG gris 8 bits attendu (profondeur 16, type de couleur 0)']);
    expect(controlerFichierMasque({ entete: lireEntetePng(ihdr(96, 64, 8, 4)), sha256: SHA_B, attendu, source })).toEqual(['masque PNG gris 8 bits attendu (profondeur 8, type de couleur 4)']);
    expect(controlerFichierMasque({ entete: lireEntetePng(ihdr(48, 32, 8, 0)), sha256: SHA_B, attendu, source })).toEqual([
      'le masque (48×32) doit avoir la résolution de la source (96×64)', 'le masque (48×32) n’a pas la résolution vue au devis (96×64)',
    ]);
    expect(controlerFichierMasque({ entete: lireEntetePng(ihdr(96, 64, 8, 0)), sha256: SHA_A, attendu, source })).toEqual(['masque modifié depuis le devis']);
    expect(controlerFichierMasque({ entete: null, sha256: SHA_B, attendu, source })).toEqual(['le masque n’est pas un PNG lisible']);
  });
});

describe('requête fal d’une retouche', () => {
  const req = (o: Partial<Parameters<typeof requeteFalRetouche>[0]> = {}) => requeteFalRetouche({
    operations: OPS, parametres: params(), source: sourceOk, dimensionsSource: { largeur: 96, hauteur: 64 }, masque: masqueOk, modeles: MODELES, ...o,
  });

  it('nominal : modèle d’édition existant, la SOURCE en image de départ, une image, la zone décrite ; le masque ne part pas', () => {
    const r = req();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.modele).toBe('fal-ai/nano-banana-2/edit');
    expect(r.corps).toEqual({ prompt: promptRetouche(CONSIGNE, masqueOk.boite, { largeur: 96, hauteur: 64 }), num_images: 1, aspect_ratio: '16:9', image_urls: [URL_SOURCE] });
    expect(r.corps.prompt).toContain('de 10,4 % à 41,7 % de la largeur et de 12,5 % à 87,5 % de la hauteur');
    expect(r.operations).toEqual(['retouche:fond']);
    expect(JSON.stringify(r.expurge)).not.toContain(URL_SOURCE);
    expect(r.expurge).toMatchObject({ image_urls: [{ assetId: SRC.assetId, sha256: SHA_A }], masque: { assetId: MSQ.assetId, nonTransmis: true }, fonduPx: 2 });
    expect(r.limites).toEqual([LIMITE_MASQUE_NON_TRANSMIS, 'sortie ramenée explicitement à la résolution de la source avant composition', 'format 96×64 servi au ratio 16:9']);
  });

  it('bloquée avant tout appel : masque absent, refusé, vide ; source absente, modifiée, non transmissible, d’une autre taille ; deux images', () => {
    const code = (r: ReturnType<typeof req>) => (r.ok ? 'ok' : `${r.code} · ${r.motif}`);
    expect(code(req({ masque: null }))).toMatch(/^MISSING_REFERENCE · masque sta_2222.* absent du catalogue/);
    expect(code(req({ masque: { violations: ['masque PNG gris 8 bits attendu'], boite: null } }))).toBe('INVALID_SCHEMA · masque refusé · masque PNG gris 8 bits attendu');
    expect(code(req({ masque: { violations: [], boite: null } }))).toBe('INVALID_SCHEMA · masque vide · aucune zone à retoucher');
    expect(code(req({ source: null }))).toMatch(/^MISSING_REFERENCE · source .* non résolue/);
    expect(code(req({ source: { assetId: SRC.assetId, etat: 'absent', motif: 'retirée' } }))).toMatch(/^MISSING_REFERENCE · source .* : retirée/);
    expect(code(req({ source: { ...sourceOk, sha256: SHA_B } }))).toMatch(/fichier modifié depuis le devis/);
    expect(code(req({ source: { ...sourceOk, url: 'http://medias.test/x.png' } }))).toMatch(/adresse non transmissible/);
    expect(code(req({ dimensionsSource: { largeur: 95, hauteur: 64 } }))).toMatch(/^INVALID_SCHEMA · source .* résolution 95×64 différente du devis/);
    expect(code(req({ dimensionsSource: null }))).toMatch(/résolution illisible/);
    expect(code(req({ operations: [...OPS, { operation: 'retouche:autre', profil: 'image_generation' }] }))).toMatch(/^UNSUPPORTED_CAPABILITY · une retouche rend exactement une image/);
    expect(code(req({ operations: [{ operation: 'clip:s1', profil: 'animation' }] }))).toMatch(/^UNSUPPORTED_CAPABILITY/);
    expect(code(req({ parametres: {} }))).toMatch(/^INVALID_SCHEMA · \/parametres : la retouche n’est pas dans l’instantané/);
  });
});

describe('contrôle qualité posé par le worker à la finalisation', () => {
  it('concerné : l’image du studio Image et toute retouche ; pas une autre image clé', () => {
    expect(controleComposantsAFinalisation({ operations: [{ operation: 'keyframe:s_image' }], parametres: {} })).toBe(true);
    expect(controleComposantsAFinalisation({ operations: [{ operation: 'retouche:fond' }], parametres: params() })).toBe(true);
    expect(controleComposantsAFinalisation({ operations: [{ operation: 'keyframe:s1' }], parametres: {} })).toBe(false);
  });

  it('sans contrôle visuel : requires_review, jamais passed, avec ou sans composants requis', () => {
    for (const requis of [[], ['lunettes'], ['lunettes', 'bandeau']]) {
      const q = qualiteAFinalisation({ concerne: true, requis, constats: [null] });
      expect(q.statut, JSON.stringify(requis)).toBe('requires_review');
      expect(q.verdict?.nonVerifies).toEqual(requis);
    }
  });

  it('non concerné : la règle L3 (constat négatif ⇒ requires_review, sinon pending)', () => {
    expect(qualiteAFinalisation({ concerne: false, requis: ['x'], constats: [{ produitConforme: false }] }).statut).toBe('requires_review');
    expect(qualiteAFinalisation({ concerne: false, requis: ['x'], constats: [null] })).toMatchObject({ statut: 'pending', verdict: null });
  });
});
