import { describe, expect, it } from 'vitest';
import { destinationLocaleAutorisee } from '../../../packages/db/scripts/seed-fixtures.mjs';

/**
 * La recette de fixtures ne doit JAMAIS tourner ailleurs que sur une base locale
 * dédiée · un `seed` lâché sur la production écraserait des données réelles. Le
 * garde est éprouvé en le faisant TOMBER : chaque destination interdite doit être
 * refusée, chaque condition d'autorisation doit être nécessaire. Si le garde
 * devenait un `return { ok: true }`, la moitié de ces cas casserait.
 */
describe('Recette · garde de destination', () => {
  const OK = 'oui-base-locale';

  it('accepte une base locale confirmée', () => {
    expect(destinationLocaleAutorisee('postgresql://postgres@127.0.0.1:5433/tiktrends', OK)).toEqual({ ok: true });
    expect(destinationLocaleAutorisee('postgres://u@localhost/db', OK).ok).toBe(true);
  });

  it('refuse tout hôte non local', () => {
    for (const url of [
      'postgresql://u:p@db.prod.ovh.net:5432/tiktrends',
      'postgresql://u:p@ep-cool-name.eu-central-1.aws.neon.tech/db',
      'postgresql://u:p@10.0.0.5/db',
      'postgres://u@monvps.51.255.39.79/db',
    ]) {
      const r = destinationLocaleAutorisee(url, OK);
      expect(r.ok, `${url} aurait dû être refusée`).toBe(false);
      if (!r.ok) expect(r.raison).toMatch(/local/i);
    }
  });

  it('exige la confirmation explicite, même en local', () => {
    expect(destinationLocaleAutorisee('postgresql://postgres@127.0.0.1:5433/tiktrends', undefined).ok).toBe(false);
    expect(destinationLocaleAutorisee('postgresql://postgres@127.0.0.1:5433/tiktrends', 'oui').ok).toBe(false);
  });

  it('refuse une URL absente ou illisible', () => {
    expect(destinationLocaleAutorisee(undefined, OK).ok).toBe(false);
    expect(destinationLocaleAutorisee('pas-une-url', OK).ok).toBe(false);
  });
});
