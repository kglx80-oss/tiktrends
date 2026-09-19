import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * CDC · Lot 0 · « identifier le build » · le commit servi doit remonter jusqu'au
 * bandeau de diagnostic, sinon il dit « inconnu » à vie.
 *
 * Le RÉSULTAT affiché (le bandeau montre le commit, ou « inconnu » s'il manque)
 * est déjà prouvé par rendu dans `diagnostic-deploiement.test.tsx`. Ici on
 * verrouille le CHEMIN qui alimente ce commit en production · un maillon lâché
 * et le bandeau retombe sur « inconnu » sans que rien d'autre ne casse, donc
 * aucun autre test ne s'en aperçoit.
 *
 * Le maillon fragile est l'image Docker · son contexte de build est `product/`,
 * qui ne contient PAS `.git`, et `node:20-alpine` n'a pas git · `next.config`
 * ne peut donc PAS déduire le commit seul (sa tentative `git rev-parse` échoue,
 * il tombe sur `''`). Il faut le lui passer en variable d'environnement au
 * build. Trois maillons :
 *   1. `next.config.mjs` préfère `process.env.BUILD_SHA` et le fige dans l'env
 *      compilé (RÉSULTAT vérifié plus bas en important le module).
 *   2. `Dockerfile.web` déclare l'ARG et le promeut en ENV AVANT `pnpm build`,
 *      sinon la variable n'existe pas quand next compile.
 *   3. `docker-compose.yml` passe l'ARG au service web depuis l'environnement du
 *      déploiement.
 *
 * Fichiers d'infra (Dockerfile, compose) · lecture source · leur exécution
 * réelle exige un build Docker complet, hors de portée d'un test unitaire · le
 * proprio la valide après déploiement (le bandeau doit montrer le SHA, plus
 * « inconnu »).
 */
// `product/` · depuis ce fichier (apps/web/test) on remonte de trois crans.
const PRODUCT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const DOCKERFILE = readFileSync(join(PRODUCT, 'Dockerfile.web'), 'utf8');
const COMPOSE = readFileSync(join(PRODUCT, 'docker-compose.yml'), 'utf8');

describe('le commit du build remonte jusqu’au bandeau de diagnostic', () => {
  it('next.config fige BUILD_SHA fourni par l’environnement dans l’env compilé', async () => {
    // On le pose AVANT l'import · sinon `gitSha()` tenterait `git rev-parse`.
    process.env.BUILD_SHA = 'deadbeef99';
    const mod = await import('../next.config.mjs');
    expect(
      mod.default.env?.BUILD_SHA,
      'next.config doit préférer BUILD_SHA de l’environnement et le figer dans env',
    ).toBe('deadbeef99');
  });

  it('Dockerfile.web déclare l’ARG et le promeut en ENV avant de compiler', () => {
    expect(DOCKERFILE).toContain('ARG BUILD_SHA');
    expect(DOCKERFILE).toContain('ENV BUILD_SHA=$BUILD_SHA');
    const declare = DOCKERFILE.indexOf('ARG BUILD_SHA');
    const build = DOCKERFILE.indexOf('pnpm --filter @tiktrends/web build');
    expect(build, 'l’étape de build doit exister').toBeGreaterThan(-1);
    expect(
      declare < build,
      'BUILD_SHA doit être déclaré AVANT `pnpm build`, sinon absent à la compilation',
    ).toBe(true);
  });

  it('docker-compose passe BUILD_SHA au service web depuis l’environnement', () => {
    // La ligne de build du service web · elle nomme Dockerfile.web ET passe l'arg.
    const ligneWeb = COMPOSE.split('\n').find(
      (l) => l.includes('Dockerfile.web') && l.includes('args'),
    );
    expect(ligneWeb, 'le service web doit passer des args de build').toBeTruthy();
    expect(ligneWeb).toContain('BUILD_SHA');
  });
});
