import { describe, expect, it } from 'vitest';
import {
  ANCIENNES_VALEURS_FORMAT, FORMATS_CREATIFS, IDS_FORMATS_CREATIFS, LECTURE_NON_CLASSE, VERSION_FORMATS_CREATIFS,
  compterFormats, criteresActifsFormats, ecrireCriteresFormats, enregistrementFormat, formatDepuisAncienneValeur,
  formatsPourMedia, grilleFormat, lireCriteresFormats, lireFormatCreatif, mediaAnnonce, sansFormatCreatif,
  validerChoixFormat, dateCourteFormat, type AnnonceFormat, type LectureFormat,
} from '../src/formats-creatifs';

/**
 * Lot 19C · formats créatifs v1 (qualification manuelle). On vérifie des
 * VALEURS · la liste, le mapping des 18 anciennes valeurs, la lecture sûre,
 * le filtre par média, le comptage réel et les critères d'URL.
 */

describe('la liste unique · 25 formats + autre', () => {
  it('26 entrées, ids uniques, autre en dernier, une définition et au moins un média chacune', () => {
    expect(FORMATS_CREATIFS).toHaveLength(26);
    expect(new Set(IDS_FORMATS_CREATIFS).size).toBe(26);
    expect(FORMATS_CREATIFS.at(-1)!.id).toBe('autre');
    for (const f of FORMATS_CREATIFS) {
      expect(f.definition.length, f.id).toBeGreaterThan(10);
      expect(f.medias.length, f.id).toBeGreaterThan(0);
      expect(f.libelle, f.id).not.toMatch(/—/);
    }
  });
});

describe('les 18 valeurs existantes · 17 reprises, ai_generated retirée', () => {
  const ANCIENNES = ['ugc_talking_head', 'pov', 'before_after', 'green_screen', 'listicle', 'storytime', 'demo', 'founder', 'testimonial', 'static_product', 'static_text', 'meme', 'comparison', 'unboxing', 'asmr', 'tutorial', 'street_interview', 'ai_generated'];
  it('chacune a sa correspondance', () => {
    expect(Object.keys(ANCIENNES_VALEURS_FORMAT).sort()).toEqual([...ANCIENNES].sort());
    const reprises = ANCIENNES.filter((v) => formatDepuisAncienneValeur(v) !== null);
    expect(reprises, '17 reprises').toHaveLength(17);
    expect(formatDepuisAncienneValeur('ai_generated'), 'ai_generated est un mode, pas un format').toBeNull();
    // Reprises une à une · aucune cible partagée.
    expect(new Set(reprises.map((v) => formatDepuisAncienneValeur(v))).size).toBe(17);
  });
  it('quelques correspondances lisibles', () => {
    expect(formatDepuisAncienneValeur('static_product')).toBe('packshot');
    expect(formatDepuisAncienneValeur('ugc_talking_head')).toBe('face_camera');
    expect(formatDepuisAncienneValeur('green_screen')).toBe('fond_incruste');
    expect(formatDepuisAncienneValeur('toString'), 'une clé héritée d’Object n’est pas une valeur').toBeNull();
  });
});

