import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { violationsCommandesDocker, violationsRegistre } from '../scripts/recette/compose';

/**
 * E2/E3 · `ops/recette/verifier-environnement.sh`, le script que le
 * propriétaire lance (la session n'a pas de démon Docker). On l'EXÉCUTE :
 *
 *  · à blanc · la liste et l'ORDRE des vérifications (lecture d'abord,
 *    mutations ensuite), aucune commande Docker exécutée (un faux `docker` en
 *    tête du PATH note tout appel), chaque commande compose affichée vise le
 *    seul projet de recette ;
 *  · en réel contre de faux `docker`, `curl` et `df` · tout OK ⇒ code 0, et
 *    toutes les lectures AVANT le premier build ;
 *  · E3 · chaque prérequis KO tour à tour (mémoire, disque, fichier, variables,
 *    clés, ports, isolement) ⇒ ARRÊT immédiat, code 1 : le journal du faux
 *    `docker` ne contient AUCUN `build`, `up` ni `run`, et rien n'est écrit
 *    (pas de dossier du registre créé). Un échec de phase 2 arrête aussi tout
 *    ce qui suit. Jamais une valeur du fichier d'env, même renvoyée par un
 *    outil.
 *  · E4 · l'isolement n'analyse rien sans que la LISTE des conteneurs puis
 *    CHAQUE inspection aient réussi et rendu une sortie lisible : échec de
 *    `docker ps` ou de `docker inspect` (même avec une sortie partielle qui
 *    paraît valide), message sans préfixe, sortie vide ou d'un autre
 *    conteneur ⇒ ÉCHEC, aucun build, up ni run.
 */

const PRODUIT = join(process.cwd(), '..', '..');
const SCRIPT = join(PRODUIT, 'ops', 'recette', 'verifier-environnement.sh');
const LECTURE = ['memoire', 'disque', 'fichier-env', 'cles-shell', 'compose-config', 'port-libre', 'isolement-existant'];
const MUTATIONS = ['construction', 'demarrage', 'isolement', 'migrations', 'ffmpeg-worker', 'sonde-video', 'site-local', 'registre'];
const ETAPES = [...LECTURE, ...MUTATIONS];
const SECRET = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718';
const SECRET_AUTH = 'mdp-sentinelle-auth-e3-77c1d0aa';
const ENV_CONFORME = `POSTGRES_PASSWORD=${SECRET}\nAUTH_SECRET=${SECRET_AUTH}\n`;

/**
 * La course qui faisait échouer l'étape 9 (« demarrage ») sous charge, une fois par-ci par-là dans
 * les portes, sans rapport avec le diff · le script lisait `echo "$SORTIE" | grep -q '^web_recette$'`
 * sous `pipefail`. `echo` écrit LIGNE À LIGNE (strace · un `write` par ligne) ; `grep -q` sort dès
 * `web_recette` lu ; si l'ordonnanceur le fait sortir avant la ligne `workers_recette`, `echo` prend
 * SIGPIPE (statut 141, vu dans PIPESTATUS) et le tube « échoue » · ÉCHEC fantôme. Le même tube
 * ouvrait une garde (`.env.deploy` trouvé puis ignoré). Correctif à la source : `grep -q … <<< "$X"`.
 *
 * Mesures (21/11/2026, 4 cœurs, faux outils de ce fichier) · échecs de l'étape 9 :
 *
 *   régime                                              passages     avant     après
 *   ce fichier en boucle, 12 boucles CPU                  50         1         0
 *     (27 cas par passage avant, 30 après)
 *   script seul, 8 en parallèle, 12 boucles CPU          2 000         4         0
 *   script seul, 4 en parallèle                            200         1         ·
 *   la ligne de l'étape 9 isolée, 8 boucles CPU        4 × 3 000       1 [141 0] ·
 *
 * Aucune attente en jeu · un passage complet dure p50 144 ms, max 236 ms à 4 en parallèle, et au
 * pire mesuré (8 en parallèle, machine à une charge de 25 à 30) p50 2,4 s, max 11,5 s, sous les
 * 30 s par test. Pour rendre la course CERTAINE, BAVARD ajoute des lignes après la ligne cherchée ·
 * il faut plus que le tampon du tube (64 Kio) plus la lecture de grep. Taux d'échec de l'ancien script à l'étape 9 selon BAVARD (100 passages, 4 en parallèle) :
 *
 *   lignes ajoutées     100    1 000   2 000   3 000   5 000   10 000   40 000
 *   octets            ~2 K    ~20 K   ~40 K   ~60 K   ~94 K   ~199 K   ~829 K
 *   échecs / 100         0        1       5      11      86      100      100
 *
 * 40 000 lignes · quatre fois le premier volume certain.
 */
