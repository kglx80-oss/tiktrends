import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';
import { schema } from '@tiktrends/db';
import { CLE_SONDE_VIDEO, type SondeVideo } from '@tiktrends/core';
import { sonderPourRecette } from '../src/recette/sonde-recette';
import { pgMemoire } from './pg-memoire';
import type { BaseStudio } from '../src/studios/types';

/**
 * E2 · la sonde vidéo de la recette est PUBLIÉE puis RELUE en base, et jugée
 * par la règle du site : « OK » seulement si la capacité relue est vraie.
 * Sonde injectée (la CI n'a pas ffmpeg) ; sonde réelle si ffmpeg est là.
 */

let base: BaseStudio;
beforeAll(async () => { base = await pgMemoire(); });
const sonde = (o: Partial<SondeVideo> = {}): SondeVideo => ({
  version: 1, sondeLe: new Date().toISOString(), workerId: 'recette', ffmpeg: 'ffmpeg version 6.1.1',
  decodage: { ok: true, raison: 'échantillon décodé', dureeMs: 400 }, encodeurs: { libx264: true, aac: true }, ...o,
});

describe('sonde vidéo de recette', () => {
  it('décodage prouvé ⇒ OK, ligne app_settings publiée', async () => {
    const r = await sonderPourRecette({ base, sonder: async () => sonde() });
    expect(r.ok).toBe(true);
    expect(r.ligne).toMatch(/^OK · sonde vidéo publiée et relue · décodage prouvé \(ffmpeg version 6\.1\.1\) · H\.264 oui, AAC oui/);
    expect((await base.select().from(schema.appSettings)).filter((l) => l.key === CLE_SONDE_VIDEO)).toHaveLength(1);
  });

  it('ffmpeg absent ⇒ ÉCHEC nommé ; base absente ⇒ ÉCHEC, rien publié', async () => {
    const r = await sonderPourRecette({ base, sonder: async () => sonde({ ffmpeg: null, decodage: { ok: false, raison: 'ffmpeg introuvable', dureeMs: 1 } }) });
    expect(r).toEqual({ ok: false, ligne: 'ÉCHEC · sonde vidéo publiée mais sans capacité · ffmpeg absent du worker · ffmpeg introuvable' });
    expect((await sonderPourRecette({ base: null })).ligne).toBe('ÉCHEC · sonde vidéo · base de recette indisponible (DATABASE_URL), rien publié.');
  });

  it('publication non relue (horloge du site trop loin) ⇒ ÉCHEC, jamais OK sur la seule sonde locale', async () => {
    const r = await sonderPourRecette({ base, sonder: async () => sonde(), horloge: () => new Date(Date.now() + 24 * 3600_000) });
    expect(r.ok).toBe(false);
    expect(r.ligne).toMatch(/^ÉCHEC · sonde vidéo publiée mais sans capacité · sonde vidéo périmée/);
  });

  it.skipIf(!existsSync('/usr/bin/ffmpeg'))('sonde RÉELLE (ffmpeg du conteneur) ⇒ OK', async () => {
    const r = await sonderPourRecette({ base });
    expect(r.ok, r.ligne).toBe(true);
  }, 60_000);
});
