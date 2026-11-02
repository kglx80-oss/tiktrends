import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VAR_INSTANTANE, imageBaseMigree } from './pg-memoire';

/**
 * globalSetup vitest · migre UNE base pglite pour toute l'exécution et en publie
 * l'image aux fichiers de test (voir `pg-memoire.ts`). Le processus principal
 * pose la variable avant de lancer les workers, qui en héritent.
 */
export default async function semerBaseMigree(): Promise<() => Promise<void>> {
  const dossier = await mkdtemp(join(tmpdir(), 'tt-pg-memoire-'));
  const chemin = join(dossier, 'base-migree.tar');
  await writeFile(chemin, await imageBaseMigree());
  process.env[VAR_INSTANTANE] = chemin;
  return async () => {
    delete process.env[VAR_INSTANTANE];
    await rm(dossier, { recursive: true, force: true });
  };
}
