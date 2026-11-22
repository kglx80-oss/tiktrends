import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `ops/backup.sh`, la sauvegarde quotidienne du VPS, et sa copie HORS-SITE vers le remote rclone
 * `ovh`. Tout est EXÉCUTÉ en bash réel contre de faux `docker` (un dump) et `rclone` (qui note
 * chaque appel), et on lit le RÉSULTAT :
 *
 *  · `copie_hors_site` (script sourcé : seules ses fonctions sont définies) · `rclone copy` vers
 *    `ovh:` lancé, ou non ;
 *  · `configurer` dans un environnement VIDE (`env -i`) · les chemins du VPS par défaut, même avec
 *    une barre finale sur TIKTRENDS_REPO ;
 *  · le script entier en copie d'essai (TIKTRENDS_REPO ailleurs) · refus sans projet compose
 *    distinct (la base dumpée serait celle de la PRODUCTION), et avec lui un dump local qui ne part
 *    JAMAIS vers `ovh:`, où il prendrait le nom des vrais.
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
const BASH = spawnSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).stdout.trim();
let racine = '';
let bin = '';

const FAUX_DOCKER = `#!/bin/bash
echo "\${COMPOSE_PROJECT_NAME-<absent>} $*" >> "$JOURNAL_DOCKER"
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

/** L'environnement du développeur sans ce qui changerait le mode, le seau ou le projet compose. */
function environnement(env: Record<string, string>): NodeJS.ProcessEnv {
  const base = { ...process.env } as NodeJS.ProcessEnv;
  for (const k of ['TIKTRENDS_REPO', 'TIKTRENDS_SAUVEGARDES', 'COMPOSE_PROJECT_NAME', 'COMPOSE_FILE', 'OFFSITE_BUCKET', 'REMOTES', 'BAVARD', 'CODE_LISTREMOTES']) delete base[k];
  return { ...base, PATH: `${bin}:${process.env.PATH}`, ...env };
}
const lignes = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean) : []);
const dumpsDe = (dossier: string) => (existsSync(dossier) ? readdirSync(dossier).filter((f) => /^tiktrends-\d{8}-\d{6}\.sql\.gz$/.test(f)) : []);

/** `copie_hors_site` seule, script sourcé (même `set -euo pipefail` que sur le VPS). */
function copier(env: Record<string, string> = {}) {
  const d = mkdtempSync(join(racine, 'copie-'));
  const dump = join(d, 'tiktrends-20261121-033000.sql.gz');
  writeFileSync(dump, 'dump');
  const journal = join(d, 'rclone.log');
  const r = spawnSync(BASH, ['-c', 'source "$1"; copie_hors_site "$2"', 'garde', SCRIPT, dump], { encoding: 'utf8', env: environnement({ JOURNAL_RCLONE: journal, ...env }) });
  const appels = lignes(journal);
  return { code: r.status, sortie: `${r.stdout}${r.stderr}`, dump, appels, copies: appels.filter((a) => a.startsWith('copy ')) };
}

/** `configurer` seule, dans un environnement VIDE : rien d'autre qu'un PATH de faux outils. */
function configurer(env: Record<string, string> = {}) {
  const r = spawnSync(BASH, ['-c', 'source "$1"; configurer; printf "REPO=%s\\nBACKUP_DIR=%s\\nOFFSITE=%s\\n" "$REPO" "$BACKUP_DIR" "$OFFSITE"', 'garde', SCRIPT], {
    encoding: 'utf8',
    // env -i : le PATH de faux outils, et rien d'autre (pas même NODE_ENV).
    env: { PATH: bin, ...env } as unknown as NodeJS.ProcessEnv,
  });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
}

/** Le script entier, en copie d'essai : un dépôt NEUF, ses sauvegardes à côté de lui. */
function essai(env: Record<string, string> = {}) {
  const d = mkdtempSync(join(racine, 'essai-'));
  mkdirSync(join(d, 'tiktrends', 'product'), { recursive: true });
  const journalRclone = join(d, 'rclone.log');
  const journalDocker = join(d, 'docker.log');
  const r = spawnSync(BASH, [SCRIPT], {
    encoding: 'utf8',
    env: environnement({ TIKTRENDS_REPO: join(d, 'tiktrends'), JOURNAL_RCLONE: journalRclone, JOURNAL_DOCKER: journalDocker, ...env }),
  });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}`, dumps: dumpsDe(join(d, 'sauvegardes')), docker: lignes(journalDocker), rclone: lignes(journalRclone) };
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
    const r = copier({ BAVARD });
    expect(r.code, r.sortie).toBe(0);
    expect(r.copies, `copie hors-site SAUTÉE en silence · appels rclone : ${r.appels.slice(0, 3).join(' | ')}`).toEqual([`copy ${r.dump} ovh:tiktrends-backups/`]);
    expect(r.sortie).toContain('Copie hors-site OK -> ovh:tiktrends-backups/');
  });

  it.each([
    ['ovh seul', 'ovh:\\n'],
    ['ovh listé après d’autres remotes', 'b2:\\ngdrive:\\novh:\\n'],
    ['ovh entre deux remotes', 'b2:\\novh:\\ns3:\\n'],
  ])('%s · copie lancée', (_cas, remotes) => {
    const r = copier({ REMOTES: remotes });
    expect(r.code, r.sortie).toBe(0);
    expect(r.copies).toEqual([`copy ${r.dump} ovh:tiktrends-backups/`]);
    expect(r.sortie).toContain('Copie hors-site OK');
  });

  it.each([
    ['aucun remote', ''],
    ['aucun remote nommé ovh', 'b2:\\novh-ancien:\\ns3:\\n'],
  ])('%s · pas de copie', (_cas, remotes) => {
    const r = copier({ REMOTES: remotes });
    expect(r.code, r.sortie).toBe(0);
    expect(r.copies).toEqual([]);
    expect(r.sortie).not.toContain('hors-site');
  });

  it('rclone listremotes en échec (même après avoir écrit ovh:) · pas de copie, comme avant le correctif', () => {
    const r = copier({ REMOTES: 'ovh:\\n', CODE_LISTREMOTES: '1' });
    expect(r.code, r.sortie).toBe(0);
    expect(r.appels).toEqual(['listremotes']);
  });
});