describe('lecture sûre de snapshot_json.formatCreatif', () => {
  it('forme valide → classée, avec version, date, auteur', () => {
    const l = lireFormatCreatif({ formatCreatif: { id: 'packshot', version: VERSION_FORMATS_CREATIFS, date: '2026-10-05T10:00:00.000Z', auteur: 'u1' } });
    expect(l).toEqual({ etat: 'classe', id: 'packshot', version: 1, versionAncienne: false, date: '2026-10-05T10:00:00.000Z', auteur: 'u1' });
  });
  it('valeur inconnue, illisible ou absente → non classée, sans lever', () => {
    const cas: unknown[] = [
      null, undefined, 42, 'texte', [], {},
      { formatCreatif: null }, { formatCreatif: 7 }, { formatCreatif: ['packshot'] }, { formatCreatif: {} },
      { formatCreatif: { id: 'inconnu_total' } }, { formatCreatif: { id: 'ai_generated' } }, { formatCreatif: { id: { x: 1 } } },
      { formatCreatif: 'constructor' }, { formatCreatif: { id: '__proto__' } },
    ];
    for (const c of cas) expect(lireFormatCreatif(c).etat, JSON.stringify(c) ?? String(c)).toBe('non_classe');
  });
  it('ancienne valeur et chaîne nue tolérées', () => {
    expect(lireFormatCreatif({ formatCreatif: 'static_text' }).id).toBe('texte_seul');
    expect(lireFormatCreatif({ formatCreatif: { id: 'testimonial' } }).id).toBe('avis_client');
  });
  it('incertain est un état à part, pas un format', () => {
    const l = lireFormatCreatif({ formatCreatif: { id: 'incertain' } });
    expect(l.etat).toBe('incertain');
    expect(l.id).toBeNull();
  });
  it('ancienne taxonomie en base · lisible ET signalée, jamais reclassée en silence (message 55 · e)', () => {
    // Reprise une à une · la valeur reste lisible, mais elle n'a pas été choisie
    // dans CETTE liste · à revoir.
    expect(lireFormatCreatif({ formatCreatif: 'static_text' }), 'ancienne valeur reclassée en silence').toMatchObject({ etat: 'classe', id: 'texte_seul', versionAncienne: true });
    expect(lireFormatCreatif({ formatCreatif: { id: 'testimonial' } })).toMatchObject({ etat: 'classe', id: 'avis_client', versionAncienne: true });
    // Retirée (`ai_generated`) · non classée, mais le classement perdu est signalé.
    expect(lireFormatCreatif({ formatCreatif: { id: 'ai_generated' } }), 'valeur retirée effacée en silence').toMatchObject({ etat: 'non_classe', id: null, versionAncienne: true });
    // Sans version · pas écrit par l'action v1 · signalé aussi.
    expect(lireFormatCreatif({ formatCreatif: { id: 'meme' } }).versionAncienne).toBe(true);
    // Écrit par la v1 · rien à signaler ; une valeur inconnue n'est pas une ancienne valeur.
    expect(lireFormatCreatif({ formatCreatif: { id: 'meme', version: VERSION_FORMATS_CREATIFS } }).versionAncienne).toBe(false);
    expect(lireFormatCreatif({ formatCreatif: { id: 'inconnu_total', version: 1 } })).toEqual(LECTURE_NON_CLASSE);
  });
  it('une version ancienne est lisible et signalée', () => {
    expect(lireFormatCreatif({ formatCreatif: { id: 'meme', version: 0 } })).toMatchObject({ etat: 'classe', id: 'meme', versionAncienne: true });
  });
  it('date illisible ignorée, pas de crash', () => {
    expect(lireFormatCreatif({ formatCreatif: { id: 'meme', date: 'hier' } }).date).toBeNull();
  });
});

