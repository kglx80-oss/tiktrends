import { describe, it, expect, afterAll } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { COMMANDE_DEVERROUILLER, FICHIER_VERROU, VerrouIndisponible, prendreVerrou } from '../scripts/recette/verrou';

/**
 * E3 · un verrou abandonné n'est repris que si son processus n'existe plus.
 * Un verrou tenu par un processus VIVANT n'est jamais volé. Un détenteur
 * dépossédé n'écrit rien.
 *
 * E4 · JAMAIS sur son âge : un verrou dont la mort du détenteur ne peut pas
 * être établie d'ici (autre hôte, ou même hôte et même démarrage mais autre
 * espace de PID · deux `docker compose run`) n'est jamais repris, même très
 * vieux ; le refus renvoie à `recette:budget:deverrouiller`.
 */

const dossiers: string[] = [];
const dossier = () => { const d = mkdtempSync(join(tmpdir(), 'e3-verrou-')); dossiers.push(d); return d; };
afterAll(() => { for (const d of dossiers) rmSync(d, { recursive: true, force: true }); });
const boot = (() => { try { return readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(); } catch { return 'inconnu'; } })();
const pidns = (() => { try { return readlinkSync('/proc/self/ns/pid'); } catch { return 'inconnu'; } })();
const poser = (d: string, c: Record<string, unknown>) => writeFileSync(join(d, FICHIER_VERROU), JSON.stringify({ jeton: 'ancien', hote: hostname(), demarrage: boot, pidns, le: new Date().toISOString(), ...c }));
const vieux = () => {
  const t = new Date(Date.now() - 3_600_000);
  return { le: t.toISOString(), poserDate: (d: string) => utimesSync(join(d, FICHIER_VERROU), t, t) };
};

describe('verrou périmé · repris seulement quand son processus n’existe plus', () => {
  it.skipIf(pidns === 'inconnu' || boot === 'inconnu')('PID mort, même hôte, même démarrage, même espace de PID ⇒ repris aussitôt, sans marqueur de reprise laissé', async () => {
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

  it.each([
    ['autre hôte (autre machine)', { hote: 'autre-machine' }],
    ['même hôte et même démarrage, AUTRE espace de PID (deux `docker compose run` du service d’outils)', { pidns: 'pid:[4026599999]' }],
    ['ancien format, sans espace de PID noté', { pidns: undefined }],
  ] as const)('E4 · %s, PID absent ici, verrou vieux d’une heure ⇒ JAMAIS repris : refus qui renvoie au déverrouillage', async (_n, c) => {
    const d = dossier();
    const mort = spawnSync(process.execPath, ['-e', 'process.exit(0)']).pid!;
    const v = vieux();
    poser(d, { pid: mort, le: v.le, ...c });
    v.poserDate(d);
    const err = await prendreVerrou(d, { attenteMaxMs: 300 }).catch((e: unknown) => e);
    expect(err, 'verrou REPRIS alors que la mort de son détenteur n’est pas établie (autre hôte, autre espace de PID, ou ancien format)').toBeInstanceOf(VerrouIndisponible);
    expect((err as Error).message, 'un verrou dont la mort du détenteur n’est pas établie a été repris (sur son âge ?)').toContain(`il n’est jamais repris sur son âge. Si AUCUNE commande de recette ne tourne plus, lance ${COMMANDE_DEVERROUILLER}.`);
    expect(JSON.parse(readFileSync(join(d, FICHIER_VERROU), 'utf8')).jeton, 'le verrou a été volé').toBe('ancien');
  });

  it('E4 · verrou illisible (écrit à moitié par un ancien format), même très vieux ⇒ jamais repris', async () => {
    const d = dossier();
    writeFileSync(join(d, FICHIER_VERROU), '');
    vieux().poserDate(d);
    await expect(prendreVerrou(d, { attenteMaxMs: 300 })).rejects.toThrow('verrou illisible');
    expect(readFileSync(join(d, FICHIER_VERROU), 'utf8')).toBe('');
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
