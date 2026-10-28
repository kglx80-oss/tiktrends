import { describe, expect, it } from 'vitest';
import { encartMetaConnexion, etatConnexionMeta, manqueRadarCreatif, RELANCE_META, type EntreeConnexionMeta } from '../src';

/**
 * L'état PARTAGÉ de la connexion Meta (planche de banc v4) · l'Accueil, la vue
 * Analytics et le Radar se contredisaient sur la même marque. Une règle, un
 * libellé · ici la valeur RETOURNÉE ; le rendu des trois écrans sur une vraie
 * base est gardé côté web (`spatial-connexion-meta-db`).
 */
const MAINTENANT = new Date('2026-10-28T12:00:00Z');
const HIER = new Date('2026-10-27T06:00:00Z');
const base: EntreeConnexionMeta = { jeton: true, compte: true, comptes: 1, kpiLe: null, mesuresLe: null };

describe('etatConnexionMeta · la phase et son libellé', () => {
  it('sans jeton · non connecté, le seul cas qui invite à connecter', () => {
    const e = etatConnexionMeta({ ...base, jeton: false, mesuresLe: HIER }, MAINTENANT);
    expect(e).toEqual({ phase: 'a_brancher', derniere: null, libelle: 'Meta Ads non connecté', action: 'Connecter Meta Ads' });
  });
  it('plusieurs comptes, aucun choisi · compte à choisir (aucune synchro possible)', () => {
    expect(etatConnexionMeta({ ...base, compte: false, comptes: 2 }, MAINTENANT).phase).toBe('compte_a_choisir');
    // Un seul compte accessible ne se « choisit » pas.
    expect(etatConnexionMeta({ ...base, compte: false, comptes: 1 }, MAINTENANT).phase).toBe('jamais_synchronise');
  });
  it('connecté, aucune date, aucun KPI · première synchronisation en attente', () => {
    expect(etatConnexionMeta(base, MAINTENANT)).toEqual({ phase: 'jamais_synchronise', derniere: null, libelle: 'Meta Ads connecté · première synchronisation en attente', action: RELANCE_META });
  });
  it('la mesure Adsmap SEULE suffit · c’est une vraie synchro Meta (le cas du banc)', () => {
    const e = etatConnexionMeta({ ...base, mesuresLe: HIER }, MAINTENANT);
    expect(e.phase).toBe('synchronise');
    expect(e.libelle).toBe('Meta Ads · synchronisé hier');
    expect(e.action).toBeNull();
  });
  it('les KPI seuls suffisent aussi · et la plus RÉCENTE des deux dates gagne', () => {
    expect(etatConnexionMeta({ ...base, kpiLe: HIER }, MAINTENANT).libelle).toBe('Meta Ads · synchronisé hier');
    const e = etatConnexionMeta({ ...base, kpiLe: '2026-10-20T08:00:00Z', mesuresLe: '2026-10-28T09:00:00Z' }, MAINTENANT);
    expect(e.derniere?.toISOString()).toBe('2026-10-28T09:00:00.000Z');
    expect(e.libelle).toBe('Meta Ads · synchronisé il y a 3 h');
  });
  it('une ancienne ligne a des KPI sans date · synchronisé, sans inventer de date', () => {
    expect(etatConnexionMeta({ ...base, kpiPresents: true }, MAINTENANT)).toMatchObject({ phase: 'synchronise', derniere: null, libelle: 'Meta Ads · synchronisé' });
  });
  it('une date illisible n’est pas une synchro', () => {
    expect(etatConnexionMeta({ ...base, kpiLe: 'pas-une-date' }, MAINTENANT).phase).toBe('jamais_synchronise');
  });
});

describe('les manques d’écran ne contredisent jamais l’état', () => {
  it('Analytics · le titre de l’encart EST le libellé ; « connecter » seulement sans jeton', () => {
    const non = etatConnexionMeta({ ...base, jeton: false }, MAINTENANT);
    expect(encartMetaConnexion(non)).toMatchObject({ titre: 'Meta Ads non connecté', cta: { libelle: 'Connecter Meta Ads', href: '/connections' } });
    const sync = etatConnexionMeta({ ...base, mesuresLe: HIER }, MAINTENANT);
    const enc = encartMetaConnexion(sync);
    expect(enc.titre).toBe('Meta Ads · synchronisé hier');
    expect(`${enc.titre} ${enc.texte} ${enc.cta.libelle}`).not.toMatch(/en attente|Connecter|Brancher/);
    expect(enc.cta.libelle).toBe(RELANCE_META);
  });
  it('Radar · sans créas mais synchronisé · ni « brancher » ni « en attente »', () => {
    const m = manqueRadarCreatif(etatConnexionMeta({ ...base, mesuresLe: HIER }, MAINTENANT));
    expect(`${m.texte} ${m.action}`).not.toMatch(/en attente|Connect|Branch/);
    expect(manqueRadarCreatif(etatConnexionMeta({ ...base, jeton: false }, MAINTENANT)).action).toBe('Connecter Meta Ads');
  });
});