describe('filtre par média', () => {
  it('le média de l’annonce · vidéo, image, carrousel, inconnu', () => {
    expect(mediaAnnonce('video')).toBe('video');
    expect(mediaAnnonce('VIDEO')).toBe('video');
    expect(mediaAnnonce('image')).toBe('image');
    expect(mediaAnnonce('carousel')).toBe('image');
    expect(mediaAnnonce(undefined)).toBeNull();
    expect(mediaAnnonce('dpa')).toBeNull();
  });
  it('une vidéo ne propose aucun format image seule, une image aucun format vidéo seule', () => {
    const v = formatsPourMedia('video').map((f) => f.id);
    const i = formatsPourMedia('image').map((f) => f.id);
    expect(v).not.toContain('packshot');
    expect(v).toContain('face_camera');
    expect(i).not.toContain('face_camera');
    expect(i).toContain('packshot');
    expect(v).toContain('autre');
    expect(i).toContain('autre');
    // Selon le tableau du dossier · 10 vidéo seule + 11 mixtes (dont autre) ; 5 image seule + 11.
    expect(v).toHaveLength(21);
    expect(i).toHaveLength(16);
    expect(formatsPourMedia(null)).toHaveLength(26);
  });
  it('validation · hors liste refusé, média incompatible refusé, non_classe efface', () => {
    expect(validerChoixFormat('non_classe', 'video')).toEqual({ ok: true, id: null });
    expect(validerChoixFormat('face_camera', 'video')).toEqual({ ok: true, id: 'face_camera' });
    const r1 = validerChoixFormat('packshot', 'video');
    expect(r1.ok).toBe(false);
    expect(!r1.ok && r1.raison).toContain('ne s’applique pas');
    expect(validerChoixFormat('incertain', 'video').ok, 'la v1 manuelle n’écrit pas incertain').toBe(false);
    expect(validerChoixFormat('xxx', null).ok).toBe(false);
    expect(validerChoixFormat(undefined, null).ok).toBe(false);
  });
  it('enregistrement daté, versionné, signé', () => {
    expect(enregistrementFormat('demo', 'u9', new Date('2026-10-05T08:00:00Z'))).toEqual({ id: 'demo', version: VERSION_FORMATS_CREATIFS, date: '2026-10-05T08:00:00.000Z', auteur: 'u9' });
  });
  it('un snapshot client ne peut pas porter de classement', () => {
    expect(sansFormatCreatif({ id: 'a', formatCreatif: { id: 'packshot' } })).toEqual({ id: 'a' });
    const s = { id: 'b' };
    expect(sansFormatCreatif(s)).toBe(s);
  });
});

const L = (id: LectureFormat['id'], etat: LectureFormat['etat'] = id ? 'classe' : 'non_classe', date: string | null = null): LectureFormat =>
  ({ etat, id, version: 1, versionAncienne: false, date, auteur: null });
const A = (platform: string, mediaType: string | undefined, format: LectureFormat, sauvegardeLe = '2026-10-01T00:00:00Z', daysRunning = 0): AnnonceFormat =>
  ({ platform, mediaType, format, sauvegardeLe, daysRunning });

describe('comptage réel', () => {
  const lot: AnnonceFormat[] = [
    A('meta', 'image', L('packshot')),
    A('meta', 'image', L('packshot')),
    A('tiktok', 'video', L('face_camera')),
    A('meta', 'video', L('autre')),
    A('meta', 'video', L(null)),
    A('meta', 'image', L(null)),
    A('meta', 'image', L(null, 'incertain')),
  ];
  it('total, classées, non classées et incertaines à part', () => {
    const c = compterFormats(lot);
    expect({ total: c.total, classees: c.classees, nonClassees: c.nonClassees, incertaines: c.incertaines }).toEqual({ total: 7, classees: 4, nonClassees: 2, incertaines: 1 });
    expect(c.avecAnnonces.map((x) => [x.format.id, x.n])).toEqual([['packshot', 2], ['face_camera', 1], ['autre', 1]]);
    // La somme des formats = les classées · rien d'inventé, rien de perdu.
    expect(c.avecAnnonces.reduce((s, x) => s + x.n, 0)).toBe(c.classees);
  });
  it('aucun format à 0 parmi ceux qui ont des annonces · les autres sont rangés à part', () => {
    const c = compterFormats(lot);
    expect(c.avecAnnonces.every((x) => x.n > 0)).toBe(true);
    expect(c.sansAnnonce.map((f) => f.id)).not.toContain('packshot');
    expect(c.sansAnnonce).toHaveLength(26 - 3);
  });
  it('le périmètre média et source restreint le compte', () => {
    const v = compterFormats(lot, { media: 'video', plateforme: null });
    expect(v.total).toBe(3);
    expect(v.avecAnnonces.map((x) => x.format.id)).toEqual(['face_camera', 'autre']);
    expect(v.sansAnnonce.map((f) => f.id), 'un format image seule n’est pas listé en vidéo').not.toContain('packshot');
    const t = compterFormats(lot, { media: null, plateforme: 'tiktok' });
    expect(t.total).toBe(1);
  });
  it('lot vide · tout à zéro, aucun format avec annonces', () => {
    const c = compterFormats([]);
    expect(c.total + c.classees + c.nonClassees + c.avecAnnonces.length).toBe(0);
  });
});