const BAVARD = '40000';

let racine = '';
let bin = '';
const FAUX_DOCKER = `#!/bin/bash
echo "$*" >> "$JOURNAL_DOCKER"
# BAVARD=n · n lignes de plus APRÈS la ligne que le script cherche (sorties bavardes).
bavard() { [ -n "\${BAVARD:-}" ] && seq -f 'service_bavard_%g' "\$BAVARD"; return 0; }
case "$*" in
  *" config"*) [ -n "\${CONFIG_EN_TETE:-}" ] && echo "\$CONFIG_EN_TETE"; cat <<FIN
name: tiktrends-recette
services:
  web_recette:
    networks:
      recette: null
    ports:
      - mode: ingress
        host_ip: \${HOTE_PORT:-127.0.0.1}
        target: 3000
        published: "3101"
        protocol: tcp
networks:
  recette:
    name: tiktrends-recette-reseau
volumes:
  pgdata_recette:
    name: \${NOM_VOLUME:-tiktrends-recette-pgdata}
FIN
  bavard ;;
  *" build"*) [ -n "\${BUILD_KO:-}" ] && { echo "échec de construction"; exit 1; } ;;
  *" up -d"*) [ -n "\${UP_KO:-}" ] && { echo "échec du démarrage"; exit 1; }; touch "\$JOURNAL_DOCKER.up" ;;
  *"ps --status running --services"*) printf 'db_recette\\nredis_recette\\nweb_recette\\nworkers_recette\\n'; bavard ;;
  "ps --filter publish=3101"*) [ -n "\${PORT_OCCUPE:-}" ] && echo "\${PORT_OCCUPE}" ;;
  "ps -a"*)
    [ -n "\${PS_KO:-}" ] && { echo "Cannot connect to the Docker daemon at unix:///var/run/docker.sock"; exit 1; }
    echo "\${CONTENEURS:-tiktrends-recette-web_recette-1}"
    # Liste puis statut d'ÉCHEC sans message (démon coupé en route) · la sortie seule paraît valide.
    [ -n "\${PS_KO_PARTIEL:-}" ] && exit 1 ;;
  inspect*)
    [ -n "\${INSPECT_KO:-}" ] && { echo "Error: No such object: tiktrends-recette-web_recette-1"; exit 1; }
    # Inspection puis statut d'ÉCHEC sans message · la sortie seule paraît valide.
    [ -n "\${INSPECT_KO_PARTIEL:-}" ] && { echo "C:/tiktrends-recette-web_recette-1 N:tiktrends-recette-reseau "; exit 1; }
    [ -n "\${INSPECT_KO_APRES_UP:-}" ] && [ -f "\$JOURNAL_DOCKER.up" ] && { echo "Error response from daemon: inspection impossible"; exit 1; }
    if [ -n "\${INSPECT+x}" ]; then echo "\$INSPECT"; else echo "C:/tiktrends-recette-web_recette-1 V:\${NOM_VOLUME:-tiktrends-recette-pgdata} N:tiktrends-recette-reseau B:/machine/product/ops/recette/sorties "; fi ;;
  *"ffprobe -version"*) echo "ffprobe version 6.1.1" ;;
  *"ffmpeg -version"*) echo "ffmpeg version 6.1.1" ;;
  *"sonde-recette.ts"*) echo "\${SONDE:-OK · sonde vidéo publiée et relue · décodage prouvé (ffmpeg version 6.1.1) · H.264 oui, AAC oui}" ;;
  *"port web_recette 3000"*) echo "\${HOTE_PORT:-127.0.0.1}:3101" ;;
  *"recette:budget"*) echo "  RESTANT             · 15,0000 \\$"; bavard ;;
esac
exit 0
`;

