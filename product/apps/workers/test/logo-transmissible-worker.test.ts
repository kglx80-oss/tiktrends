import { describe, it, expect, beforeAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { schema } from '@tiktrends/db';
import { idLogoMarque } from '@tiktrends/core';
import { hacherImage, resoudreMedias } from '../src/studios/fournisseurs';
import type { BaseStudio } from '../src/studios/types';
import { pgMemoire } from './pg-memoire';

/**
 * Worker studio · une adresse de logo enregistrée AVANT le contrôle
 * d'écriture (`http:`, IP privée, `javascript:`) ne part jamais au fournisseur.
 * Vraie base (pglite, migrations réelles) · on lit le RÉSULTAT de
 * `resoudreMedias` (l'adresse transmise ou non), jamais la présence d'un appel.
 * La base n'est pas réécrite : la ligne de la marque reste telle quelle.
 */
let base: BaseStudio;
const ws = randomUUID();
const brand = randomUUID();
const OK = 'https://cdn.exemple.fr/logo.png';
const HTTP = 'http://ancien-site.fr/logo.png';
const META = 'https://169.254.169.254/latest/meta-data';
const JS = 'javascript:alert(1)';
const DATA_PNG = 'data:image/png;base64,iVBORw0KGgo=';
const BUCKET = `https://s3.gra.exemple.invalid/tt/assets/${ws}/1-abcd1234-logo.png`;
const stockage = { endpoint: 's3.gra.exemple.invalid', bucket: 'tt', region: 'gra', accessKeyId: 'k', secretAccessKey: 's' };
const id = (u: string) => idLogoMarque(brand, hacherImage(u).sha256);

beforeAll(async () => {
  base = await pgMemoire();
  await base.insert(schema.workspaces).values({ id: ws, name: 'W', plan: 'core' });
  await base.insert(schema.brands).values({ id: brand, workspaceId: ws, name: 'B', logoUrl: HTTP, logos: [HTTP, OK, META, JS, DATA_PNG, BUCKET] });
});

describe('resoudreMedias · logos de la marque', () => {
  it('https public, image embarquée et fichier de l’espace partent ; http, IP et javascript: jamais', async () => {
    const r = await resoudreMedias(base, { workspaceId: ws, brandId: brand }, [OK, DATA_PNG, BUCKET, HTTP, META, JS].map(id), stockage);
    const parId = new Map(r.map((m) => [m.assetId, m]));
    expect(parId.get(id(OK))).toMatchObject({ etat: 'autorise', url: OK });
    expect(parId.get(id(DATA_PNG))).toMatchObject({ etat: 'autorise', url: DATA_PNG });
    // Fichier du bucket de l'espace · transmis par lecture signée.
    expect(parId.get(id(BUCKET))).toMatchObject({ etat: 'autorise' });
    expect((parId.get(id(BUCKET)) as { url: string }).url).toContain('X-Amz-Signature=');
    for (const u of [HTTP, META, JS]) {
      expect(parId.get(id(u)), u).toMatchObject({ etat: 'sans_media' });
      expect(JSON.stringify(parId.get(id(u))), u).not.toContain(u);
    }
    // Rien n'est réécrit en base.
    const [b] = await base.select({ logoUrl: schema.brands.logoUrl, logos: schema.brands.logos }).from(schema.brands);
    expect(b).toEqual({ logoUrl: HTTP, logos: [HTTP, OK, META, JS, DATA_PNG, BUCKET] });
  });
});
