import { describe, expect, it } from 'vitest';
import {
  EFFECTIF_MIN_DUREES, MARGE_SEUIL_MESURE, OPERATION_JOB_STUDIO, SEUIL_DERIVE_MS, SEUIL_TACHE_BLOQUEE_MIN,
  binomialeRepartition, dureesTache, effectifMinimalBorneHaute, libelleDureeMs, mesurerDureesTaches, quantileExact, rangBorneHauteQuantile,
  resolveurSeuils, seuilApplique, statDurees, tableTachesAdmin, tableauDureesMesurees, tableauPhasesMesurees, typeTache,
  type TacheLue, type TacheMesurable, type TransitionLue,
} from '../src';

/**
 * Durées réelles des tâches de génération et seuil « bloquée » qui s'en
 * déduit · règles pures, horloge INJECTÉE (`T0`, tout est daté avant).
 */
const T0 = new Date('2026-03-02T10:00:00.000Z');
const S = 1_000;
const MIN = 60_000;
const IMG = [{ operation: 'keyframe:s1', profil: 'image_generation' }];
const VID = [{ operation: 'clip:s1', profil: 'animation' }];

/** Une tâche saine · création, puis chaque phase de la durée donnée (ms), datée AVANT T0. */
function saine(id: string, o: { attente?: number; prise?: number; soumission?: number; execution?: number; telechargement?: number; modele?: string | null; lignes?: typeof IMG; fin?: number } = {}): TacheMesurable {
  const p = { attente: o.attente ?? 5 * S, prise: o.prise ?? S, soumission: o.soumission ?? 2 * S, execution: o.execution ?? 40 * S, telechargement: o.telechargement ?? 6 * S };
  const total = p.attente + p.prise + p.soumission + p.execution + p.telechargement;
  const debut = T0.getTime() - (o.fin ?? 60 * MIN) - total;
  let t = debut;
  const tr: TransitionLue[] = [{ action: 'job.enqueue', le: new Date(t) }];
  t += p.attente; tr.push({ action: 'job.claimed', le: new Date(t) });
  t += p.prise; tr.push({ action: 'job.running', le: new Date(t) });
  t += p.soumission; if (o.modele !== null) tr.push({ action: 'job.provider.payload', le: new Date(t), modele: o.modele ?? 'fal-ai/modele-a' });
  t += p.execution; tr.push({ action: 'job.persisting', le: new Date(t) });
  t += p.telechargement; tr.push({ action: 'job.completed', le: new Date(t) }, { action: 'media.quality.control', le: new Date(t + S) });
  return { id, etat: 'completed', creeLe: new Date(debut), termineLe: new Date(t), lignes: o.lignes ?? IMG, transitions: tr };
}

