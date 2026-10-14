import { describe, expect, it } from 'vitest';
import {
  verdictFichierPhoto, verdictDataUriPhoto, decisionAjoutPhoto, colonnesApresImport, etapesCompression, raisonImportPhoto, affichageImportPhoto, signatureConforme,
  DATA_URI_PHOTO_MAX, PHOTOS_PRODUIT_MAX, MESSAGES_REFUS_PHOTO, ACCEPT_PHOTO_IMPORT,
  type EtatImportPhoto, type MotifEchecImport,
} from '../src';

/**
 * UX V2 · lot 3a · photo produit importée dans le projet · règles PURES.
 * On lit des VERDICTS sur de vrais octets (signatures JPEG, PNG, WebP), pas
 * la présence d'un appel.
 */

const uri = (mime: string, octets: number[]) => `data:${mime};base64,${Buffer.from(octets).toString('base64')}`;
const corps = (n: number) => Array.from({ length: n }, (_, i) => (i * 13) % 256);
const JPEG = uri('image/jpeg', [0xff, 0xd8, 0xff, 0xe0, ...corps(60)]);
const PNG = uri('image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...corps(60)]);
const WEBP = uri('image/webp', [...Buffer.from('RIFF'), 1, 2, 3, 4, ...Buffer.from('WEBP'), ...corps(60)]);

describe('le fichier choisi', () => {
  it('JPG, PNG et WebP passent ; HEIC, GIF, PDF et type vide sont refusés avec le motif « format »', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/webp', 'IMAGE/JPEG']) expect(verdictFichierPhoto({ type: t, taille: 10 }).ok, t).toBe(true);
    for (const t of ['image/heic', 'image/gif', 'application/pdf', '', 'image/jpg']) {
      expect(verdictFichierPhoto({ type: t, taille: 10 }), t).toEqual({ ok: false, motif: 'format', message: MESSAGES_REFUS_PHOTO.format });
    }
    expect(ACCEPT_PHOTO_IMPORT).toBe('image/jpeg,image/png,image/webp');
  });

  it('un fichier vide est refusé', () => {
    expect(verdictFichierPhoto({ type: 'image/png', taille: 0 })).toMatchObject({ ok: false, motif: 'vide' });
  });
});