/** Un dossier `product/` minimal et NEUF par passage · compose réel, fichier d'env, meminfo. */
function chantier(envFichier: string | null = ENV_CONFORME): string {
  const d = mkdtempSync(join(racine, 'p-'));
  mkdirSync(join(d, 'ops', 'recette'), { recursive: true });
  copyFileSync(join(PRODUIT, 'docker-compose.recette.yml'), join(d, 'docker-compose.recette.yml'));
  writeFileSync(join(d, 'meminfo'), 'MemTotal:       16000000 kB\nMemAvailable:    8000000 kB\n');
  if (envFichier !== null) writeFileSync(join(d, 'ops', 'recette', '.env.recette'), envFichier);
  return d;
}

function lancer(args: string[], env: Record<string, string> = {}, dossier = chantier()) {
  const journal = join(dossier, 'docker.log');
  const base = { ...process.env } as NodeJS.ProcessEnv;
  for (const k of ['FAL_KEY', 'ANTHROPIC_API_KEY', 'STUDIO_FOURNISSEUR_REEL']) delete base[k];
  const r = spawnSync('bash', [SCRIPT, ...args], { cwd: dossier, encoding: 'utf8', env: { ...base, PATH: `${bin}:${process.env.PATH}`, JOURNAL_DOCKER: journal, RECETTE_MEMINFO: join(dossier, 'meminfo'), ...env } });
  return {
    code: r.status, sortie: `${r.stdout}${r.stderr}`,
    appelsDocker: existsSync(journal) ? readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean) : [],
    registreCree: existsSync(join(dossier, 'ops', 'recette', 'registre')),
  };
}
const mutations = (appels: string[]) => appels.filter((l) => /(^|\s)(build|up|run)(\s|$)/.test(l));
const echecs = (sortie: string) => [...sortie.matchAll(/^ÉCHEC  · \d+ ([a-z-]+)$/gm)].map((m) => m[1]);

beforeAll(() => {
  racine = mkdtempSync(join(tmpdir(), 'e2-verif-'));
  bin = join(racine, 'bin');
  mkdirSync(bin);
  for (const [nom, corps] of [
    ['docker', FAUX_DOCKER],
    ['curl', '#!/bin/bash\necho "${CODE_HTTP:-200}"\n'],
    ['df', '#!/bin/bash\necho "Filesystem 1024-blocks Used Available Capacity Mounted"\necho "/dev/x 100000000 1000 ${DF_DISPO:-52428800} 1% /"\n'],
  ] as const) { writeFileSync(join(bin, nom), corps); chmodSync(join(bin, nom), 0o755); }
});
afterAll(() => { if (racine) rmSync(racine, { recursive: true, force: true }); });

describe('verifier-environnement.sh · à blanc', () => {
  it('quinze vérifications, lecture puis mutations, aucune commande Docker exécutée, toutes visant le projet de recette', () => {
    const r = lancer(['--a-blanc']);
    expect(r.code).toBe(0);
    const etapes = [...r.sortie.matchAll(/^ÉTAPE (\d+) · ([a-z-]+) · /gm)].map((m) => `${m[1]}:${m[2]}`);
    expect(etapes, 'liste ou ordre des vérifications changé').toEqual(ETAPES.map((e, i) => `${i + 1}:${e}`));
    expect(r.sortie.indexOf('PHASE 2'), 'une mutation est annoncée avant la fin des lectures').toBeGreaterThan(r.sortie.indexOf('ÉTAPE 7 · isolement-existant'));
    expect(r.appelsDocker, 'à blanc, une commande Docker a été exécutée').toEqual([]);
    const affichees = r.sortie.split('\n').filter((l) => l.includes('[à blanc]')).join('\n');
    expect(affichees).toContain('run --rm --no-deps workers_recette ffprobe -version');
    expect(affichees).toContain('run --rm workers_recette pnpm exec tsx src/recette/sonde-recette.ts');
    expect(violationsCommandesDocker(affichees, 'a-blanc.txt')).toEqual([]);
    expect(r.sortie).toContain('À BLANC · 15 étapes affichées, rien n’a été exécuté.'.replace('’', "'"));
  });

  it('le script lui-même ne touche jamais au registre du budget', () => {
    expect(violationsRegistre(readFileSync(SCRIPT, 'utf8'), 'ops/recette/verifier-environnement.sh')).toEqual([]);
  });
});

