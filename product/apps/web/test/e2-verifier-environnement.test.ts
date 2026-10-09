import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { violationsCommandesDocker, violationsRegistre } from '../scripts/recette/compose';

/**
 * E2 · `ops/recette/verifier-environnement.sh`, le script que le propriétaire
 * lance (la session n'a pas de démon Docker). On l'EXÉCUTE :
 *
 *  · à blanc · la liste et l'ORDRE des vérifications, aucune commande Docker
 *    exécutée (un faux `docker` en tête du PATH note tout appel), chaque
 *    commande compose affichée vise le seul projet de recette ;
 *  · en réel contre de faux `docker`, `curl` et `df` · tout OK ⇒ code 0 ;
 *    un port publié hors de 127.0.0.1, un volume étranger, une sonde sans
 *    capacité ⇒ ÉCHEC nommé, code 1. Jamais une valeur du fichier d'env.
 */

const PRODUIT = join(process.cwd(), '..', '..');
const SCRIPT = join(PRODUIT, 'ops', 'recette', 'verifier-environnement.sh');
const ETAPES = ['memoire', 'disque', 'fichier-env', 'compose-config', 'construction', 'demarrage', 'migrations', 'isolement', 'ffmpeg-worker', 'sonde-video', 'site-local', 'registre'];
const SECRET = 'mdp-sentinelle-e2-4f1a';

let dossier = '';
let bin = '';
const FAUX_DOCKER = `#!/bin/bash
echo "$*" >> "$JOURNAL_DOCKER"
case "$*" in
  *" config"*) cat <<FIN
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
  ;;
  *"ps --status running --services"*) printf 'db_recette\\nredis_recette\\nweb_recette\\nworkers_recette\\n' ;;
  "ps -a"*) echo tiktrends-recette-web_recette-1 ;;
  inspect*) echo "V:\${NOM_VOLUME:-tiktrends-recette-pgdata} N:tiktrends-recette-reseau B:/machine/product/ops/recette/sorties " ;;
  *"ffprobe -version"*) echo "ffprobe version 6.1.1" ;;
  *"ffmpeg -version"*) echo "ffmpeg version 6.1.1" ;;
  *"sonde-recette.ts"*) echo "\${SONDE:-OK · sonde vidéo publiée et relue · décodage prouvé (ffmpeg version 6.1.1) · H.264 oui, AAC oui}" ;;
  *"port web_recette 3000"*) echo "\${HOTE_PORT:-127.0.0.1}:3101" ;;
  *"recette:budget"*) echo "  RESTANT             · 15,0000 \\$" ;;
esac
exit 0
`;

function lancer(args: string[], env: Record<string, string> = {}) {
  const journal = join(dossier, `docker-${Math.random().toString(36).slice(2)}.log`);
  const r = spawnSync('bash', [SCRIPT, ...args], { cwd: dossier, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, JOURNAL_DOCKER: journal, RECETTE_MEMINFO: join(dossier, 'meminfo'), ...env } });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}`, appelsDocker: existsSync(journal) ? readFileSync(journal, 'utf8').trim().split('\n') : [] };
}

beforeAll(() => {
  dossier = mkdtempSync(join(tmpdir(), 'e2-verif-'));
  bin = join(dossier, 'bin');
  mkdirSync(bin);
  mkdirSync(join(dossier, 'ops', 'recette'), { recursive: true });
  copyFileSync(join(PRODUIT, 'docker-compose.recette.yml'), join(dossier, 'docker-compose.recette.yml'));
  writeFileSync(join(dossier, 'meminfo'), 'MemTotal:       16000000 kB\nMemAvailable:    8000000 kB\n');
  writeFileSync(join(dossier, 'ops', 'recette', '.env.recette'), `POSTGRES_PASSWORD=${SECRET}\nAUTH_SECRET=${SECRET}-auth\n`);
  for (const [nom, corps] of [
    ['docker', FAUX_DOCKER],
    ['curl', '#!/bin/bash\necho "${CODE_HTTP:-200}"\n'],
    ['df', '#!/bin/bash\necho "Filesystem 1024-blocks Used Available Capacity Mounted"\necho "/dev/x 100000000 1000 52428800 1% /"\n'],
  ] as const) { writeFileSync(join(bin, nom), corps); chmodSync(join(bin, nom), 0o755); }
});
afterAll(() => { if (dossier) rmSync(dossier, { recursive: true, force: true }); });

describe('verifier-environnement.sh · à blanc', () => {
  it('douze vérifications, dans cet ordre, aucune commande Docker exécutée, toutes visant le projet de recette', () => {
    const r = lancer(['--a-blanc']);
    expect(r.code).toBe(0);
    const etapes = [...r.sortie.matchAll(/^ÉTAPE (\d+) · ([a-z-]+) · /gm)].map((m) => `${m[1]}:${m[2]}`);
    expect(etapes, 'liste ou ordre des vérifications changé').toEqual(ETAPES.map((e, i) => `${i + 1}:${e}`));
    expect(r.appelsDocker, 'à blanc, une commande Docker a été exécutée').toEqual([]);
    const affichees = r.sortie.split('\n').filter((l) => l.includes('[à blanc]')).join('\n');
    expect(affichees).toContain('run --rm --no-deps workers_recette ffprobe -version');
    expect(affichees).toContain('run --rm workers_recette pnpm exec tsx src/recette/sonde-recette.ts');
    expect(violationsCommandesDocker(affichees, 'a-blanc.txt')).toEqual([]);
    expect(r.sortie).toContain('À BLANC · 12 étapes affichées, rien n’a été exécuté.'.replace('’', "'"));
  });

  it('le script lui-même ne touche jamais au registre du budget', () => {
    expect(violationsRegistre(readFileSync(SCRIPT, 'utf8'), 'ops/recette/verifier-environnement.sh')).toEqual([]);
  });
});

describe('verifier-environnement.sh · contre de faux outils', () => {
  it('tout conforme ⇒ douze OK, code 0, aucune valeur du fichier d’environnement affichée', () => {
    const r = lancer([]);
    expect(r.code, r.sortie).toBe(0);
    expect(r.sortie.match(/^OK {5}· \d+ /gm)).toHaveLength(12);
    expect(r.sortie).toContain('Tout est OK');
    expect(r.sortie).not.toContain(SECRET);
    expect(r.appelsDocker.some((l) => /run --rm --no-deps workers_recette ffprobe -version$/.test(l))).toBe(true);
  });

  it.each([
    ['port publié sur toutes les interfaces', { HOTE_PORT: '0.0.0.0' }, ['compose-config', 'site-local']],
    ['volume étranger (production)', { NOM_VOLUME: 'product_pgdata' }, ['compose-config', 'isolement']],
    ['sonde sans capacité', { SONDE: 'ÉCHEC · sonde vidéo publiée mais sans capacité · ffmpeg absent du worker' }, ['sonde-video']],
    ['site qui ne répond pas', { CODE_HTTP: '000' }, ['site-local']],
    ['mémoire sous le seuil mesuré', { RECETTE_MEMINFO: '/dev/null' }, ['memoire']],
  ] as const)('%s ⇒ ÉCHEC nommé, code 1', (_n, env, attendus) => {
    const r = lancer([], env);
    expect(r.code).toBe(1);
    const echecs = [...r.sortie.matchAll(/^ÉCHEC  · \d+ ([a-z-]+)$/gm)].map((m) => m[1]);
    expect(echecs, r.sortie).toEqual(attendus);
  });
});
