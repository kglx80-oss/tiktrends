import { describe, expect, it } from 'vitest';
import { FORMATS_CREATIFS, FORMAT_AD_VIDEO_QUALIFIEE, TYPES_AD_PAR_MEDIA, formatAdDepuisSauvegarde, resoudreTypeAd } from '../src/formats-creatifs';

/**
 * Lot 21 · R3 · message 77 · le pont Sauvegarde → Adsmap écrivait
 * `format: 'video_ugc'` en dur (une image « Packshot » devenait une « Vidéo
 * UGC »). Puis (a2f157a5) il REFUSAIT toute vidéo ambiguë et tout média
 * inconnu · une capacité existante retirée.
 *
 * La règle sépare le TYPE DE MÉDIA du FORMAT CRÉATIF QUALIFIÉ · automatique là
 * où rien n'est inventé (image, carrousel, Démonstration), sinon un CHOIX
 * EXPLICITE parmi les types compatibles · rien de présélectionné, jamais UGC
 * par défaut, jamais de refus définitif pour une ambiguïté · et le choix reçu
 * est validé contre la liste du média.
 */
const qualifie = (id: string) => ({ id, version: 1, date: '2026-10-01T10:00:00.000Z', auteur: 'u' });
const snap = (mediaType: unknown, formatCreatif?: unknown) => ({ id: 'x', advertiserName: 'A', mediaType, ...(formatCreatif === undefined ? {} : { formatCreatif }) });
const VIDEO = [
  { id: 'video_ugc', libelle: 'Vidéo UGC' }, { id: 'video_vsl', libelle: 'Vidéo VSL' },
  { id: 'video_demo', libelle: 'Vidéo démo' }, { id: 'video_story', libelle: 'Vidéo story' },
];

describe('automatique · rien n’est inventé', () => {
  it('image qualifiée « Packshot » → static, le format qualifié est conservé à part', () => {
    expect(formatAdDepuisSauvegarde(snap('image', qualifie('packshot')))).toEqual({ etat: 'auto', media: 'image', format: 'static', formatCreatif: 'packshot' });
  });
  it('image non qualifiée → static · carrousel dit par la source → image_carousel', () => {
    expect(formatAdDepuisSauvegarde(snap('IMAGE'))).toMatchObject({ etat: 'auto', format: 'static', formatCreatif: null });
    expect(formatAdDepuisSauvegarde(snap('Carrousel', qualifie('liste')))).toMatchObject({ etat: 'auto', format: 'image_carousel', formatCreatif: 'liste' });
  });
  it('vidéo qualifiée « Démonstration » → video_demo', () => {
    expect(formatAdDepuisSauvegarde(snap('video', qualifie('demo')))).toEqual({ etat: 'auto', media: 'video', format: 'video_demo', formatCreatif: 'demo' });
  });
  it('automatique · un choix forgé par le client est IGNORÉ (la règle décide)', () => {
    expect(resoudreTypeAd(snap('image', qualifie('packshot')), 'video_ugc')).toEqual({ ok: true, format: 'static', choisi: false, formatCreatif: 'packshot' });
  });
});

