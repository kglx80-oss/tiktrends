import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