describe('ops/backup.sh · chemins du VPS par défaut (environnement vide)', () => {
  const VPS = 'REPO=/home/debian/tiktrends/product\nBACKUP_DIR=/home/debian/backups\nOFFSITE=1\n';
  it.each([
    ['aucune variable', {}],
    ['TIKTRENDS_REPO vide', { TIKTRENDS_REPO: '' }],
    ['TIKTRENDS_REPO du VPS', { TIKTRENDS_REPO: '/home/debian/tiktrends' }],
    ['TIKTRENDS_REPO du VPS, barre finale', { TIKTRENDS_REPO: '/home/debian/tiktrends/' }],
    ['TIKTRENDS_REPO du VPS, deux barres finales', { TIKTRENDS_REPO: '/home/debian/tiktrends//' }],
  ])('%s · REPO, BACKUP_DIR et copie hors-site du VPS, aucun refus', (_cas, env: Record<string, string>) => {
    const r = configurer(env);
    expect(r.code, `chemins du VPS REFUSÉS (pris pour une copie d’essai) · ${r.sortie}`).toBe(0);
    expect(r.sortie, 'chemins du VPS changés').toBe(VPS);
  });
});

describe('ops/backup.sh · copie d’essai (TIKTRENDS_REPO ailleurs que sur le VPS)', () => {
  it.each([
    ['COMPOSE_PROJECT_NAME absent', {}],
    ['COMPOSE_PROJECT_NAME vide', { COMPOSE_PROJECT_NAME: '' }],
    ['COMPOSE_PROJECT_NAME=product', { COMPOSE_PROJECT_NAME: 'product' }],
    ['COMPOSE_PROJECT_NAME=tiktrends', { COMPOSE_PROJECT_NAME: 'tiktrends' }],
  ])('%s · ARRÊT code 2, aucune commande docker (la base de production serait dumpée), rien écrit', (_cas, env: Record<string, string>) => {
    const r = essai({ REMOTES: 'ovh:\\n', ...env });
    expect(r.code, `copie d’essai NON refusée sans projet compose distinct · ${r.sortie}`).toBe(2);
    expect(r.sortie).toMatch(/ARRÊT · copie d'essai \(.+\) sans COMPOSE_PROJECT_NAME distinct · elle dumperait la base de production\./);
    expect(r.docker, 'docker appelé malgré le refus').toEqual([]);
    expect(r.dumps).toEqual([]);
    expect(r.rclone).toEqual([]);
  });

  it('avec son propre projet compose · dump local à côté de la copie, JAMAIS de copie vers ovh:', () => {
    const r = essai({ COMPOSE_PROJECT_NAME: 'tiktrends-essai-d1', REMOTES: 'ovh:\\n' });
    expect(r.code, r.sortie).toBe(0);
    expect(r.docker).toHaveLength(1);
    expect(r.docker[0]).toMatch(/^tiktrends-essai-d1 compose exec -T db /);
    expect(r.dumps, 'dump d’essai absent de son dossier').toHaveLength(1);
    expect(r.rclone, 'rclone appelé depuis une copie d’essai').toEqual([]);
    expect(r.sortie).toContain("Copie hors-site SAUTÉE · copie d'essai (");
  });
});
