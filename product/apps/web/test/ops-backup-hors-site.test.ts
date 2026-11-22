import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attendreEtat } from './helpers/attendre-etat';

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
 *    JAMAIS vers `ovh:`, où il prendrait le nom des vrais ;
 *  · `principal` (script sourcé, REPO, BACKUP_DIR et OFFSITE posés à la main) · le dump, la copie
 *    hors-site du VPS, et un pg_dump en échec qui ne laisse AUCUN fichier ;
 *  · le dépôt du VPS avec un COMPOSE_PROJECT_NAME qui n'est pas celui de la production · refus
 *    avant tout appel docker (le dump d'une base d'essai prendrait la place d'un vrai) ;
 *  · une copie d'essai dont le dossier de sauvegarde EST celui de la production, écrit autrement
 *    (`//`, `/./`, `x/../`, lien symbolique) · refus, les chemins sont comparés une fois résolus ;
 *  · un dump TUÉ par un signal (`systemctl stop`, arrêt, redémarrage : SIGTERM à tout le groupe)
 *    · aucun `tiktrends-*.sql.gz` partiel, que la rotation compterait et que la restauration « le
 *    plus récent » choisirait · le dump s'écrit dans `….sql.gz.part`, renommé une fois contrôlé ;
 *  · un second passage (lancé à la main pendant celui de 03h30) · refusé par le verrou, sans
 *    toucher au `.part` du premier, qui finit en code 0 ;
 *  · un chemin RELATIF en copie d'essai · refusé (il change de sens au `cd "$REPO"` de `principal`).
 *
 * Le nom du projet compose de production est `product` · mesuré (22/11/2026) : docker-compose.yml
 * n'a pas de clé `name:`, aucun `.env` versionné ne pose COMPOSE_PROJECT_NAME, et
 * `docker compose config` sans la variable, depuis un dossier `product/`, donne `name: product`.
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
# CODE_DOCKER=n · pg_dump interrompu : un début de dump, puis l'échec.
if [ -n "\${CODE_DOCKER:-}" ]; then echo "-- dump interrompu"; exit "$CODE_DOCKER"; fi
# TEMOIN_DOCKER=f · dump EN COURS : TOUT le début est écrit d'un coup, puis le témoin est posé
# (atomiquement, par mv) avec le nombre d'octets écrits · ensuite il n'écrit PLUS RIEN et attend que
# LIBERER_DOCKER existe (le test le pose) · sans lui, jusqu'au signal. Le dump sur disque atteint
# donc une taille FINALE connue, que la sonde attend exactement (rien ne dépend du rythme de gzip).
# Le sondage de la libération est celui du FAUX, pas du test.
if [ -n "\${TEMOIN_DOCKER:-}" ]; then
  { echo "-- dump commencé"; head -c 3000 /dev/urandom | base64; } > "$TEMOIN_DOCKER.contenu"
  cat "$TEMOIN_DOCKER.contenu"
  wc -c < "$TEMOIN_DOCKER.contenu" > "$TEMOIN_DOCKER.tmp"; mv "$TEMOIN_DOCKER.tmp" "$TEMOIN_DOCKER"
  until [ -e "\${LIBERER_DOCKER:-/nulle-part}" ]; do sleep 0.05; done
  echo "-- dump terminé"; exit 0
fi
# docker compose exec -T db sh -c 'pg_dump …' · un faux dump, assez gros pour le seuil de 500 octets.
echo "-- faux dump"; head -c 3000 /dev/urandom | base64
`;
// Un gzip qui ne compresse pas : le résultat ne dépend pas du gzip installé.
const FAUX_GZIP = `#!/bin/bash
exec cat
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
  for (const k of ['TIKTRENDS_REPO', 'TIKTRENDS_SAUVEGARDES', 'COMPOSE_PROJECT_NAME', 'COMPOSE_FILE', 'OFFSITE_BUCKET', 'REMOTES', 'BAVARD', 'CODE_LISTREMOTES', 'CODE_DOCKER', 'TEMOIN_DOCKER', 'LIBERER_DOCKER']) delete base[k];
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

/**
 * `configurer` seule, dans un environnement VIDE : un PATH (les faux outils devant ceux du système,
 * comme sous systemd qui pose /usr/bin:/bin) et rien d'autre.
 */
function configurer(env: Record<string, string> = {}) {
  const r = spawnSync(BASH, ['-c', 'source "$1"; configurer; printf "REPO=%s\\nBACKUP_DIR=%s\\nOFFSITE=%s\\n" "$REPO" "$BACKUP_DIR" "$OFFSITE"', 'garde', SCRIPT], {
    encoding: 'utf8',
    // env -i : le PATH, et rien d'autre (pas même NODE_ENV).
    env: { PATH: `${bin}:/usr/bin:/bin`, ...env } as unknown as NodeJS.ProcessEnv,
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

/** Le verrou de `principal` (un passage à la fois) · il reste dans le dossier, caché, hors du motif des dumps. */
const VERROU = '.tiktrends-backup.lock';
/** Le dossier de sauvegarde, verrou à part · ce que voient la rotation et la restauration, et les restes. */
const fichiersDe = (dossier: string) => readdirSync(dossier).filter((f) => f !== VERROU).sort();
const PRINCIPAL = 'source "$1"; REPO="$2" BACKUP_DIR="$3" OFFSITE="$4"; principal';
let passages = 0;

/** Un lieu pour `principal` · `d/product` (le dépôt) et `d/backups` (le dossier de sauvegarde). */
function lieu() {
  const d = mkdtempSync(join(racine, 'principal-'));
  mkdirSync(join(d, 'product'));
  mkdirSync(join(d, 'backups'));
  return { d, dossier: join(d, 'backups') };
}

/** `principal` seule, script sourcé : REPO, BACKUP_DIR et OFFSITE posés à la main, dossiers neufs (ou ceux de `d`). */
function principal(env: Record<string, string> = {}, offsite = '1', d = lieu().d) {
  const repo = join(d, 'product');
  const dossier = join(d, 'backups');
  const journalRclone = join(d, `rclone-${++passages}.log`);
  const journalDocker = join(d, `docker-${passages}.log`);
  const r = spawnSync(BASH, ['-c', PRINCIPAL, 'garde', SCRIPT, repo, dossier, offsite], {
    encoding: 'utf8',
    env: environnement({ JOURNAL_RCLONE: journalRclone, JOURNAL_DOCKER: journalDocker, REMOTES: 'ovh:\\n', ...env }),
  });
  const rclone = lignes(journalRclone);
  return {
    code: r.status,
    sortie: `${r.stdout}${r.stderr}`,
    fichiers: fichiersDe(dossier),
    dumps: dumpsDe(dossier).map((f) => join(dossier, f)),
    docker: lignes(journalDocker),
    rclone,
    copies: rclone.filter((a) => a.startsWith('copy ')),
  };
}
/**
 * `principal` lancé dans son PROPRE groupe de processus, et rendu une fois EN PLEIN DUMP (le faux
 * docker a tout écrit et attend, et le dump sur disque a EXACTEMENT les octets annoncés par son
 * témoin : il ne grandira plus avant `liberer`) · `attendreEtat`, jamais une durée. Sonder « une
 * taille non nulle » ne suffisait pas · le dump grandissait encore pendant le test (CI rouge de
 * #1136, run 45050052617 : 18 octets lus, puis 4 071).
 * `tuer` envoie un signal à tout le groupe (bash, le faux docker, le faux gzip) · ce que fait
 * `systemctl stop` (KillMode=control-group, le défaut) et l'arrêt ou le redémarrage du VPS.
 * `liberer` laisse le faux docker finir son dump. `fin` · le code ou le signal de bash.
 */
async function principalEnCours(d = lieu().d) {
  const dossier = join(d, 'backups');
  const temoin = join(d, 'docker-en-cours');
  const liberation = join(d, 'docker-liberer');
  const enfant = spawn(BASH, ['-c', PRINCIPAL, 'garde', SCRIPT, join(d, 'product'), dossier, '1'], {
    detached: true,
    stdio: 'ignore',
    env: environnement({ JOURNAL_RCLONE: join(d, 'rclone-en-cours.log'), JOURNAL_DOCKER: join(d, 'docker-en-cours.log'), REMOTES: 'ovh:\\n', TEMOIN_DOCKER: temoin, LIBERER_DOCKER: liberation }),
  });
  const fin = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((res) => enfant.on('exit', (code, signal) => res({ code, signal })));
  const tuer = (signal: NodeJS.Signals) => process.kill(-enfant.pid!, signal);
  const nettoyer = () => { try { tuer('SIGKILL'); } catch { /* groupe déjà fini */ } };
  try {
    await attendreEtat('faux docker en plein dump · témoin posé, dump sur disque à sa taille annoncée', () => {
      if (!existsSync(temoin)) return false;
      const annonce = Number(readFileSync(temoin, 'utf8').trim());
      return annonce > 0 && readdirSync(dossier).some((f) => f.startsWith('tiktrends-') && statSync(join(dossier, f)).size === annonce);
    });
  } catch (e) {
    nettoyer();
    throw e;
  }
  return { d, dossier, fin, tuer, nettoyer, liberer: () => writeFileSync(liberation, '') };
}

/**
 * Le chemin du VPS de bout en bout (`configurer` puis `principal`), sur un dépôt du VPS NEUF ·
 * VPS_REPO est réaffecté dans le shell de la garde, après le `source` (jamais par l'environnement).
 */
function vps(env: Record<string, string> = {}) {
  const d = mkdtempSync(join(racine, 'vps-'));
  mkdirSync(join(d, 'tiktrends', 'product'), { recursive: true });
  const dossier = join(d, 'backups');
  const journalRclone = join(d, 'rclone.log');
  const journalDocker = join(d, 'docker.log');
  const r = spawnSync(BASH, ['-c', 'source "$1"; VPS_REPO="$2"; configurer || exit $?; principal', 'garde', SCRIPT, join(d, 'tiktrends')], {
    encoding: 'utf8',
    env: environnement({ TIKTRENDS_SAUVEGARDES: dossier, JOURNAL_RCLONE: journalRclone, JOURNAL_DOCKER: journalDocker, REMOTES: 'ovh:\\n', ...env }),
  });
  const rclone = lignes(journalRclone);
  return { code: r.status, sortie: `${r.stdout}${r.stderr}`, dumps: dumpsDe(dossier), docker: lignes(journalDocker), copies: rclone.filter((a) => a.startsWith('copy ')) };
}

/** Le script EXÉCUTÉ comme par le service : `env -i`, un PATH et rien d'autre que `vars`. */
function executeVide(vars: Record<string, string>) {
  const d = mkdtempSync(join(racine, 'vide-'));
  const journalDocker = join(d, 'docker.log');
  const r = spawnSync('/usr/bin/env', ['-i', `PATH=${bin}:/usr/bin:/bin`, `JOURNAL_DOCKER=${journalDocker}`, ...Object.entries(vars).map(([k, v]) => `${k}=${v}`), 'bash', SCRIPT], { encoding: 'utf8' });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}`, docker: lignes(journalDocker) };
}

beforeAll(() => {
  racine = mkdtempSync(join(tmpdir(), 'ops-backup-'));
  bin = join(racine, 'bin');
  mkdirSync(bin);
  for (const [nom, corps] of [['docker', FAUX_DOCKER], ['gzip', FAUX_GZIP], ['rclone', FAUX_RCLONE]] as const) {
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
    ['COMPOSE_PROJECT_NAME vide', { COMPOSE_PROJECT_NAME: '' }],
    ['COMPOSE_PROJECT_NAME=product (le nom par défaut, écrit)', { COMPOSE_PROJECT_NAME: 'product' }],
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

  it('pg_dump en échec · le script entier sort en erreur et ne laisse AUCUN dump partiel', () => {
    const r = essai({ COMPOSE_PROJECT_NAME: 'tiktrends-essai-d1', CODE_DOCKER: '3' });
    expect(r.code, r.sortie).toBe(3);
    expect(r.docker).toHaveLength(1);
    expect(r.dumps, `dump PARTIEL laissé, que la rotation garderait et que « le plus récent » restaurerait · ${r.sortie}`).toEqual([]);
  });
});

const ARRET_VPS = /ARRÊT · dépôt du VPS \(\/home\/debian\/tiktrends\) avec COMPOSE_PROJECT_NAME=.+ · ce n'est pas le projet compose de production \(product\) : son dump prendrait la place des vrais\./;

describe('ops/backup.sh · dépôt du VPS avec un autre projet compose', () => {
  it.each([
    ['tiktrends-essai-d1 (le projet de la copie d’essai, resté exporté)', 'tiktrends-essai-d1'],
    ['tiktrends (ce n’est pas le nom par défaut)', 'tiktrends'],
    ['tiktrends-recette', 'tiktrends-recette'],
  ])('COMPOSE_PROJECT_NAME=%s · configurer refuse, code 2', (_cas, nom) => {
    const r = configurer({ COMPOSE_PROJECT_NAME: nom });
    expect(r.code, `dépôt du VPS ACCEPTÉ avec COMPOSE_PROJECT_NAME=${nom} · ${r.sortie}`).toBe(2);
    expect(r.sortie).toMatch(ARRET_VPS);
    expect(r.sortie, 'chemins posés malgré le refus').not.toContain('REPO=');
  });

  it('tiktrends-essai-d1 · de bout en bout, aucun appel docker, aucun dump, rien vers ovh:', () => {
    const r = vps({ COMPOSE_PROJECT_NAME: 'tiktrends-essai-d1' });
    expect(r.code, `dump de la base d’ESSAI rangé avec ceux de la production · ${r.sortie}`).toBe(2);
    expect(r.docker, 'docker appelé malgré le refus').toEqual([]);
    expect(r.dumps).toEqual([]);
    expect(r.copies).toEqual([]);
  });

  it('tiktrends-essai-d1 · le script EXÉCUTÉ (env -i, comme le service) refuse avant docker', () => {
    const r = executeVide({ COMPOSE_PROJECT_NAME: 'tiktrends-essai-d1' });
    expect(r.code, r.sortie).toBe(2);
    expect(r.sortie).toMatch(ARRET_VPS);
    expect(r.docker).toEqual([]);
  });

  it.each([
    ['absent', {}],
    ['vide', { COMPOSE_PROJECT_NAME: '' }],
    ['product', { COMPOSE_PROJECT_NAME: 'product' }],
  ])('COMPOSE_PROJECT_NAME %s · de bout en bout, un dump et sa copie vers ovh:', (_cas, env: Record<string, string>) => {
    const r = vps(env);
    expect(r.code, r.sortie).toBe(0);
    expect(r.docker).toHaveLength(1);
    expect(r.dumps).toHaveLength(1);
    expect(r.copies, 'copie hors-site du VPS absente').toHaveLength(1);
  });
});

describe('ops/backup.sh · principal (le corps du script)', () => {
  it('OFFSITE=1 · le dump est écrit sous son nom FINAL (aucun .part), PUIS copié vers ovh: sous ce nom', () => {
    const r = principal();
    expect(r.code, r.sortie).toBe(0);
    expect(r.dumps, 'dump absent du dossier de sauvegarde').toHaveLength(1);
    expect(r.fichiers, `le dossier ne contient pas QUE le dump final · ${r.sortie}`).toEqual([r.dumps[0]!.split('/').pop()]);
    expect(r.sortie).toMatch(/Sauvegarde OK : .+\/tiktrends-\d{8}-\d{6}\.sql\.gz \(/);
    expect(r.copies, `copie hors-site du VPS JAMAIS lancée · appels rclone : ${r.rclone.join(' | ')}`).toEqual([`copy ${r.dumps[0]} ovh:tiktrends-backups/`]);
    expect(r.sortie).toContain('Copie hors-site OK -> ovh:tiktrends-backups/');
  });

  it('OFFSITE=0 · dump local, aucun appel rclone', () => {
    const r = principal({}, '0');
    expect(r.code, r.sortie).toBe(0);
    expect(r.dumps).toHaveLength(1);
    expect(r.rclone).toEqual([]);
    expect(r.sortie).toContain('Copie hors-site SAUTÉE');
  });

  it('pg_dump en échec · son code, AUCUN fichier laissé (ni rotation ni restauration ne le verront), aucune copie', () => {
    const r = principal({ CODE_DOCKER: '3' });
    expect(r.code, `échec du dump masqué · ${r.sortie}`).toBe(3);
    expect(r.fichiers, 'dump PARTIEL laissé dans le dossier de sauvegarde').toEqual([]);
    expect(r.rclone, 'copie hors-site lancée après un dump en échec').toEqual([]);
    expect(r.sortie).toMatch(/ÉCHEC · dump de la base interrompu \(code 3\), fichier partiel supprimé : .+tiktrends-\d{8}-\d{6}\.sql\.gz/);
  });
});

describe('ops/backup.sh · dump tué par un signal (systemctl stop, arrêt, redémarrage)', () => {
  it('SIGTERM au groupe en plein dump · AUCUN tiktrends-*.sql.gz laissé (rotation et restauration « le plus récent » ne voient rien) · le passage suivant nettoie et produit un vrai dump', async () => {
    const a = await principalEnCours();
    let t: Awaited<typeof a.fin>;
    try {
      a.tuer('SIGTERM');
      t = await a.fin;
    } finally {
      a.nettoyer();
    }
    expect(t.signal, `bash pas tué par le signal (code ${t.code})`).toBe('SIGTERM');
    expect(dumpsDe(a.dossier), `dump PARTIEL laissé sous un nom de sauvegarde, que KEEP=14 compterait et que « ls -t … | head -1 » restaurerait · dossier : ${fichiersDe(a.dossier).join(', ')}`).toEqual([]);

    // Le reste du passage tué prend un horodatage PASSÉ · sinon le passage suivant, dans la même
    // seconde, réécrirait le même `.part` puis le renommerait, et le nettoyage ne serait pas gardé.
    const restes = fichiersDe(a.dossier).filter((f) => f.endsWith('.part'));
    expect(restes, `le passage tué n’a pas laissé un seul .part · ${restes.join(', ')}`).toHaveLength(1);
    renameSync(join(a.dossier, restes[0]!), join(a.dossier, 'tiktrends-20000101-000000.sql.gz.part'));

    const r = principal({}, '1', a.d);
    expect(r.code, r.sortie).toBe(0);
    expect(r.dumps, 'pas de dump au passage suivant').toHaveLength(1);
    expect(r.fichiers, `reste du passage interrompu NON nettoyé · ${r.sortie}`).toEqual([r.dumps[0]!.split('/').pop()]);
    expect(r.copies).toEqual([`copy ${r.dumps[0]} ovh:tiktrends-backups/`]);
  });

  it('un second passage PENDANT le premier · refusé par le verrou (code 75), le .part du premier intact, le premier finit en code 0 avec son dump', async () => {
    const a = await principalEnCours();
    try {
      const partA = fichiersDe(a.dossier).filter((f) => f.endsWith('.part'));
      expect(partA).toHaveLength(1);
      const avant = statSync(join(a.dossier, partA[0]!));

      const b = principal({}, '1', a.d);
      expect(b.code, `second passage NON refusé pendant le premier · ${b.sortie}`).toBe(75);
      expect(b.sortie).toMatch(/ARRÊT · sauvegarde déjà en cours \(verrou .+\/\.tiktrends-backup\.lock tenu\) · ce passage s'arrête sans rien toucher\./);
      expect(b.docker, 'second passage allé jusqu’à docker').toEqual([]);
      expect(b.rclone).toEqual([]);
      expect(fichiersDe(a.dossier), `le second passage a touché au .part du premier · ${b.sortie}`).toEqual(partA);
      // Le MÊME fichier (inode), pas un homonyme réécrit · et son contenu, à sa taille finale, intact.
      const apres = statSync(join(a.dossier, partA[0]!));
      expect(apres.ino, 'le .part du premier a été remplacé par un autre fichier du même nom').toBe(avant.ino);
      expect(apres.size, 'le .part du premier a changé de taille').toBe(avant.size);

      a.liberer();
      const fa = await a.fin;
      expect(fa.code, 'le premier passage ne finit pas en code 0').toBe(0);
      const dumps = dumpsDe(a.dossier);
      expect(dumps, 'pas de dump du premier passage').toEqual([partA[0]!.replace(/\.part$/, '')]);
      expect(fichiersDe(a.dossier)).toEqual(dumps);
    } finally {
      a.nettoyer();
    }
  });

  it('un .part d’un passage précédent est supprimé · seulement ceux de ce script (avant-migration et autres gardés), les dumps complets gardés', () => {
    const { d, dossier } = lieu();
    const gardes = ['autre.part', 'avant-migration-abc1234-20261120-010000.sql.gz.part', 'tiktrends-20261119-033000.sql.gz'];
    for (const f of [...gardes, 'tiktrends-20261120-033000.sql.gz.part']) writeFileSync(join(dossier, f), 'x'.repeat(800));
    const r = principal({}, '1', d);
    expect(r.code, r.sortie).toBe(0);
    expect(r.dumps).toHaveLength(2);
    const neuf = r.dumps.map((f) => f.split('/').pop()!).find((f) => f !== 'tiktrends-20261119-033000.sql.gz')!;
    expect(r.fichiers, `dump interrompu d’un passage précédent NON nettoyé, ou fichier d’autrui supprimé · ${r.sortie}`).toEqual([...gardes, neuf].sort());
  });
});

describe('ops/backup.sh · sourcé ou exécuté', () => {
  it('exécuté sous env -i (comme le service, copie d’essai) · le corps tourne : un appel docker', () => {
    const d = mkdtempSync(join(racine, 'execute-'));
    mkdirSync(join(d, 'tiktrends', 'product'), { recursive: true });
    const r = executeVide({ TIKTRENDS_REPO: join(d, 'tiktrends'), COMPOSE_PROJECT_NAME: 'tiktrends-essai-d1' });
    expect(r.code, r.sortie).toBe(0);
    expect(r.docker, 'script exécuté pris pour un script sourcé').toHaveLength(1);
    expect(dumpsDe(join(d, 'sauvegardes'))).toHaveLength(1);
  });

  it('exécuté, dépôt absent · arrêt sur `cd` (set -e actif dans principal), aucun appel docker', () => {
    const d = mkdtempSync(join(racine, 'sans-depot-'));
    const r = executeVide({ TIKTRENDS_REPO: join(d, 'tiktrends'), COMPOSE_PROJECT_NAME: 'tiktrends-essai-d1' });
    expect(r.code, r.sortie).not.toBe(0);
    expect(r.docker, `le corps a continué après l’échec de cd · ${r.sortie}`).toEqual([]);
  });

  it('sourcé avec $0 égal au chemin du script · rien ne tourne', () => {
    const d = mkdtempSync(join(racine, 'source-'));
    mkdirSync(join(d, 'tiktrends', 'product'), { recursive: true });
    const journalDocker = join(d, 'docker.log');
    const r = spawnSync(BASH, ['-c', 'source "$0"; declare -F principal >/dev/null && echo fonctions-definies', SCRIPT], {
      encoding: 'utf8',
      env: environnement({ TIKTRENDS_REPO: join(d, 'tiktrends'), COMPOSE_PROJECT_NAME: 'tiktrends-essai-d1', JOURNAL_DOCKER: journalDocker }),
    });
    expect(r.status, `${r.stdout}${r.stderr}`).toBe(0);
    expect(lignes(journalDocker), 'script SOURCÉ pris pour un script exécuté : la sauvegarde a tourné').toEqual([]);
    expect(r.stdout).toContain('fonctions-definies');
  });
});

/**
 * La comparaison se fait sur les chemins RÉSOLUS (`realpath -m`) · `/home/debian` n'existe pas ici
 * (ni sur la machine du test, ni dans la CI) et n'a pas à exister : `-m` résout `//`, `/./` et
 * `x/../` sans toucher au disque, et suit les liens qui existent, même vers une cible absente.
 * Les liens symboliques sont créés dans un dossier temporaire.
 */
const ARRET_DOSSIER_PROD = /ARRÊT · copie d'essai \(.+\) avec TIKTRENDS_SAUVEGARDES=.+ · c'est le dossier des sauvegardes de production, la rotation y supprimerait les vraies\. Chemin réel : \/home\/debian\/backups\./;

describe('ops/backup.sh · copie d’essai qui viserait le dossier de la production', () => {
  it.each([
    ['/home/debian/backups', '/home/debian/backups'],
    ['/home/debian/backups/ (barre finale)', '/home/debian/backups/'],
    ['/home/debian//backups (barre doublée)', '/home/debian//backups'],
    ['/home/debian/./backups (point)', '/home/debian/./backups'],
    ['/home/debian/x/../backups (remontée)', '/home/debian/x/../backups'],
    ['//home/debian/backups (deux barres en tête)', '//home/debian/backups'],
  ])('TIKTRENDS_SAUVEGARDES=%s · refus, code 2', (_cas, dossier) => {
    const r = configurer({ TIKTRENDS_REPO: '/srv/essai/tiktrends', COMPOSE_PROJECT_NAME: 'tiktrends-essai-d1', TIKTRENDS_SAUVEGARDES: dossier });
    expect(r.code, `copie d’essai autorisée à écrire dans le dossier de la production · ${r.sortie}`).toBe(2);
    expect(r.sortie).toMatch(/ARRÊT · copie d'essai \(\/srv\/essai\/tiktrends\) avec TIKTRENDS_SAUVEGARDES=\/+home\/debian\/.*backups\/? · c'est le dossier des sauvegardes de production, la rotation y supprimerait les vraies\./);
    expect(r.sortie).toMatch(ARRET_DOSSIER_PROD);
    expect(r.sortie, 'chemins posés malgré le refus').not.toContain('BACKUP_DIR=');
  });

  it.each([
    ['un lien vers /home/debian/backups', (t: string) => { symlinkSync('/home/debian/backups', join(t, 'lien')); return join(t, 'lien'); }],
    ['un lien vers /home/debian, puis /backups', (t: string) => { symlinkSync('/home/debian', join(t, 'debian')); return join(t, 'debian', 'backups'); }],
    ['un lien vers un lien vers /home/debian/backups/', (t: string) => { symlinkSync('/home/debian/backups/', join(t, 'cible')); symlinkSync(join(t, 'cible'), join(t, 'lien')); return join(t, 'lien'); }],
  ])('TIKTRENDS_SAUVEGARDES = %s · refus, code 2', (_cas, poser) => {
    const dossier = poser(mkdtempSync(join(racine, 'lien-')));
    const r = configurer({ TIKTRENDS_REPO: '/srv/essai/tiktrends', COMPOSE_PROJECT_NAME: 'tiktrends-essai-d1', TIKTRENDS_SAUVEGARDES: dossier });
    expect(r.code, `copie d’essai autorisée à écrire, par un lien, dans le dossier de la production · ${r.sortie}`).toBe(2);
    expect(r.sortie).toMatch(ARRET_DOSSIER_PROD);
  });

  it('sans TIKTRENDS_SAUVEGARDES, le dossier par défaut de la copie (../sauvegardes) est un lien vers la production · refus, code 2', () => {
    const t = mkdtempSync(join(racine, 'lien-defaut-'));
    symlinkSync('/home/debian/backups', join(t, 'sauvegardes'));
    const r = configurer({ TIKTRENDS_REPO: join(t, 'tiktrends'), COMPOSE_PROJECT_NAME: 'tiktrends-essai-d1' });
    expect(r.code, r.sortie).toBe(2);
    expect(r.sortie).toMatch(ARRET_DOSSIER_PROD);
  });

  it.each([
    ['TIKTRENDS_SAUVEGARDES relatif (../../backups, depuis /home/debian il devient /home/debian/backups après le cd de principal)', { TIKTRENDS_REPO: '/srv/essai/tiktrends', TIKTRENDS_SAUVEGARDES: '../../backups' }, /ARRÊT · copie d'essai \(\/srv\/essai\/tiktrends\) · TIKTRENDS_SAUVEGARDES=\.\.\/\.\.\/backups n'est pas un chemin absolu/],
    ['TIKTRENDS_SAUVEGARDES relatif (backups)', { TIKTRENDS_REPO: '/srv/essai/tiktrends', TIKTRENDS_SAUVEGARDES: 'backups' }, /TIKTRENDS_SAUVEGARDES=backups n'est pas un chemin absolu/],
    ['TIKTRENDS_REPO relatif (essai/tiktrends)', { TIKTRENDS_REPO: 'essai/tiktrends' }, /ARRÊT · copie d'essai \(essai\/tiktrends\) · TIKTRENDS_REPO n'est pas un chemin absolu/],
  ])('%s · refus, code 2', (_cas, env: Record<string, string>, phrase) => {
    const r = configurer({ COMPOSE_PROJECT_NAME: 'tiktrends-essai-d1', ...env });
    expect(r.code, `chemin RELATIF accepté en copie d’essai · il change de sens au cd de principal · ${r.sortie}`).toBe(2);
    expect(r.sortie).toMatch(phrase);
    expect(r.sortie, 'chemins posés malgré le refus').not.toContain('BACKUP_DIR=');
  });

  it('realpath introuvable · refus, code 2 (jamais une comparaison à vide qui laisserait passer)', () => {
    const r = configurer({ PATH: bin, TIKTRENDS_REPO: '/srv/essai/tiktrends', COMPOSE_PROJECT_NAME: 'tiktrends-essai-d1', TIKTRENDS_SAUVEGARDES: '/srv/essai/sauvegardes' });
    expect(r.code, `dossier de sauvegarde accepté SANS avoir été résolu · ${r.sortie}`).toBe(2);
    expect(r.sortie).toMatch(/ARRÊT · copie d'essai \(\/srv\/essai\/tiktrends\) · chemin du dossier de sauvegarde \(\/srv\/essai\/sauvegardes\) impossible à résoudre \(realpath -m\)/);
  });

  it('un autre dossier · accepté', () => {
    const r = configurer({ TIKTRENDS_REPO: '/srv/essai/tiktrends', COMPOSE_PROJECT_NAME: 'tiktrends-essai-d1', TIKTRENDS_SAUVEGARDES: '/srv/essai/sauvegardes' });
    expect(r.code, r.sortie).toBe(0);
    expect(r.sortie).toBe('REPO=/srv/essai/tiktrends/product\nBACKUP_DIR=/srv/essai/sauvegardes\nOFFSITE=0\n');
  });
  it('un lien vers un AUTRE dossier · accepté, BACKUP_DIR gardé tel qu’écrit (seule la comparaison résout)', () => {
    const t = mkdtempSync(join(racine, 'lien-autre-'));
    symlinkSync('/srv/essai/sauvegardes', join(t, 'lien'));
    const r = configurer({ TIKTRENDS_REPO: '/srv/essai/tiktrends', COMPOSE_PROJECT_NAME: 'tiktrends-essai-d1', TIKTRENDS_SAUVEGARDES: join(t, 'lien') });
    expect(r.code, r.sortie).toBe(0);
    expect(r.sortie).toBe(`REPO=/srv/essai/tiktrends/product\nBACKUP_DIR=${join(t, 'lien')}\nOFFSITE=0\n`);
  });
});
