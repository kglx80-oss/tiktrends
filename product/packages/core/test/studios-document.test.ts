import { describe, it, expect } from 'vitest';
import { validerContenuVersion, validerDocument, validerTimeline, contenuVide, ticksVersFrame, estIdStable } from '../src/studios/document';
import { contenuVideo, copie, documentStudio, timelineStudio } from './studios-fixtures';

const chemins = (v: Array<{ chemin: string }>) => v.map((x) => x.chemin);

describe('contenu de version', () => {
  it('le jeu de référence et le contenu vide sont valides', () => {
    expect(validerContenuVersion(contenuVideo())).toEqual([]);
    expect(validerContenuVersion(contenuVide())).toEqual([]);
  });

  it('une clé hors des sept clés du cahier est refusée', () => {
    expect(chemins(validerContenuVersion({ ...contenuVide(), script: 'alert(1)' }))).toContain('/script');
  });

  it('l’ordre des plans liste chaque plan une fois, et eux seuls', () => {
    const c = contenuVideo();
    c.shots.order = ['s_ouverture', 's_ouverture', 's_fin'];
    expect(chemins(validerContenuVersion(c))).toContain('/shots/order');
  });

  it('un identifiant purement numérique est refusé (il passerait pour un indice)', () => {
    const c = contenuVideo();
    const p = c.shots.byId.s_fin!;
    c.shots.byId['42'] = { ...p, shotId: '42' };
    c.shots.order.push('42');
    expect(chemins(validerContenuVersion(c))).toContain('/shots/byId/42');
    expect(estIdStable('42')).toBe(false);
    expect(estIdStable('s_42')).toBe(true);
  });

  it('la clé de collection doit égaler l’identifiant porté', () => {
    const c = contenuVideo();
    c.shots.byId.s_fin!.shotId = 's_autre';
    expect(chemins(validerContenuVersion(c))).toContain('/shots/byId/s_fin/shotId');
  });
});

describe('document à calques', () => {
  it('ordre d’empilement explicite et unique', () => {
    const d = documentStudio();
    d.layers.l_logo!.z = 2;
    expect(validerDocument(d).map((v) => v.raison).join()).toMatch(/déjà pris/);
  });

  it('masque grayscale8 aux dimensions EXACTES de la source', () => {
    const d = copie(documentStudio());
    const img = d.layers.l_fond as { mask: unknown };
    img.mask = { format: 'grayscale8', width: 1080, height: 1350, assetId: 'a_masque', featherPx: 4 };
    expect(validerDocument(d)).toEqual([]);
    img.mask = { format: 'grayscale8', width: 540, height: 675, assetId: 'a_masque', featherPx: 4 };
    expect(validerDocument(d).map((v) => v.raison)).toContain('le masque doit avoir les dimensions de la source');
    img.mask = { format: 'rgba', width: 1080, height: 1350, assetId: 'a_masque', featherPx: 4 };
    expect(validerDocument(d).map((v) => v.raison)).toContain('masque grayscale8 attendu');
  });

  it('un calque texte cite une police déclarée ; une couleur est #RRGGBB', () => {
    const d = copie(documentStudio());
    (d.layers.l_titre as { fontId: string }).fontId = 'f_inconnue';
    (d.layers.l_titre as { color: string }).color = 'red; background:url(x)';
    expect(chemins(validerDocument(d))).toEqual(['/document/layers/l_titre/fontId', '/document/layers/l_titre/color']);
  });
});

describe('timeline · unités entières, fps rationnel', () => {
  it('in < out, et l’élément tient dans la durée', () => {
    const t = timelineStudio();
    t.tracks.t_video!.items.i1!.outTicks = 0;
    expect(validerTimeline(t).map((v) => v.raison).join()).toMatch(/outTicks/);
    const u = timelineStudio();
    u.tracks.t_video!.items.i1!.startTicks = 8_000_000;
    expect(validerTimeline(u).map((v) => v.raison).join()).toMatch(/dépasse la durée/);
  });

  it('des ticks flottants ou un fps non rationnel sont refusés', () => {
    const t = timelineStudio();
    t.tracks.t_video!.items.i1!.inTicks = 0.5;
    (t as { fps: unknown }).fps = { num: 29.97, den: 1 };
    expect(validerTimeline(t).length).toBe(2);
  });

  it('conversion exacte en frames à 30000/1001', () => {
    // 1 001 000 µs = exactement 30 frames à 29,97 i/s.
    expect(ticksVersFrame(1_001_000, 1_000_000, { num: 30000, den: 1001 })).toBe(30);
    expect(ticksVersFrame(1_000_999, 1_000_000, { num: 30000, den: 1001 })).toBe(29);
  });
});
