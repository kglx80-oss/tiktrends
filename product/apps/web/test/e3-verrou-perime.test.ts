import { describe, it, expect, afterAll } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { FICHIER_VERROU, VERROU_PERIME_MS, VerrouIndisponible, prendreVerrou } from '../scripts/recette/verrou';

/**
 * E3 · un verrou PÉRIMÉ n'est repris que si son processus n'existe plus (même
 * hôte), ou s'il a dépassé `VERROU_PERIME_MS` (autre conteneur, PID
 * insondable). Un verrou tenu par un processus VIVANT n'est jamais volé. Un
 * détenteur dépossédé n'écrit rien.
 */

const dossiers: string[] = [];
const dossier = () => { const d = mkdtempSync(join(tmpdir(), 'e3-verrou-')); dossiers.push(d); return d; };
afterAll(() => { for (const d of dossiers) rmSync(d, { recursive: true, force: true }); });
const boot = (() => { try { return readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(); } catch { return 'inconnu'; } })();
const poser = (d: string, c: Record<string, unknown>) => writeFileSync(join(d, FICHIER_VERROU), JSON.stringify({ jeton: 'ancien', hote: hostname(), demarrage: boot, le: new Date().toISOString(), ...c }));

describe('verrou périmé · repris seulement quand son processus n’existe plus', () => {
  it('PID mort, même hôte ⇒ repris aussitôt, sans marqueur de reprise laissé', async () => {
    const d = dossier();
    const mort = spawnSync(process.execPath, ['-e', 'process.exit(0)']).pid!;
    poser(d, { pid: mort });
    const t0 = Date.now();
    const v = await prendreVerrou(d, { attenteMaxMs: 2_000 });
    expect(Date.now() - t0).toBeLessThan(1_500);
    expect(JSON.parse(readFileSync(join(d, FICHIER_VERROU), 'utf8')).jeton).toBe(v.jeton);
    v.relacher();
    expect(readdirSync(d), 'verrou ou marqueur laissé derrière').toEqual([]);
  });

  it('PID VIVANT, même hôte ⇒ jamais volé : refus nommé après l’attente', async () => {
    const d = dossier();
    const vivant = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 20000)']);
    try {
      poser(d, { pid: vivant.pid });
      await expect(prendreVerrou(d, { attenteMaxMs: 400 })).rejects.toThrow(`Registre du budget d’essai verrouillé par le processus ${vivant.pid}`);
      expect(JSON.parse(readFileSync(join(d, FICHIER_VERROU), 'utf8')).jeton, 'le verrou d’un processus vivant a été volé').toBe('ancien');
    } finally { vivant.kill('SIGKILL'); }
  });

  it('autre hôte (autre conteneur) ⇒ attendu tant qu’il est récent, repris au-delà de VERROU_PERIME_MS', async () => {
    const d = dossier();
    poser(d, { pid: 1, hote: 'autre-conteneur' });
    await expect(prendreVerrou(d, { attenteMaxMs: 300 })).rejects.toBeInstanceOf(VerrouIndisponible);
    const vieux = new Date(Date.now() - VERROU_PERIME_MS - 5_000);
    poser(d, { pid: 1, hote: 'autre-conteneur', le: vieux.toISOString() });
    utimesSync(join(d, FICHIER_VERROU), vieux, vieux);
    const v = await prendreVerrou(d, { attenteMaxMs: 2_000 });
    v.relacher();
    expect(existsSync(join(d, FICHIER_VERROU))).toBe(false);
  });

  it('détenteur DÉPOSSÉDÉ ⇒ `confirmer` lève avant toute écriture, et il ne retire pas le verrou d’un autre', async () => {
    const d = dossier();
    const v = await prendreVerrou(d);
    poser(d, { pid: process.pid, jeton: 'autre' });
    expect(() => v.confirmer()).toThrow('Verrou du registre perdu');
    v.relacher();
    expect(JSON.parse(readFileSync(join(d, FICHIER_VERROU), 'utf8')).jeton, 'un dépossédé a retiré le verrou d’un autre').toBe('autre');
  });
});
