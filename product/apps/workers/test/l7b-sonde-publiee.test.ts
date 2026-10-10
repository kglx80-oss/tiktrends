import { describe, it, expect, beforeAll } from 'vitest';
import { schema, eq } from '@tiktrends/db';
import { CLE_SONDE_VIDEO, capaciteVideo, lireSondeVideo, type SondeVideo } from '@tiktrends/core';
import { demarrerSondeVideo, publierSondeVideo } from '../src/studios/sonde-video';
import { pgMemoire } from './pg-memoire';
import type { BaseStudio } from '../src/studios/types';

/**
 * L7-B · la sonde est PUBLIÉE là où le site la lit (`app_settings`, ligne
 * unique, upsert) et relue telle quelle par la règle du noyau. Sonde injectée :
 * aucun ffmpeg requis, la CI la joue.
 */

let base: BaseStudio;
beforeAll(async () => { base = await pgMemoire(); });

const sonde = (o: Partial<SondeVideo> = {}): SondeVideo => ({
  version: 1, sondeLe: new Date().toISOString(), workerId: 'w-test', ffmpeg: 'ffmpeg version 6.1.1',
  decodage: { ok: true, raison: 'échantillon décodé', dureeMs: 480 }, encodeurs: { libx264: true, aac: true }, ...o,
});
async function attendre(cond: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 200; i++) { if (await cond()) return; await new Promise((r) => setTimeout(r, 10)); }
  throw new Error('condition jamais atteinte');
}
const ligne = async () => (await base.select().from(schema.appSettings).where(eq(schema.appSettings.key, CLE_SONDE_VIDEO)))[0];

describe('publication de la sonde', () => {
  it('démarrage ⇒ une ligne app_settings relue en capacité vraie ; la sonde suivante la REMPLACE', async () => {
    const logs: string[] = [];
    let n = 0;
    const s = demarrerSondeVideo({ base, sonder: async () => sonde(n++ === 0 ? {} : { decodage: { ok: false, raison: 'ffmpeg disparu', dureeMs: 2 }, ffmpeg: null }), intervalleMs: 20, log: (m) => logs.push(m) });
    await s.premiere;
    const l1 = await ligne();
    expect(lireSondeVideo(l1!.value)).toEqual(s.derniere());
    expect(capaciteVideo(l1!.value, new Date()).decodage).toBe(true);
    // Le passage périodique publie la sonde suivante (ici : ffmpeg disparu) ⇒ capacité retirée.
    await attendre(async () => lireSondeVideo((await ligne())?.value)?.decodage.ok === false);
    s.arreter();
    const l2 = await ligne();
    expect(capaciteVideo(l2!.value, new Date())).toMatchObject({ decodage: false, raison: expect.stringMatching(/ffmpeg absent/) });
    expect((await base.select().from(schema.appSettings)).filter((x) => x.key === CLE_SONDE_VIDEO)).toHaveLength(1);
    expect(logs[0]).toMatch(/^\[studios\] sonde vidéo · décodage prouvé/);
  });

  it('base indisponible ⇒ la sonde reste connue du worker, l’échec de publication est dit, jamais fatal', async () => {
    const logs: string[] = [];
    const casse = { insert: () => { throw new Error('base en panne'); } } as unknown as BaseStudio;
    const s = demarrerSondeVideo({ base: casse, sonder: async () => sonde(), log: (m) => logs.push(m) });
    await s.premiere;
    s.arreter();
    expect(s.derniere()?.decodage.ok).toBe(true);
    expect(logs.some((m) => /sonde vidéo non publiée · base en panne/.test(m))).toBe(true);
  });

  it('publierSondeVideo date la ligne à la sonde', async () => {
    const t = '2026-10-08T10:00:00.000Z';
    await publierSondeVideo(base, sonde({ sondeLe: t }));
    expect((await ligne())!.updatedAt.toISOString()).toBe(t);
  });
});
