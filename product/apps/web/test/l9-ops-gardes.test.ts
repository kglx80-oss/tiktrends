import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { contenuVide, empreinteContenu } from '@tiktrends/core';

/**
 * Studios · L9 · les scripts d'exploitation de `ops/migration` ne touchent
 * JAMAIS la production. On les LANCE (bash réel) avec des adresses de
 * production et on lit leur sortie : refus avant toute connexion, code 2,
 * phrase qui dit pourquoi. Le semis synthétique refuse une base non l9_*
 * (exécuté sur une vraie base Postgres en mémoire), et le contenu des projets
 * semés porte la VRAIE empreinte canonique du noyau.
 */

const OPS = join(process.cwd(), '../../ops/migration');

function garde(url: string): { code: number | null; sortie: string } {
  const r = spawnSync('bash', ['-c', `source "${OPS}/lib.sh"; l9_garde_locale "$1"`, 'garde', url], { encoding: 'utf8' });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` };
}

describe('garde de destination · pur bash, avant toute connexion', () => {
  it.each([
    ['postgres://tiktrends:secret@db:5432/tiktrends', /base non locale/],
    ['postgresql://tiktrends@51.255.39.79:5432/copie_x', /base non locale/],
    ['postgres://postgres@127.0.0.1.exemple.test:5432/l9_x', /base non locale/],
    ['postgres://postgres@127.0.0.1:5433/tiktrends', /nom de base « tiktrends » refusé/],
    ['postgres://postgres@localhost:5432/postgres', /nom de base « postgres » refusé/],
    ['', /URL de base absente/],
  ])('refuse %s', (url, phrase) => {
    const g = garde(url);
    expect(g.code).toBe(1);
    expect(g.sortie).toMatch(phrase);
  });
  it.each([
    'postgres://postgres@127.0.0.1:5433/l9_mig01',
    'postgresql://u:p@localhost:5432/copie_20261009',
    'postgres://postgres@[::1]:5433/l9_x?sslmode=disable',
  ])('accepte %s', (url) => {
    expect(garde(url).code).toBe(0);
  });
});

describe('chaque script refuse la production, code 2, sans se connecter', () => {
  const PROD = 'postgres://tiktrends:secret@db:5432/tiktrends';
  it.each([
    ['verifier-migration.sh', ['--base', PROD]],
    ['restaurer-isole.sh', ['--sauvegarde', '/dev/null', '--base', PROD]],
    ['rollback-local.sh', ['--base', PROD, '--ancien', '/tmp', '--nouveau', '/tmp']],
    ['lancer-et-mesurer.sh', ['--produit', '/tmp', '--base', PROD]],
  ])('%s', (script, args) => {
    const r = spawnSync('bash', [join(OPS, script), ...args], { encoding: 'utf8', env: { ...process.env, PATH: process.env.PATH ?? '' } });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/ARRÊT · garde · base non locale/);
  });
  it('mesurer-parcours.mjs refuse une app non locale', () => {
    const r = spawnSync(process.execPath, [join(OPS, 'mesurer-parcours.mjs'), '--app', 'https://app.tiktrends.co', '--secret', 'x', '--utilisateur', 'u', '--marque', 'm'], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/app non locale refusée/);
  });
});

describe('semis synthétiques', () => {
  it('le semis refuse une base qui ne s’appelle pas l9_* (exécuté sur Postgres en mémoire)', async () => {
    const pg = new PGlite();
    for (const f of ['semis-synthetique.sql', 'semis-studios.sql']) {
      const sql = readFileSync(join(OPS, f), 'utf8').replace(/^\\set .*$/gm, '');
      await expect(pg.exec(sql)).rejects.toThrow(/refusé sur la base « postgres » \(préfixe l9_ exigé\)/);
    }
    await pg.close();
  });

  it('les versions semées portent contenuVide() et son empreinte canonique exacte', () => {
    const sql = readFileSync(join(OPS, 'semis-studios.sql'), 'utf8');
    const contenu = /'(\{"brief": null[^']*)'::jsonb/.exec(sql)?.[1];
    expect(contenu, 'contenu de version introuvable dans semis-studios.sql').toBeTruthy();
    expect(JSON.parse(contenu!)).toEqual(contenuVide());
    const empreinte = /'([a-f0-9]{64})', p\.owner_id/.exec(sql)?.[1];
    expect(empreinte).toBe(empreinteContenu(contenuVide()));
  });
});

/**
 * `verifier-migration.sh` contre de faux `psql` et `pnpm` (aucune base, aucun migrateur) · on lit
 * le RÉSULTAT : quelles tables le script a interrompues (verrou, puis coupure ou échec du
 * migrateur), et s'il va jusqu'au VERDICT.
 *
 * Le défaut réparé · deux tubes terminés par un lecteur qui s'arrête tôt, sous `pipefail` :
 *
 *  · `cut -f1 avant-colonnes.tsv | grep -qx "$t"` · `grep -q` sort dès la table lue, `cut` prend
 *    SIGPIPE (141) s'il lui reste à écrire, le tube « échoue » et la table présente est SAUTÉE en
 *    silence comme point d'interruption · le contrôle couvre moins que prévu et conclut quand même ;
 *  · `bloque="$(psql … | head -1)"` · même course, et sous `set -e` l'affectation en échec arrête
 *    le script sans VERDICT.
 *
 * Mesures (21/11/2026, 4 cœurs partagés, charge 12 à 19, faux outils de ce fichier, 4 passages
 * en parallèle) · passages de l'ANCIEN script où `brands` n'est PAS interrompue, selon le volume
 * écrit par `cut` APRÈS la ligne `brands`. Ce sont des lignes vides : le relevé d'empreintes les
 * saute, alors qu'autant de vrais noms de tables ferait dépasser à la requête d'empreintes la
 * limite d'un argument (128 Kio) :
 *
 *   octets après brands    16 384   65 536   100 000   120 000   150 000   200 000   300 000
 *   brands sautée          10/100   64/100    82/100    85/100   100/100   100/100   100/100
 *
 * (Le tampon du tube, 64 Kio, plus la première lecture de `grep` : au-delà, `cut` écrit
 * forcément après la sortie de `grep`.) BAVARD_COLONNES · 300 000, deux fois le premier volume
 * certain. Le script corrigé : 0/20 à 300 000.
 *
 * Second tube · le faux `psql` écrit, ligne à ligne, d'autres pid après le premier. Passages de
 * l'ANCIEN script arrêtés avant le VERDICT :
 *
 *   pid après le premier        1    1 000   10 000   40 000
 *   arrêts                 29/100   90/100   99/100  300/300
 *
 * Un seul autre pid bloqué suffisait déjà. BAVARD_BLOQUES · 80 000, deux fois le premier volume
 * certain. Le script corrigé : 0/100 à 1 comme à 40 000.
 */
const BAVARD_COLONNES = '300000';
const BAVARD_BLOQUES = '80000';

const FAUX_PSQL = `#!/bin/bash
q=""; prev=""; for a in "$@"; do [ "$prev" = -c ] && q="$a"; prev="$a"; done
printf '%s\\n' "\${q//$'\\n'/ }" >> "$JOURNAL_PSQL"
case "$q" in
  *"from drizzle.__drizzle_migrations"*) cat "$FAUX_MIGRATIONS" ;;
  *"string_agg(quote_ident(a.attname)"*)
    printf 'brands\\tid,name\\n'
    # Relevé d'AVANT seulement · BAVARD_COLONNES octets (lignes vides) APRÈS la ligne cherchée.
    if [ ! -e "$JOURNAL_PSQL.avant" ]; then : > "$JOURNAL_PSQL.avant"; head -c "\${BAVARD_COLONNES:-0}" /dev/zero | tr '\\0' '\\n'; fi ;;
  *"from pg_locks l join pg_stat_activity a"*) echo 1 ;;
  *"pg_blocking_pids"*)
    # Le migrateur bloqué : BLOQUE, puis BAVARD_BLOQUES autres pid, un write par ligne, par CE processus.
    if [ -n "\${BLOQUE:-}" ]; then echo "$BLOQUE"; for ((i = 1; i <= \${BAVARD_BLOQUES:-0}; i++)); do echo "$((100000 + i))"; done; fi ;;