describe('verifier-environnement.sh · contre de faux outils', () => {
  it('tout conforme ⇒ quinze OK, code 0, toutes les lectures AVANT le premier build, aucune valeur du fichier d’environnement affichée', () => {
    const r = lancer([]);
    expect(r.code, r.sortie).toBe(0);
    expect(r.sortie.match(/^OK {5}· \d+ /gm)).toHaveLength(15);
    expect(r.sortie).toContain('Tout est OK');
    expect(r.sortie).not.toContain(SECRET);
    expect(r.sortie).not.toContain(SECRET_AUTH);
    expect(r.appelsDocker.some((l) => /run --rm --no-deps workers_recette ffprobe -version$/.test(l))).toBe(true);
    const premierBuild = r.appelsDocker.findIndex((l) => / build$/.test(l));
    const lectures = r.appelsDocker.map((l, i) => (/ config$|^ps --filter publish=3101|^ps -a /.test(l) ? i : -1)).filter((i) => i >= 0);
    expect(lectures.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...lectures.slice(0, 3)), 'une lecture de phase 1 après une mutation').toBeLessThan(premierBuild);
  });

  it('sorties bavardes (des milliers de lignes APRÈS la ligne cherchée) ⇒ toujours quinze OK · aucun ÉCHEC fantôme quand grep s’arrête au premier motif', () => {
    const r = lancer([], { BAVARD });
    expect(echecs(r.sortie), r.sortie).toEqual([]);
    expect(r.code, r.sortie).toBe(0);
    expect(r.sortie.match(/^OK {5}· \d+ /gm)).toHaveLength(15);
  });

  // E3 · chaque prérequis KO, tour à tour ⇒ arrêt AVANT toute mutation.
  it.each([
    ['mémoire sous le seuil mesuré', { RECETTE_MEMINFO: '/dev/null' }, ENV_CONFORME, 'memoire'],
    ['disque sous le seuil', { DF_DISPO: '1048576' }, ENV_CONFORME, 'disque'],
    ['fichier d’environnement absent', {}, null, 'fichier-env'],
    ['AUTH_SECRET absent', {}, `POSTGRES_PASSWORD=${SECRET}\n`, 'fichier-env'],
    ['POSTGRES_PASSWORD non hexadécimal', {}, `POSTGRES_PASSWORD=pas-hexa-du-tout-zz\nAUTH_SECRET=${SECRET_AUTH}\n`, 'fichier-env'],
    ['clé payante écrite dans le fichier', {}, `${ENV_CONFORME}FAL_KEY=fal-e3-sentinelle\n`, 'fichier-env'],
    ['clé payante dans le shell', { ANTHROPIC_API_KEY: 'sk-e3-sentinelle-shell-9f' }, ENV_CONFORME, 'cles-shell'],
    ['port publié sur toutes les interfaces', { HOTE_PORT: '0.0.0.0' }, ENV_CONFORME, 'compose-config'],
    ['volume étranger (production)', { NOM_VOLUME: 'product_pgdata' }, ENV_CONFORME, 'compose-config'],
    ['port 3101 tenu par un autre projet', { PORT_OCCUPE: 'product' }, ENV_CONFORME, 'port-libre'],
    ['conteneur existant qui monte un volume étranger', { INSPECT: 'C:/tiktrends-recette-web_recette-1 V:product_pgdata N:tiktrends-recette-reseau' }, ENV_CONFORME, 'isolement-existant'],
    // E4 · un échec ou une sortie illisible n'est jamais « aucun partage ».
    ['liste des conteneurs en échec (docker ps)', { PS_KO: '1' }, ENV_CONFORME, 'isolement-existant'],
    ['liste lisible mais statut d’échec (docker ps)', { PS_KO_PARTIEL: '1' }, ENV_CONFORME, 'isolement-existant'],
    ['inspection en échec (docker inspect)', { INSPECT_KO: '1' }, ENV_CONFORME, 'isolement-existant'],
    ['inspection lisible mais statut d’échec (docker inspect)', { INSPECT_KO_PARTIEL: '1' }, ENV_CONFORME, 'isolement-existant'],
    ['inspection réussie mais message sans préfixe', { INSPECT: 'Error response from daemon: page not found' }, ENV_CONFORME, 'isolement-existant'],
    ['inspection vide', { INSPECT: '' }, ENV_CONFORME, 'isolement-existant'],
    ['inspection d’un autre conteneur que celui demandé', { INSPECT: 'C:/autre N:tiktrends-recette-reseau' }, ENV_CONFORME, 'isolement-existant'],
    ['élément sans préfixe mêlé à une inspection valide', { INSPECT: 'C:/tiktrends-recette-web_recette-1 N:tiktrends-recette-reseau avertissement' }, ENV_CONFORME, 'isolement-existant'],
    ['nom de conteneur illisible dans la liste', { CONTENEURS: 'WARNING: erreur de configuration' }, ENV_CONFORME, 'isolement-existant'],
    // Sorties bavardes · `grep -q` trouve son motif tôt et sort · la garde doit TOMBER quand même.
    ['configuration qui référence .env.deploy, sortie bavarde', { CONFIG_EN_TETE: 'env_file: ../.env.deploy', BAVARD }, ENV_CONFORME, 'compose-config'],
    ['configuration signalée invalide, sortie bavarde', { CONFIG_EN_TETE: 'invalid interpolation format', BAVARD }, ENV_CONFORME, 'compose-config'],
  ] as const)('prérequis KO · %s ⇒ ÉCHEC nommé, arrêt immédiat : aucun build, up ni run, rien d’écrit', (_n, env, envFichier, attendu) => {
    const r = lancer([], env, chantier(envFichier));
    expect(r.code, r.sortie).toBe(1);
    expect(echecs(r.sortie), r.sortie).toEqual([attendu]);
    expect(mutations(r.appelsDocker), `prérequis « ${attendu} » refusé, et pourtant le script a lancé`).toEqual([]);
    expect(r.registreCree, 'prérequis refusé, et pourtant le script a écrit').toBe(false);
    expect(r.sortie).toContain('rien n\'a été construit, démarré ni écrit');
    expect(r.sortie.match(/^ÉTAPE \d+ · /gm)).toHaveLength(LECTURE.indexOf(attendu) + 1);
    expect(r.sortie).not.toMatch(/sentinelle|a1b2c3d4e5f6/);
  });

  it.each([
    ['construction en échec', { BUILD_KO: '1' }, 'construction', [' build']],
    ['démarrage en échec', { UP_KO: '1' }, 'demarrage', [' build', ' up -d']],
    ['E4 · inspection après démarrage en échec', { INSPECT_KO_APRES_UP: '1' }, 'isolement', [' build', ' up -d']],
  ] as const)('phase 2 · %s ⇒ arrêt, aucune étape suivante (ni up, ni run)', (_n, env, attendu, permis) => {
    const r = lancer([], env);
    expect(r.code).toBe(1);
    expect(echecs(r.sortie)).toEqual([attendu]);
    expect(mutations(r.appelsDocker).map((l) => permis.find((p) => l.endsWith(p)) ?? l), 'une étape a été lancée après un échec').toEqual([...permis]);
    expect(r.registreCree).toBe(false);
  });

  it.each([
    ['sonde sans capacité', { SONDE: 'ÉCHEC · sonde vidéo publiée mais sans capacité · ffmpeg absent du worker' }, 'sonde-video'],
    ['site qui ne répond pas', { CODE_HTTP: '000' }, 'site-local'],
  ] as const)('%s ⇒ ÉCHEC nommé, code 1, rien après', (_n, env, attendu) => {
    const r = lancer([], env);
    expect(r.code).toBe(1);
    expect(echecs(r.sortie), r.sortie).toEqual([attendu]);
    expect(r.registreCree, 'l’étape du registre a tourné après un échec').toBe(false);
  });

  it('un outil qui RENVOIE un secret du fichier d’environnement ⇒ masqué à l’affichage', () => {
    const r = lancer([], { SONDE: `ÉCHEC · connexion refusée postgres://recette:${SECRET}@db_recette:5432` });
    expect(echecs(r.sortie)).toEqual(['sonde-video']);
    expect(r.sortie, 'une valeur du fichier d’environnement est affichée').not.toContain(SECRET);
    expect(r.sortie).toContain('postgres://recette:[masqué]@db_recette:5432');
  });
});
