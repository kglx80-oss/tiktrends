import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `ops/backup.sh`, la sauvegarde quotidienne du VPS, et sa copie HORS-SITE vers le remote rclone
 * `ovh`. On l'EXÉCUTE (bash réel) contre de faux `docker` (un dump) et `rclone` (qui note chaque
 * appel), et on lit le RÉSULTAT : la sauvegarde locale existe, et `rclone copy` vers `ovh:` a été
 * lancé, ou non.
 *
 * Le défaut réparé · le script lisait `rclone listremotes | grep -q '^ovh:'` sous `pipefail`.
 * `grep -q` sort dès `ovh:` lu et ferme le tube ; rclone (Go, sortie sans tampon : un `write` par
 * remote) prend SIGPIPE s'il lui reste un remote à écrire, statut 141, et le tube entier
 * « échoue » · la copie hors-site était SAUTÉE sans un mot. Même défaut que #1127.
 *
 * Mesures (21/11/2026, 4 cœurs, faux outils de ce fichier, 4 passages en parallèle) · copies
 * sautées par l'ANCIEN script selon le nombre de remotes listés APRÈS `ovh` :
 *
 *   remotes après ovh       1     10    100   1 000   2 000   3 000   5 000   10 000   20 000   40 000
 *   octets après ovh      ~17   ~170  ~1,8 K   ~19 K   ~39 K   ~59 K   ~99 K   ~199 K   ~409 K   ~829 K
 *   sautées           17/100 21/100 34/100  80/100  91/100  94/100 299/300  300/300  300/300  300/300
 *
 * Un SEUL remote après `ovh` suffisait déjà à sauter une copie sur six. Le script corrigé : 0/300
 * à 1 comme à 20 000. 40 000 · quatre fois le premier volume certain sur 300 passages.
 */
const BAVARD = '40000';

const SCRIPT = join(process.cwd(), '..', '..', 'ops', 'backup.sh');
let racine = '';
let bin = '';

const FAUX_DOCKER = `#!/bin/bash
# docker compose exec -T db sh -c 'pg_dump …' · un faux dump, assez gros pour le seuil de 500 octets.
echo "-- faux dump"; head -c 3000 /dev/urandom | base64
`;
const FAUX_RCLONE = `#!/bin/bash
echo "$*" >> "$JOURNAL_RCLONE"
case "$1" in
  listremotes)
    printf "\${REMOTES-ovh:\\n}"
    # BAVARD=n · n remotes APRÈS ceux de REMOTES, écrits comme rclone : un write par ligne, par CE processus.
    for ((i = 1; i <= \${BAVARD:-0}; i++)); do echo "remote_bavard_$i:"; done
    exit "\${CODE_LISTREMOTES:-0}" ;;
esac
exit 0
`;

function sauvegarder(env: Record<string, string> = {}) {
  const d = mkdtempSync(join(racine, 'vps-'));
  mkdirSync(join(d, 'tiktrends', 'product'), { recursive: true });
  const journal = join(d, 'rclone.log');
  const sauvegardes = join(d, 'sauvegardes');
  const r = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TIKTRENDS_REPO: join(d, 'tiktrends'), TIKTRENDS_SAUVEGARDES: sauvegardes, JOURNAL_RCLONE: journal, ...env },
  });
  const appels = existsSync(journal) ? readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean) : [];
  const dumps = existsSync(sauvegardes) ? readdirSync(sauvegardes).filter((f) => /^tiktrends-\d{8}-\d{6}\.sql\.gz$/.test(f)) : [];
  return {
    code: r.status,
    sortie: `${r.stdout}${r.stderr}`,
    dumps,
    copies: appels.filter((a) => a.startsWith('copy ')),
    appels,
    sauvegardes,
  };
}

beforeAll(() => {
  racine = mkdtempSync(join(tmpdir(), 'ops-backup-'));
  bin = join(racine, 'bin');
  mkdirSync(bin);
  for (const [nom, corps] of [['docker', FAUX_DOCKER], ['rclone', FAUX_RCLONE]] as const) {
    writeFileSync(join(bin, nom), corps);
    chmodSync(join(bin, nom), 0o755);
  }
});
afterAll(() => rmSync(racine, { recursive: true, force: true }));

describe('ops/backup.sh · copie hors-site vers le remote ovh', () => {
  it('sortie bavarde · des milliers de remotes listés après ovh, la copie hors-site part quand même', () => {
    const r = sauvegarder({ BAVARD });
    expect(r.code, r.sortie).toBe(0);
    expect(r.dumps, 'sauvegarde locale absente').toHaveLength(1);
    expect(r.copies, `copie hors-site SAUTÉE en silence · appels rclone : ${r.appels.slice(0, 3).join(' | ')}`).toEqual([
      `copy ${join(r.sauvegardes, r.dumps[0]!)} ovh:tiktrends-backups/`,
    ]);
    expect(r.sortie).toContain('Copie hors-site OK -> ovh:tiktrends-backups/');
  });

  it.each([
    ['ovh seul', 'ovh:\\n'],
    ['ovh listé après d’autres remotes', 'b2:\\ngdrive:\\novh:\\n'],
    ['ovh entre deux remotes', 'b2:\\novh:\\ns3:\\n'],
  ])('%s · copie lancée', (_cas, remotes) => {
    const r = sauvegarder({ REMOTES: remotes });
    expect(r.code, r.sortie).toBe(0);
    expect(r.copies).toHaveLength(1);
    expect(r.sortie).toContain('Copie hors-site OK');
  });

  it.each([
    ['aucun remote', ''],
    ['aucun remote nommé ovh', 'b2:\\novh-ancien:\\ns3:\\n'],
  ])('%s · pas de copie, la sauvegarde locale reste OK', (_cas, remotes) => {
    const r = sauvegarder({ REMOTES: remotes });
    expect(r.code, r.sortie).toBe(0);
    expect(r.dumps).toHaveLength(1);
    expect(r.copies).toEqual([]);
    expect(r.sortie).not.toContain('hors-site');
  });

  it('rclone listremotes en échec (même après avoir écrit ovh:) · pas de copie, comme avant le correctif', () => {
    const r = sauvegarder({ REMOTES: 'ovh:\\n', CODE_LISTREMOTES: '1' });
    expect(r.code, r.sortie).toBe(0);
    expect(r.dumps).toHaveLength(1);
    expect(r.appels).toEqual(['listremotes']);
  });
});
