import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decisionFournisseurStudio } from '@tiktrends/core';

/**
 * Le worker Studios en production · `decisionFournisseurStudio` refuse le
 * fournisseur réel hors `NODE_ENV=production`. Ni `Dockerfile.workers` ni
 * `.env.deploy.example` ne le posaient : en ligne, le worker aurait écrit
 * « worker studio non démarré » et laissé chaque job en file. Le compose de
 * PRODUCTION le pose ; celui de la recette, non (son accord reste explicite).
 */
const PRODUIT = join(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Le bloc d'un service (lignes indentées sous `  <nom>:`) d'un fichier compose. */
function blocService(compose: string, nom: string): string {
  const lignes = compose.split('\n');
  const debut = lignes.findIndex((l) => l === `  ${nom}:`);
  if (debut === -1) return '';
  const fin = lignes.findIndex((l, k) => k > debut && /^ {0,2}\S/.test(l));
  return lignes.slice(debut + 1, fin === -1 ? undefined : fin).filter((l) => !l.trim().startsWith('#')).join('\n');
}

/** L'environnement que compose donne au service : `environment:` en clé: valeur. */
function environnement(bloc: string): Record<string, string> {
  const env: Record<string, string> = {};
  const k = bloc.indexOf('    environment:');
  if (k === -1) return env;
  for (const l of bloc.slice(k).split('\n').slice(1)) {
    const m = /^ {6}([A-Z0-9_]+):\s*"?([^"\s]*)"?\s*$/.exec(l);
    if (!m) break;
    env[m[1]!] = m[2]!;
  }
  return env;
}

describe('worker Studios · fournisseur réel branché en production', () => {
  const PROD = readFileSync(join(PRODUIT, 'docker-compose.yml'), 'utf8');
  const RECETTE = readFileSync(join(PRODUIT, 'docker-compose.recette.yml'), 'utf8');

  it('le compose de production pose NODE_ENV=production sur workers', () => {
    expect(environnement(blocService(PROD, 'workers')).NODE_ENV).toBe('production');
  });

  it('avec ce seul environnement (et une clé, un stockage), le worker branche fal', () => {
    const env: Record<string, string> = { ...environnement(blocService(PROD, 'workers')), FAL_KEY: 'cle-reelle', S3_ENDPOINT: 'e', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'i', S3_SECRET_ACCESS_KEY: 's' };
    expect(decisionFournisseurStudio(env)).toMatchObject({ ok: true });
    const sans = { ...env };
    delete sans.NODE_ENV;
    expect(decisionFournisseurStudio(sans)).toMatchObject({ ok: false });
  });

  it('l’image ne le fige pas · la recette garde son accord explicite', () => {
    expect(readFileSync(join(PRODUIT, 'Dockerfile.workers'), 'utf8')).not.toMatch(/NODE_ENV/);
    expect(RECETTE).not.toMatch(/NODE_ENV:\s*"?production/);
  });
});

describe('vidéo finale · ffmpeg dans l’image web', () => {
  it('l’étape servie de Dockerfile.web installe ffmpeg (et donc ffprobe), avant les copies', () => {
    const web = readFileSync(join(PRODUIT, 'Dockerfile.web'), 'utf8');
    const servie = web.slice(web.indexOf('AS run'));
    const apk = servie.indexOf('apk add --no-cache ffmpeg');
    expect(apk, 'ffmpeg absent de l’image web servie · l’assemblage de la vidéo finale échouerait').toBeGreaterThan(-1);
    expect(apk < servie.indexOf('COPY --from=build'), 'installé après les copies : réinstallé à chaque commit').toBe(true);
  });
});