esac
exit 0
`;
const FAUX_PNPM = '#!/bin/bash\necho "faux migrateur · échec voulu" >&2\nexit 1\n';

describe('verifier-migration.sh · sorties bavardes, aucun point d’interruption sauté', () => {
  const DRIZZLE = join(process.cwd(), '../../packages/db/drizzle');
  let racine = '';
  let bin = '';
  let migrations = '';

  beforeAll(() => {
    racine = mkdtempSync(join(tmpdir(), 'l9-sigpipe-'));
    bin = join(racine, 'bin');
    mkdirSync(bin);
    for (const [nom, corps] of [['psql', FAUX_PSQL], ['pnpm', FAUX_PNPM]] as const) {
      writeFileSync(join(bin, nom), corps);
      chmodSync(join(bin, nom), 0o755);
    }
    // La base a tout le journal SAUF à partir de la dernière migration qui modifie `brands` :
    // le lot en attente touche `brands`, la seule table existante relevée par le faux psql.
    const entrees = (JSON.parse(readFileSync(join(DRIZZLE, 'meta/_journal.json'), 'utf8')) as { entries: { when: number; tag: string }[] }).entries;
    const sql = (tag: string) => readFileSync(join(DRIZZLE, `${tag}.sql`));
    const premiere = entrees.map((e) => /ALTER TABLE "brands"/.test(sql(e.tag).toString())).lastIndexOf(true);
    expect(premiere, 'aucune migration ne modifie brands').toBeGreaterThan(0);
    migrations = join(racine, 'migrations.tsv');
    writeFileSync(migrations, entrees.slice(0, premiere).map((e) => `${e.when}\t${createHash('sha256').update(sql(e.tag)).digest('hex')}\n`).join(''));
  });
  afterAll(() => rmSync(racine, { recursive: true, force: true }));

  function verifier(args: string[], env: Record<string, string>) {
    const d = mkdtempSync(join(racine, 'passage-'));
    const journal = join(d, 'psql.log');
    const r = spawnSync('bash', [join(OPS, 'verifier-migration.sh'), '--base', 'postgres://postgres@127.0.0.1:5433/l9_sigpipe', '--sortie', join(d, 'sortie'), ...args], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, JOURNAL_PSQL: journal, FAUX_MIGRATIONS: migrations, ...env },
    });
    const appels = readFileSync(journal, 'utf8');
    const sortie = `${r.stdout}${r.stderr}`;
    return {
      code: r.status,
      sortie,
      // Les tables INTERROMPUES, lues dans la sortie du script (une étiquette par interruption).
      // Pas dans le journal du faux psql : le verrou tourne en arrière-plan, et le script peut le
      // tuer avant qu'il ait écrit sa ligne (constaté sous charge dans les portes).
      interrompues: [...new Set([...sortie.matchAll(/interruption-\d+-(?:coupure|echec)-([a-z_0-9]+) · /g)].map((m) => m[1]))],
      appels,
    };
  }

  it('relevé des tables bavard · brands, modifiée par le lot en attente, est bien un point d’interruption', () => {
    const r = verifier([], { BAVARD_COLONNES });
    expect(r.interrompues, `point d’interruption SAUTÉ en silence · ${r.sortie.split('\n').slice(0, 6).join(' | ')}`).toEqual(['brands']);
    expect(r.sortie).toMatch(/^VERDICT · /m);
  }, 120_000);

  it('migrateur bloqué, liste de pid bavarde · le premier pid est retenu et coupé, le script va au VERDICT', () => {
    const r = verifier(['--points', 'brands'], { BLOQUE: '4242', BAVARD_BLOQUES });
    expect(r.sortie, 'script arrêté avant le VERDICT').toMatch(/^VERDICT · /m);
    expect(r.sortie).toContain('migrateur (pid 4242) bloqué');
    expect(r.appels).toContain('select pg_terminate_backend(4242)');
  }, 120_000);
});