describe('la data URI reçue · même règle au navigateur et au serveur', () => {
  it('les trois formats passent quand les octets portent leur signature', () => {
    expect(verdictDataUriPhoto(JPEG)).toEqual({ ok: true, format: 'image/jpeg' });
    expect(verdictDataUriPhoto(PNG)).toEqual({ ok: true, format: 'image/png' });
    expect(verdictDataUriPhoto(WEBP)).toEqual({ ok: true, format: 'image/webp' });
  });

  it('un PNG déclaré JPEG, un texte renommé en image : « illisible »', () => {
    expect(verdictDataUriPhoto(uri('image/jpeg', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...corps(20)]))).toMatchObject({ ok: false, motif: 'illisible' });
    expect(verdictDataUriPhoto(uri('image/png', [...Buffer.from('<html><script>alert(1)</script>')]))).toMatchObject({ ok: false, motif: 'illisible' });
    expect(verdictDataUriPhoto(uri('image/webp', [...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WAVE')]))).toMatchObject({ ok: false, motif: 'illisible' });
  });

  it('GIF, SVG, `jpg` non canonique : « format » ; adresse, base64 sale, non-chaîne : « illisible »', () => {
    expect(verdictDataUriPhoto(uri('image/gif', [...Buffer.from('GIF89a'), ...corps(10)]))).toMatchObject({ ok: false, motif: 'format' });
    expect(verdictDataUriPhoto(uri('image/svg+xml', [...Buffer.from('<svg/>')]))).toMatchObject({ ok: false, motif: 'format' });
    expect(verdictDataUriPhoto(JPEG.replace('image/jpeg', 'image/jpg'))).toMatchObject({ ok: false, motif: 'format' });
    expect(verdictDataUriPhoto('https://cdn.test/photo.jpg')).toMatchObject({ ok: false, motif: 'illisible' });
    expect(verdictDataUriPhoto(`${JPEG}*`)).toMatchObject({ ok: false, motif: 'illisible' });
    expect(verdictDataUriPhoto(42)).toMatchObject({ ok: false, motif: 'illisible' });
    expect(verdictDataUriPhoto('')).toMatchObject({ ok: false, motif: 'illisible' });
  });

  it('la borne · pile dessus passe, un caractère de plus est « trop lourd »', () => {
    const tete = 'data:image/jpeg;base64,';
    // Base64 de longueur multiple de 4, commençant par la signature JPEG.
    const sig = Buffer.from([0xff, 0xd8, 0xff]).toString('base64'); // « /9j/ »
    const n = Math.floor((DATA_URI_PHOTO_MAX - tete.length - sig.length) / 4) * 4;
    const pile = `${tete}${sig}${'A'.repeat(n)}`;
    expect(pile.length).toBeLessThanOrEqual(DATA_URI_PHOTO_MAX);
    expect(verdictDataUriPhoto(pile).ok).toBe(true);
    const trop = `${tete}${sig}${'A'.repeat(DATA_URI_PHOTO_MAX)}`;
    expect(verdictDataUriPhoto(trop)).toEqual({ ok: false, motif: 'trop_lourd', message: MESSAGES_REFUS_PHOTO.trop_lourd });
  });

  it('la borne mesurée tient sous 1 Mio (corps d’action Next) avec plus de 100 ko de marge', () => {
    expect(1024 * 1024 - DATA_URI_PHOTO_MAX).toBeGreaterThan(100_000);
    // Pire cas mesuré (bruit plein) : la 2e étape passe, la 1re non · l'échelle sert.
    expect(991_691).toBeGreaterThan(DATA_URI_PHOTO_MAX);
    expect(676_211).toBeLessThan(DATA_URI_PHOTO_MAX);
    // Une vraie photo passe dès la 1re étape (celle de l'ancien geste).
    expect(377_239).toBeLessThan(DATA_URI_PHOTO_MAX);
  });

  it('signatures · lues sur les octets, pas sur le nom', () => {
    expect(signatureConforme('image/jpeg', [0xff, 0xd8, 0xff])).toBe(true);
    expect(signatureConforme('image/jpeg', [0xff, 0xd8])).toBe(false);
    expect(signatureConforme('image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a])).toBe(false);
  });
});

describe('compression · une échelle, dans l’ordre', () => {
  it('JPEG : 1280 à 0,85 (l’ancien geste), puis 0,7, puis 1024', () => {
    expect(etapesCompression('image/jpeg')).toEqual([
      { cote: 1280, format: 'image/jpeg', qualite: 0.85 },
      { cote: 1280, format: 'image/jpeg', qualite: 0.7 },
      { cote: 1024, format: 'image/jpeg', qualite: 0.7 },
    ]);
  });
  it('PNG et WebP tentent d’abord le PNG (transparence d’un détourage), puis la même échelle JPEG', () => {
    for (const f of ['image/png', 'image/webp']) {
      const e = etapesCompression(f);
      expect(e[0]).toEqual({ cote: 1280, format: 'image/png', qualite: null });
      expect(e.slice(1)).toEqual(etapesCompression('image/jpeg'));
    }
  });
});

describe('ajout au catalogue du produit', () => {
  const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ assetId: `pph_${i}` }));
  it('même contenu déjà présent · réutilisé, jamais dupliqué (même au-delà de la borne)', () => {
    expect(decisionAjoutPhoto(photos(2), 'pph_1')).toEqual({ action: 'reutiliser' });
    expect(decisionAjoutPhoto(photos(PHOTOS_PRODUIT_MAX + 1), 'pph_3')).toEqual({ action: 'reutiliser' });
  });
  it('nouvelle photo · ajoutée jusqu’à la borne, refusée à la borne avec un message qui dit quoi faire', () => {
    expect(decisionAjoutPhoto([], 'pph_x')).toEqual({ action: 'ajouter' });
    expect(decisionAjoutPhoto(photos(PHOTOS_PRODUIT_MAX - 1), 'pph_x')).toEqual({ action: 'ajouter' });
    expect(decisionAjoutPhoto(photos(PHOTOS_PRODUIT_MAX), 'pph_x')).toEqual({ action: 'refus', motif: 'complet', message: MESSAGES_REFUS_PHOTO.complet });
    expect(MESSAGES_REFUS_PHOTO.complet).toContain('épingle l’une d’elles');
  });
});

describe('colonnes du produit après import · rien retiré, rien réordonné', () => {
  it('produit sans photo · la photo devient la principale', () => {
    expect(colonnesApresImport({ imageUrl: null, imageUrls: null }, JPEG)).toEqual({ imageUrl: JPEG, imageUrls: [JPEG] });
  });
  it('produit avec photo principale distante · elle reste principale, la nouvelle va en fin', () => {
    expect(colonnesApresImport({ imageUrl: 'https://cdn.test/a.jpg', imageUrls: null }, JPEG)).toEqual({ imageUrl: 'https://cdn.test/a.jpg', imageUrls: [JPEG] });
    expect(colonnesApresImport({ imageUrl: 'https://cdn.test/a.jpg', imageUrls: [PNG] }, JPEG)).toEqual({ imageUrl: 'https://cdn.test/a.jpg', imageUrls: [PNG, JPEG] });
  });
  it('principale absente mais galerie présente · la principale n’est pas inventée (aucun décalage de position)', () => {
    expect(colonnesApresImport({ imageUrl: null, imageUrls: [PNG] }, JPEG)).toEqual({ imageUrl: null, imageUrls: [PNG, JPEG] });
  });
});

describe('le geste et ses états', () => {
  it('raison d’un import bloqué · rôle, produit, en cours', () => {
    expect(raisonImportPhoto({ peutModifier: false, produitChoisi: true, enCours: false })).toBe('Ton rôle permet de consulter, pas d’importer.');
    expect(raisonImportPhoto({ peutModifier: true, produitChoisi: false, enCours: false })).toBe('Choisis d’abord un produit.');
    expect(raisonImportPhoto({ peutModifier: true, produitChoisi: true, enCours: true })).toBe('Import en cours · patiente.');
    expect(raisonImportPhoto({ peutModifier: true, produitChoisi: true, enCours: false })).toBeNull();
  });

  it('chaque échec dit quoi faire et offre au moins un geste de récupération', () => {
    const motifs: MotifEchecImport[] = ['format', 'vide', 'trop_lourd', 'illisible', 'complet', 'reseau', 'conflit', 'serveur'];
    for (const motif of motifs) {
      const a = affichageImportPhoto({ etape: 'echec', motif })!;
      expect(a.role, motif).toBe('alert');
      expect(a.recuperations.length, `échec « ${motif} » sans geste de récupération`).toBeGreaterThan(0);
      expect(a.texte, motif).not.toMatch(/—/);
    }
    expect(affichageImportPhoto({ etape: 'echec', motif: 'reseau' })!.recuperations).toEqual(['reessayer', 'choisir']);
    expect(affichageImportPhoto({ etape: 'echec', motif: 'conflit' })!.recuperations).toEqual(['recharger']);
    expect(affichageImportPhoto({ etape: 'echec', motif: 'serveur', message: 'Refus précis.' })!.texte).toBe('Refus précis.');
  });

  it('en cours et réussi · annoncés poliment (status), le fichier est nommé ; repos · rien', () => {
    const e: EtatImportPhoto = { etape: 'preparation', fichier: 'flacon.png' };
    expect(affichageImportPhoto(e)).toMatchObject({ role: 'status', ton: 'info', texte: 'Compression de la photo « flacon.png » dans ton navigateur…' });
    expect(affichageImportPhoto({ etape: 'envoi' })).toMatchObject({ role: 'status', titre: 'Import en cours' });
    expect(affichageImportPhoto({ etape: 'reussi', ajoutee: true })!.texte).toContain('rejoint le catalogue');
    expect(affichageImportPhoto({ etape: 'reussi', ajoutee: false })!.texte).toContain('sans doublon');
    expect(affichageImportPhoto({ etape: 'repos' })).toBeNull();
  });
});
