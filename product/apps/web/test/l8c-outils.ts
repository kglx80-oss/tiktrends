import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import sharp from 'sharp';
import { schema } from '@tiktrends/db';
import {
  idMediaSynthetique, dimensionsMediaSynthetique, MEDIAS_SYNTHETIQUES, resumerTirages, empreinteContenu, jsonCanonique,
  type ContenuVersion, type ResumeTirages,
} from '@tiktrends/core';
import type { BaseStudio } from '../lib/studios/execution/types';
import type { IdsStudios } from './studios-semis';
import { projetVideo } from './l4a-outils';

/**
 * Outils L8-C côté serveur · médias synthétiques (fabriqués par `sharp`, aucun
 * fichier versionné), projet semé à une échelle donnée, jobs terminés qui
 * relient une image clé à CHAQUE plan (ce que l'écran vidéo relit), et
 * chronomètre asynchrone.
 */

sharp.concurrency(1);

/** Octets PNG des médias synthétiques du document · aplats colorés, dimensions de la source déclarée. */
export async function mediasSynthetiques(): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  for (let i = 0; i < MEDIAS_SYNTHETIQUES; i++) {
    const d = dimensionsMediaSynthetique(i);
    const png = await sharp({ create: { width: d.largeur, height: d.hauteur, channels: 4, background: { r: 30 * i, g: 200 - 20 * i, b: 90, alpha: 1 } } }).png().toBuffer();
    out.set(idMediaSynthetique(i), new Uint8Array(png));
  }
  return out;
}

/**
 * Projet vidéo semé à l'échelle donnée, puis une SECONDE version (un texte
 * écran changé) : les images clés produites pour la première restent valables
 * pour presque tous les plans, ce que la lecture doit établir plan par plan.
 * Un job `completed` par plan porte son image clé (`result.assets`).
 */
export async function projetAvecJobs(base: BaseStudio, ids: IdsStudios, contenu: ContenuVersion): Promise<{ projectId: string; v1: string; v2: string }> {
  const { projectId, versionId: v1 } = await projetVideo(base, ids, ids.brandA1, ids.ua, contenu);
  const sid = contenu.shots.order[0]!;
  const c2: ContenuVersion = JSON.parse(jsonCanonique(contenu));
  c2.shots.byId[sid]!.onScreenText = ['Texte changé'];
  const [v] = await base.insert(schema.studioProjectVersions).values({
    projectId, workspaceId: ids.wsA, brandId: ids.brandA1, parentId: v1, n: 2, schemaVersion: 1,
    content: c2, contentHash: empreinteContenu(c2), authorId: ids.ua, reason: 'mesure',
  }).returning();
  const { eq } = await import('@tiktrends/db');
  await base.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 2 }).where(eq(schema.studioProjects.id, projectId));
  const lignes = contenu.shots.order.map((s) => ({
    workspaceId: ids.wsA, brandId: ids.brandA1, projectId, projectVersionId: v1, operation: `keyframe:${s}`, state: 'completed' as const,
    idempotencyKey: `l8c-${randomUUID()}`, inputHash: 'a'.repeat(64), snapshot: {}, result: { assets: { [`keyframe:${s}`]: randomUUID() } }, createdBy: ids.ua,
  }));
  for (let i = 0; i < lignes.length; i += 100) await base.insert(schema.studioJobs).values(lignes.slice(i, i + 100));
  return { projectId, v1, v2: v!.id };
}

/**
 * `n` tirages d'une fonction asynchrone, après `chauffe` tirages à blanc ·
 * temps mur et temps CPU du processus (pglite tourne dans ce fil, sharp dans
 * ses fils libvips : tous comptent). Le temps CPU est l'estimation retenue
 * sur une machine partagée (voir `l8c-chemins.ts` du noyau).
 */
export async function chronometrerAsync(f: () => Promise<unknown>, n: number, chauffe = 2): Promise<{ mur: ResumeTirages; cpu: ResumeTirages }> {
  for (let i = 0; i < chauffe; i++) await f();
  const mur: number[] = [];
  const cpu: number[] = [];
  for (let i = 0; i < n; i++) {
    const c = process.cpuUsage();
    const d = performance.now();
    await f();
    mur.push(performance.now() - d);
    const u = process.cpuUsage(c);
    cpu.push((u.user + u.system) / 1000);
  }
  return { mur: resumerTirages(mur), cpu: resumerTirages(cpu) };
}
