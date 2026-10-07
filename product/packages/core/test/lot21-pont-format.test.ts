import { describe, expect, it } from 'vitest';
import { FORMATS_CREATIFS, FORMAT_AD_VIDEO_QUALIFIEE, formatAdDepuisSauvegarde, type FormatCreatifId } from '../src/formats-creatifs';

/**
 * Lot 21 · R3 · le pont Sauvegarde → Adsmap écrivait `format: 'video_ugc'` en
 * dur · une annonce IMAGE qualifiée « Packshot » devenait une « Vidéo UGC », et
 * Adsmap n'a aucun outil pour corriger ce format après coup.
 *
 * La règle (`formatAdDepuisSauvegarde`) sépare le TYPE DE MÉDIA (image, vidéo)
 * du FORMAT CRÉATIF QUALIFIÉ (choisi à la main) · elle ne range jamais une vidéo
 * en UGC par défaut, et refuse (avec la raison) plutôt que d'inventer.
 */
const qualifie = (id: string) => ({ id, version: 1, date: '2026-10-01T10:00:00.000Z', auteur: 'u' });
const snap = (mediaType: unknown, formatCreatif?: unknown) => ({ id: 'x', advertiserName: 'A', mediaType, ...(formatCreatif === undefined ? {} : { formatCreatif }) });

describe('image · le média suffit', () => {
  it('image qualifiée « Packshot » → static, le format qualifié est conservé', () => {
    expect(formatAdDepuisSauvegarde(snap('image', qualifie('packshot')))).toEqual({ ok: true, media: 'image', format: 'static', formatCreatif: 'packshot' });
  });
  it('image non qualifiée → static (le média le dit, aucune qualification inventée)', () => {
    expect(formatAdDepuisSauvegarde(snap('IMAGE'))).toEqual({ ok: true, media: 'image', format: 'static', formatCreatif: null });
  });
  it('carrousel (la source le dit) → image_carousel', () => {
    expect(formatAdDepuisSauvegarde(snap('carousel'))).toMatchObject({ ok: true, format: 'image_carousel' });
    expect(formatAdDepuisSauvegarde(snap('Carrousel', qualifie('liste')))).toMatchObject({ ok: true, format: 'image_carousel', formatCreatif: 'liste' });
  });
  it('aucune image ne devient une vidéo', () => {
    for (const f of FORMATS_CREATIFS.filter((x) => x.medias.includes('image'))) {
      const r = formatAdDepuisSauvegarde(snap('image', qualifie(f.id)));
      expect(r.ok && r.format, `image « ${f.libelle} » rangée en ${r.ok ? r.format : 'refus'}`).toBe('static');
    }
  });
});

describe('vidéo · seulement par une correspondance non ambiguë', () => {
  it('vidéo qualifiée « Démonstration » → video_demo', () => {
    expect(formatAdDepuisSauvegarde(snap('video', qualifie('demo')))).toEqual({ ok: true, media: 'video', format: 'video_demo', formatCreatif: 'demo' });
  });
  it('vidéo NON qualifiée → refus motivé, jamais video_ugc par défaut', () => {
    const r = formatAdDepuisSauvegarde(snap('video'));
    expect(r.ok, 'une vidéo non qualifiée reçoit un format d’ad inventé').toBe(false);
    expect(r).toEqual({ ok: false, cause: 'video_non_qualifiee', raison: 'Vidéo non qualifiée · choisis d’abord son format dans « Format », puis réessaie · rien n’a été créé dans Adsmap.' });
  });
  it('vidéo « incertaine » → refus (ce n’est pas une qualification)', () => {
    expect(formatAdDepuisSauvegarde(snap('video', { id: 'incertain', version: 1 }))).toMatchObject({ ok: false, cause: 'video_non_qualifiee' });
  });
  it('vidéo qualifiée sans correspondance sûre (« Face caméra ») → refus nommant le format', () => {
    expect(formatAdDepuisSauvegarde(snap('video', qualifie('face_camera')))).toEqual({
      ok: false, cause: 'video_sans_correspondance',
      raison: 'Format « Face caméra » · aucun format vidéo d’Adsmap (UGC, VSL, démo, story) ne lui correspond sans ambiguïté · rien n’a été créé, pour ne pas fausser les statistiques par format.',
    });
  });
  it('aucune vidéo n’est déduite UGC · la table ne contient que des correspondances écrites', () => {
    const vides: FormatCreatifId[] = [];
    for (const f of FORMATS_CREATIFS.filter((x) => x.medias.includes('video'))) {
      const r = formatAdDepuisSauvegarde(snap('video', qualifie(f.id)));
      expect(r.ok && r.format, `vidéo « ${f.libelle} » rangée en video_ugc · UGC déduit d’une vidéo`).not.toBe('video_ugc');
      if (!r.ok) vides.push(f.id);
      else expect(r.format).toBe(FORMAT_AD_VIDEO_QUALIFIEE[f.id]);
    }
    // Mesuré · 21 formats vidéo, 1 correspondance (`demo`), 20 refus.
    expect(Object.keys(FORMAT_AD_VIDEO_QUALIFIEE)).toEqual(['demo']);
    expect(vides).toHaveLength(FORMATS_CREATIFS.filter((x) => x.medias.includes('video')).length - 1);
  });
});

describe('média inconnu · refus', () => {
  it.each([[undefined], [null], [''], ['audio'], [42]])('mediaType %s → refus « type de média inconnu »', (m) => {
    expect(formatAdDepuisSauvegarde(snap(m, qualifie('demo')))).toEqual({
      ok: false, cause: 'media_inconnu',
      raison: 'Type de média inconnu dans la source (ni image ni vidéo) · son format Adsmap ne se devine pas · rien n’a été créé.',
    });
  });
  it('snapshot illisible → refus, jamais d’exception', () => {
    for (const s of [null, undefined, 'x', [], 3]) expect(formatAdDepuisSauvegarde(s)).toMatchObject({ ok: false, cause: 'media_inconnu' });
  });
});