describe('grille et tri', () => {
  const lot = [
    A('meta', 'image', L('packshot', 'classe', '2026-10-03T00:00:00Z'), '2026-09-01T00:00:00Z', 50),
    A('meta', 'image', L('packshot', 'classe', '2026-10-04T00:00:00Z'), '2026-09-20T00:00:00Z', 5),
    A('tiktok', 'image', L('packshot', 'classe', '2026-10-02T00:00:00Z'), '2026-09-10T00:00:00Z', 20),
    A('meta', 'image', L(null), '2026-09-30T00:00:00Z'),
  ];
  const ordre = (tri: 'recent' | 'ancien' | 'classe' | 'duree') => grilleFormat(lot, { format: 'packshot', media: null, plateforme: null, tri }).map((a) => a.daysRunning);
  it('ne garde que le format demandé', () => {
    expect(grilleFormat(lot, { format: 'packshot', media: null, plateforme: null, tri: 'recent' })).toHaveLength(3);
    expect(grilleFormat(lot, { format: 'non_classe', media: null, plateforme: null, tri: 'recent' })).toHaveLength(1);
    expect(grilleFormat(lot, { format: null, media: null, plateforme: null, tri: 'recent' })).toHaveLength(0);
  });
  it('quatre tris', () => {
    expect(ordre('recent')).toEqual([5, 20, 50]);
    expect(ordre('ancien')).toEqual([50, 20, 5]);
    expect(ordre('classe')).toEqual([5, 50, 20]);
    expect(ordre('duree')).toEqual([50, 20, 5]);
  });
  it('filtre de source', () => {
    expect(grilleFormat(lot, { format: 'packshot', media: null, plateforme: 'tiktok', tri: 'recent' })).toHaveLength(1);
  });
});

describe('critères dans l’URL', () => {
  it('aller-retour, défaut omis', () => {
    const c = { format: 'demo' as const, media: 'video' as const, plateforme: 'tiktok', tri: 'duree' as const };
    expect(lireCriteresFormats(ecrireCriteresFormats(c))).toEqual(c);
    expect(ecrireCriteresFormats({ format: null, media: null, plateforme: null, tri: 'recent' })).toBe('');
  });
  it('valeurs inconnues → défaut', () => {
    expect(lireCriteresFormats('?format=nimporte&media=audio&tri=x&plateforme=<script>')).toEqual({ format: null, media: null, plateforme: null, tri: 'recent' });
    expect(lireCriteresFormats({ format: ['non_classe', 'demo'], media: undefined })).toMatchObject({ format: 'non_classe' });
  });
  it('chaque critère actif se retire seul', () => {
    const a = criteresActifsFormats({ format: 'meme', media: 'image', plateforme: 'meta', tri: 'classe' });
    expect(a.map((x) => x.cle)).toEqual(['format', 'media', 'plateforme', 'tri']);
    expect(a[0]!.sansLui).toBe('?media=image&plateforme=meta&tri=classe');
    expect(a[1]!.libelle).toBe('Média · Image');
    expect(lireCriteresFormats(a[2]!.sansLui).plateforme).toBeNull();
  });
  it('date courte en UTC', () => {
    expect(dateCourteFormat('2026-10-05T23:30:00Z')).toBe('05/10/2026');
    expect(dateCourteFormat('n/a')).toBeNull();
  });
});
