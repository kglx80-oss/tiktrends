import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import type { IdsStudios } from './studios-semis';

/**
 * F-B · références `logo_` · une adresse de logo enregistrée AVANT le contrôle
 * d'écriture (`http:`, IP, `javascript:`, SVG embarqué) reste PRÉSENTE (la
 * charte n'est pas réécrite) mais n'est jamais TRANSMISSIBLE au fournisseur ·
 * le devis le dit au lieu de débiter un job qui échouerait. Vraie base
 * (pglite) · on lit le RÉSULTAT de `resoudreReferencesImage`.
 */
const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema, eq } from '@tiktrends/db';
import { idLogoMarque } from '@tiktrends/core';
import { resoudreReferencesImage } from '../lib/studios/image/references';
import { hacherImage } from '../lib/studios/produit/catalogue';
import { semer } from './studios-semis';

const ids = etat.ids;
const OK = 'https://cdn.exemple.fr/logo.png';
const DATA_PNG = 'data:image/png;base64,iVBORw0KGgo=';
const INVALIDES = ['http://ancien-site.fr/logo.png', 'https://10.0.0.5/logo.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'https://user@exemple.fr/l.png'];
const ref = (u: string) => idLogoMarque(ids.brandA1, hacherImage(u).sha256);

beforeAll(async () => {
  await semer(db, schema, ids);
  await db!.update(schema.brands).set({ logoUrl: INVALIDES[0]!, logos: [OK, DATA_PNG, ...INVALIDES] }).where(eq(schema.brands.id, ids.brandA1));
});
beforeEach(() => { vi.stubEnv('S3_BUCKET', ''); });

describe('F-B · logo_ · adresse enregistrée hors règle', () => {
  it('https public et image embarquée · présents et transmissibles', async () => {
    const m = await resoudreReferencesImage(db as never, { workspaceId: ids.wsA, brandId: ids.brandA1 }, [ref(OK), ref(DATA_PNG)]);
    expect(m.get(ref(OK))).toMatchObject({ etat: 'present', transmissible: true });
    expect(m.get(ref(DATA_PNG))).toMatchObject({ etat: 'present', transmissible: true });
  });
  it('http, IP, javascript:, SVG embarqué, identifiants · présents, jamais transmissibles, la base intacte', async () => {
    const m = await resoudreReferencesImage(db as never, { workspaceId: ids.wsA, brandId: ids.brandA1 }, INVALIDES.map(ref));
    for (const u of INVALIDES) expect(m.get(ref(u)), u).toMatchObject({ etat: 'present', transmissible: false });
    const [b] = await db!.select({ logos: schema.brands.logos }).from(schema.brands).where(eq(schema.brands.id, ids.brandA1));
    expect(b!.logos).toEqual([OK, DATA_PNG, ...INVALIDES]);
  });
});