/** Un générateur déterministe (mulberry32) · jamais `Math.random`. */
function alea(graine: number) {
  let a = graine >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const serie = (n: number, modele: string, graine: number, base = 40 * S, lignes = IMG) => {
  const r = alea(graine);
  return Array.from({ length: n }, (_, i) => saine(`${modele}-${i}`, { modele, execution: Math.round(base * Math.exp(r() * 1.2)), lignes }));
};

describe('quantiles exacts · la durée de rang ⌈n·p⌉, jamais interpolée', () => {
  it('médiane et p95 aux bons rangs, flottants compris (100 × 0,07)', () => {
    const x = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(quantileExact(x, 0.5)).toBe(10);
    expect(quantileExact(x, 0.95)).toBe(19);
    expect(quantileExact([7], 0.95)).toBe(7);
    expect(quantileExact(Array.from({ length: 60 }, (_, i) => i + 1), 0.95)).toBe(57);
    expect(quantileExact(Array.from({ length: 100 }, (_, i) => i + 1), 0.07), '100 × 0,07 = 7 · la virgule flottante donne 7,000…001, donc le rang 8').toBe(7);
    expect(quantileExact(Array.from({ length: 100 }, (_, i) => i + 1), 0.95)).toBe(95);
    expect(quantileExact(Array.from({ length: 101 }, (_, i) => i + 1), 0.5)).toBe(51);
    expect(statDurees([30, 10, 20])).toEqual({ n: 3, medianeMs: 20, p95Ms: 30, borneHauteP95Ms: null, maxMs: 30 });
  });
});

describe('effectif minimum · borne haute à 95 % du p95 par la loi binomiale', () => {
  it('le tableau du module · aucune borne sous 59, le maximum seul jusqu’à 92, 93 au minimum exact, 100 retenu', () => {
    const rangs = Object.fromEntries([58, 59, 80, 92, 93, 100, 150, 200].map((n) => [n, rangBorneHauteQuantile(n)]));
    expect(rangs).toEqual({ 58: null, 59: 59, 80: 80, 92: 92, 93: 92, 100: 99, 150: 148, 200: 196 });
    expect(binomialeRepartition(59, 0.95, 58)).toBeCloseTo(0.9515054747505768, 12);
    expect(binomialeRepartition(93, 0.95, 91)).toBeCloseTo(0.9500242047573835, 12);
    expect(binomialeRepartition(100, 0.95, 98)).toBeCloseTo(0.9629, 4);
    expect(effectifMinimalBorneHaute(), 'le plus petit effectif dont la borne haute n’est pas le maximum').toBe(93);
    expect(EFFECTIF_MIN_DUREES, 'l’effectif retenu passe sous le minimum calculé').toBeGreaterThanOrEqual(effectifMinimalBorneHaute());
    expect(EFFECTIF_MIN_DUREES).toBe(100);
    expect(MARGE_SEUIL_MESURE).toBe(1.5);
  });
});

describe('phases · rejouées sur les transitions écrites par le worker', () => {
  it('chaque phase et le total, dans le désordre de lecture', () => {
    const t = saine('a', { attente: 10 * S, prise: 2 * S, soumission: 3 * S, execution: 60 * S, telechargement: 15 * S });
    const d = dureesTache({ ...t, transitions: [...t.transitions].reverse() });
    expect(d.phases).toEqual({ attente: 10 * S, prise_en_charge: 2 * S, soumission: 3 * S, execution: 60 * S, telechargement: 15 * S });
    expect(d.totalMs).toBe(90 * S);
    expect(d).toMatchObject({ saine: true, type: 'image', modele: 'fal-ai/modele-a' });
  });

  it('remise en file (bail perdu) · l’attente cumule les deux files, la tentative perdue compte en soumission', () => {
    const c = T0.getTime() - 3_600_000;
    const at = (s: number) => new Date(c + s * S);
    const d = dureesTache({ id: 'r', etat: 'completed', creeLe: at(0), termineLe: at(200), lignes: IMG, transitions: [
      { action: 'job.claimed', le: at(4) }, { action: 'job.running', le: at(5) }, { action: 'job.queued', le: at(70) },
      { action: 'job.claimed', le: at(80) }, { action: 'job.running', le: at(81) }, { action: 'job.provider.payload', le: at(83), modele: 'm' },
      { action: 'job.persisting', le: at(180) }, { action: 'job.completed', le: at(190) },
    ] });
    expect(d.phases).toEqual({ attente: 14 * S, prise_en_charge: 2 * S, soumission: 67 * S, execution: 97 * S, telechargement: 10 * S });
    expect(d.totalMs, 'le total s’arrête à la transition terminale').toBe(190 * S);
    // Chaque démarrage repart SANS corps · un second passage sans corps consigné ne se découpe pas (le premier corps ne vaut pas pour lui).
    const deux = dureesTache({ id: 'd', etat: 'completed', creeLe: at(0), termineLe: at(100), lignes: IMG, transitions: [
      { action: 'job.claimed', le: at(1) }, { action: 'job.running', le: at(2) }, { action: 'job.provider.payload', le: at(3), modele: 'm' },
      { action: 'job.queued', le: at(10) }, { action: 'job.claimed', le: at(20) }, { action: 'job.running', le: at(21) },
      { action: 'job.persisting', le: at(90) }, { action: 'job.completed', le: at(100) },
    ] });
    expect([deux.phases.soumission, deux.phases.execution], 'chaque démarrage repart sans corps consigné').toEqual([null, null]);
  });

  it('sans corps consigné · soumission et exécution non mesurées, le total compte · sans transition, repli sur finished_at', () => {
    const d = dureesTache(saine('s', { modele: null }));
    expect(d.phases.soumission).toBeNull();
    expect(d.phases.execution).toBeNull();
    expect(d.phases.attente).toBe(5 * S);
    expect(d.modele).toBeNull();
    expect(d.saine).toBe(true);
    const nu = dureesTache({ id: 'n', etat: 'completed', creeLe: new Date(T0.getTime() - 5 * MIN), termineLe: new Date(T0.getTime() - 3 * MIN), lignes: IMG, transitions: [] });
    expect(nu.totalMs).toBe(2 * MIN);
    expect(Object.values(nu.phases).every((v) => v === null)).toBe(true);
  });

  it('rapprochement ou annulation demandée · jamais une tâche saine', () => {
    const t = saine('x');
    const rap = { ...t, transitions: [...t.transitions, { action: 'job.reconciliation_required', le: new Date(t.transitions[3]!.le.getTime() + 1) }] };
    expect(dureesTache(rap)).toMatchObject({ saine: false, exclusion: 'passée par un rapprochement' });
    const ann = { ...t, transitions: [...t.transitions, { action: 'job.cancel_requested', le: new Date(t.transitions[3]!.le.getTime() + 1) }] };
    expect(dureesTache(ann)).toMatchObject({ saine: false, exclusion: 'annulation demandée' });
    expect(dureesTache({ ...t, etat: 'failed' }).saine).toBe(false);
    expect(mesurerDureesTaches([t, rap, ann]).types.image.total?.n).toBe(1);
  });

  it('le type · vidéo dès qu’une ligne anime un plan', () => {
    expect(typeTache(VID)).toBe('video');
    expect(typeTache([{ operation: 'clip:s2' }])).toBe('video');
    expect(typeTache(IMG)).toBe('image');
    expect(typeTache(null)).toBe('image');
  });
});

describe('le seuil · p95 × 1,5 à partir de 100 tâches saines, sinon par type, sinon dérivé', () => {
  it('99 tâches · dérivé (30 min), et l’écran le dit · 100 · mesuré', () => {
    const m99 = mesurerDureesTaches(serie(99, 'fal-ai/a', 1));
    expect(seuilApplique(m99, { type: 'image', modele: 'fal-ai/a' })).toMatchObject({ ms: SEUIL_DERIVE_MS, source: 'derive' });
    expect(seuilApplique(m99, { type: 'image', modele: 'fal-ai/a' }).libelle).toMatch(/^dérivé, effectif insuffisant \(image · 99 sur 100\)/);
    const t100 = serie(100, 'fal-ai/a', 1);
    const m = mesurerDureesTaches(t100);
    const s = seuilApplique(m, { type: 'image', modele: 'fal-ai/a' });
    const st = m.modeles[0]!.total!;
    expect(s.source).toBe('mesure-modele');
    expect(s.libelle).toMatch(/^mesuré · ce modèle, 100 tâches saines/);
    expect(s.ms).toBe(Math.ceil(Math.max(st.p95Ms * 1.5, st.maxMs) / 1000) * 1000);
    expect(s.ms, 'le seuil mesuré n’a rien changé').not.toBe(SEUIL_DERIVE_MS);
  });

  it('jamais sous une tâche saine · une valeur aberrante relève le seuil à elle, chaque tâche mesurée reste sous son seuil', () => {
    const t = [...serie(99, 'fal-ai/a', 2), saine('lente', { modele: 'fal-ai/a', execution: 50 * MIN })];
    const m = mesurerDureesTaches(t);
    const st = m.modeles[0]!.total!;
    expect(st.p95Ms * 1.5, 'le cas n’éprouve pas le plancher').toBeLessThan(st.maxMs);
    expect(seuilApplique(m, { type: 'image', modele: 'fal-ai/a' }).ms, 'le seuil descend sous la plus longue tâche saine').toBe(Math.ceil(st.maxMs / 1000) * 1000);
    for (const graine of [3, 4, 5, 6, 7]) {
      const lot = [...serie(130, 'fal-ai/a', graine), ...serie(40, 'fal-ai/b', graine + 10, 90 * S), ...serie(12, 'fal-ai/v', graine + 20, 5 * MIN, VID)];
      const mm = mesurerDureesTaches(lot);
      for (const x of lot.map(dureesTache)) {
        expect(seuilApplique(mm, { type: x.type, modele: x.modele }).ms, `graine ${graine} · une tâche saine (${x.id}) serait dite bloquée`).toBeGreaterThanOrEqual(x.totalMs!);
      }
    }
  });

  it('modèle sous l’effectif · le seuil de son TYPE · modèle pas encore connu (en file) · le type aussi', () => {
    const m = mesurerDureesTaches([...serie(100, 'fal-ai/a', 8), ...serie(20, 'fal-ai/b', 9)]);
    const b = seuilApplique(m, { type: 'image', modele: 'fal-ai/b' });
    expect(b.source).toBe('mesure-type');
    expect(b.ms).toBe(m.types.image.seuilMs);
    expect(b.libelle).toMatch(/^mesuré · toutes les tâches image, 120 tâches saines \(modèle à 20 sur 100\)/);
    expect(seuilApplique(m, { type: 'image', modele: null })).toMatchObject({ source: 'mesure-type', ms: m.types.image.seuilMs });
    expect(seuilApplique(m, { type: 'image', modele: 'fal-ai/a' }).source).toBe('mesure-modele');
  });

  it('la vidéo à part · jamais mélangée à l’image, son propre repli, relevé à sa plus longue tâche saine', () => {
    const img = serie(100, 'fal-ai/a', 11);
    const seul = mesurerDureesTaches(img).types.image.seuilMs;
    const lentes = serie(10, 'fal-ai/kling', 12, 40 * MIN, VID);
    const m = mesurerDureesTaches([...img, ...lentes]);
    expect(m.types.image.seuilMs, 'des vidéos lentes ont déplacé le seuil image').toBe(seul);
    expect(m.types.image.total!.n).toBe(100);
    const v = seuilApplique(m, { type: 'video', modele: 'fal-ai/kling' });
    expect(v.source).toBe('derive');
    expect(v.ms, 'le repli vidéo descend sous sa plus longue tâche saine').toBe(Math.ceil(m.types.video.total!.maxMs / 1000) * 1000);
    expect(v.ms).toBeGreaterThan(SEUIL_DERIVE_MS);
    expect(v.libelle).toMatch(/^dérivé, effectif insuffisant \(vidéo · 10 sur 100\) · relevé à la plus longue tâche saine mesurée/);
    expect(seuilApplique(mesurerDureesTaches(img), { type: 'video', modele: null })).toMatchObject({ ms: SEUIL_TACHE_BLOQUEE_MIN * MIN, source: 'derive' });
  });
});

describe('« Bloquées » suit le seuil appliqué de CHAQUE tâche', () => {
  const lue = (id: string, lignes: typeof IMG, modele: string | null, age: number): TacheLue => ({
    id, operation: OPERATION_JOB_STUDIO, etat: 'running', lignes, modele, projet: 'P', espace: 'E', creeLe: new Date(T0.getTime() - age), erreur: null, registre: [],
  });
  it('image mesurée au-delà de son seuil · bloquée, pile · en cours · vidéo dérivée · 30 min', () => {
    const m = mesurerDureesTaches(serie(100, 'fal-ai/a', 13));
    const seuil = seuilApplique(m, { type: 'image', modele: 'fal-ai/a' }).ms;
    expect(seuil, 'le cas n’éprouve pas un seuil plus court que le dérivé').toBeLessThan(SEUIL_DERIVE_MS);
    const taches = [lue('i-au-dela', IMG, 'fal-ai/a', seuil + 1), lue('i-pile', IMG, 'fal-ai/a', seuil), lue('v-29', VID, null, 29 * MIN), lue('v-31', VID, null, 31 * MIN), lue('q-type', IMG, null, seuil + 1)];
    const t = tableTachesAdmin(taches, T0, { segment: 'bloquees' }, resolveurSeuils(m));
    expect(t.filtrees.map((l) => l.id)).toEqual(['i-au-dela', 'v-31', 'q-type']);
    expect(tableTachesAdmin(taches, T0, { segment: 'en-cours' }, resolveurSeuils(m)).filtrees.map((l) => l.id)).toEqual(['i-pile', 'v-29']);
    expect(t.filtrees.map((l) => l.seuil.source)).toEqual(['mesure-modele', 'derive', 'mesure-type']);
    // Sans mesure · le seuil dérivé de #1072, inchangé.
    expect(tableTachesAdmin(taches, T0, { segment: 'bloquees' }).filtrees.map((l) => l.id)).toEqual(['v-31']);
  });
});

describe('le tableau « Durées mesurées »', () => {
  it('modèles puis « Tous modèles », par type, la vidéo toujours présente · cellules lisibles', () => {
    const m = mesurerDureesTaches([...serie(100, 'fal-ai/a', 14), ...serie(3, 'fal-ai/b', 15), saine('s', { modele: null })]);
    const l = tableauDureesMesurees(m);
    expect(l.map((x) => x.cle)).toEqual(['image:fal-ai/a', 'image:fal-ai/b', 'image:', 'image:*', 'video:*']);
    expect(l.map((x) => x.cellules[0])).toEqual(['fal-ai/a', 'fal-ai/b', 'Modèle non consigné', 'Tous modèles', 'Tous modèles']);
    expect(l.map((x) => x.source)).toEqual(['mesure-modele', 'mesure-type', 'mesure-type', 'mesure-type', 'derive']);
    expect(l[4]!.cellules).toEqual(['Tous modèles', 'Vidéo', '0', 'n.c.', 'n.c.', '30 min', 'dérivé, effectif insuffisant (vidéo · 0 sur 100) · 30 min, délais du worker']);
    expect(l[3]!.cellules[2]).toBe('104');
    expect(tableauPhasesMesurees(m).map((x) => x.cle).slice(0, 5)).toEqual(['image:attente', 'image:prise_en_charge', 'image:soumission', 'image:execution', 'image:telechargement']);
    expect(tableauPhasesMesurees(m)[2]!.cellules.slice(0, 4), 'la tâche sans corps ne compte pas dans la soumission').toEqual(['Image', 'Soumission', '103', '2 s']);
  });
  it('durées lisibles', () => {
    expect([42 * S, 185 * S, 3 * MIN, 72 * MIN, 2 * 3_600_000, null].map(libelleDureeMs)).toEqual(['42 s', '3 min 05 s', '3 min', '1 h 12', '2 h', 'n.c.']);
  });
});