describe('ambigu · choix requis, liste compatible, rien de présélectionné', () => {
  it('vidéo NON qualifiée → choix parmi les 4 types vidéo, jamais video_ugc par défaut', () => {
    const d = formatAdDepuisSauvegarde(snap('video'));
    expect(d.etat, 'une vidéo non qualifiée reçoit un type d’ad sans choix').toBe('choix');
    expect(d).toEqual({ etat: 'choix', cause: 'video_non_qualifiee', media: 'video', options: VIDEO, formatCreatif: null,
      raison: 'Vidéo non qualifiée · choisis son type d’ad Adsmap · rien n’est déduit.' });
    expect(d, 'un type est présélectionné').not.toHaveProperty('format');
  });
  it('vidéo « Face caméra » (sans correspondance sûre) → choix, format qualifié conservé', () => {
    expect(formatAdDepuisSauvegarde(snap('video', qualifie('face_camera')))).toMatchObject({ etat: 'choix', cause: 'video_sans_correspondance', options: VIDEO, formatCreatif: 'face_camera' });
  });
  it('aucune vidéo n’est déduite UGC · aucune n’est refusée définitivement', () => {
    for (const f of FORMATS_CREATIFS.filter((x) => x.medias.includes('video'))) {
      const d = formatAdDepuisSauvegarde(snap('video', qualifie(f.id)));
      if (d.etat === 'auto') expect(d.format, `vidéo « ${f.libelle} » rangée sans choix en ${d.format}`).toBe(FORMAT_AD_VIDEO_QUALIFIEE[f.id]);
      else expect(d.options.map((o) => o.id), `vidéo « ${f.libelle} » sans liste de choix`).toEqual(TYPES_AD_PAR_MEDIA.video);
    }
    expect(Object.keys(FORMAT_AD_VIDEO_QUALIFIEE)).toEqual(['demo']);
  });
  it('GIF → choix parmi « GIF » seul (le contrat n’en connaît qu’un), confirmé', () => {
    expect(formatAdDepuisSauvegarde(snap('gif'))).toMatchObject({ etat: 'choix', cause: 'gif', media: 'gif', options: [{ id: 'gif', libelle: 'GIF' }] });
  });
  it.each([[undefined], [null], [''], ['audio'], [42]])('média %s inconnu → choix parmi les SEPT types, le choix le dit', (m) => {
    const d = formatAdDepuisSauvegarde(snap(m));
    expect(d).toMatchObject({ etat: 'choix', cause: 'media_inconnu', media: null, raison: 'Type de média inconnu dans la source · choisis son type d’ad parmi tous les types Adsmap · rien n’est déduit.' });
    expect(d.etat === 'choix' && d.options.map((o) => o.id)).toEqual(['video_ugc', 'video_vsl', 'video_demo', 'video_story', 'static', 'image_carousel', 'gif']);
  });
  it('snapshot illisible → choix (média inconnu), jamais d’exception', () => {
    for (const s of [null, undefined, 'x', [], 3]) expect(formatAdDepuisSauvegarde(s)).toMatchObject({ etat: 'choix', cause: 'media_inconnu' });
  });
});

describe('validation du choix reçu (côté serveur)', () => {
  it('sans choix → choix requis, avec la liste', () => {
    expect(resoudreTypeAd(snap('video'), undefined)).toMatchObject({ ok: false, cause: 'choix_requis', options: VIDEO });
    expect(resoudreTypeAd(snap('video'), '')).toMatchObject({ ok: false, cause: 'choix_requis' });
  });
  it('choix compatible → accepté, marqué « choisi », format qualifié conservé', () => {
    expect(resoudreTypeAd(snap('video', qualifie('face_camera')), 'video_vsl')).toEqual({ ok: true, format: 'video_vsl', choisi: true, formatCreatif: 'face_camera' });
    expect(resoudreTypeAd(snap('gif'), 'gif')).toEqual({ ok: true, format: 'gif', choisi: true, formatCreatif: null });
    expect(resoudreTypeAd(snap(undefined), 'static')).toMatchObject({ ok: true, format: 'static', choisi: true });
  });
  it.each([
    ['vidéo + static', snap('video'), 'static'],
    ['vidéo + gif', snap('video'), 'gif'],
    ['GIF + video_ugc', snap('gif'), 'video_ugc'],
    ['vidéo + valeur forgée', snap('video'), 'ugc_talking_head'],
    ['vidéo + objet', snap('video'), { id: 'video_ugc' }],
  ])('%s → refusé', (_n, s, c) => {
    const r = resoudreTypeAd(s, c);
    expect(r.ok, 'un type incompatible avec le média est accepté').toBe(false);
    expect(r).toMatchObject({ cause: 'choix_incompatible' });
  });
  it('la raison du refus nomme les types proposés', () => {
    expect(resoudreTypeAd(snap('gif'), 'static')).toEqual({ ok: false, cause: 'choix_incompatible', raison: 'Type d’ad non proposé pour ce média · choisis parmi « GIF » · rien n’a été créé.' });
  });
});
