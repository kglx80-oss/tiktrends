import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Marque · importer un FICHIER de logo · le chemin serveur entier sur une
 * vraie base (pglite) avec les VRAIES actions existantes : l'adresse de dépôt
 * de la Bibliothèque (`presignAssetUploadAction`, aucun réseau · signature
 * locale), la charte calculée par le noyau, puis `saveBrandDAAction`. On relit
 * la marque en base, la carte du logo telle que la page la reçoit, et le HTML
 * du bouton · jamais la présence d'un appel.
 */
const etat = vi.hoisted(() => ({ session: null as null | Record<string, unknown> }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, notFound: () => { throw new Error('NOT_FOUND'); },
  useRouter: () => ({ refresh() {}, push() {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/brands',
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }) }));

import { db, schema, eq } from '@tiktrends/db';
import { RAISON_LOGO_SANS_STOCKAGE, charteAvecLogoImporte } from '@tiktrends/core';
import { presignAssetUploadAction } from '../app/actions/assets';
import { saveBrandDAAction } from '../app/actions/brand-detail';
import { chargerMarque, propsFavicon, propsImportLogo } from '../app/(spatial)/sp/brands/[id]/donnees';
import { CarteFavicon } from '../spatial/vues/marque/base';
import { TEXTE_REFUS_BIBLIOTHEQUE } from '../lib/bibliotheque-acces';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';

const ANCIEN = 'https://site.exemple.invalid/logo.png';
async function marque(plan: string) {
  const ws = randomUUID(); const id = randomUUID(); const user = randomUUID();
  await db.insert(schema.workspaces).values({ id: ws, name: 'Espace', plan });
  await db.insert(schema.users).values({ id: user, email: `${user.slice(0, 8)}@exemple.invalid` });
  await db.insert(schema.brands).values({ id, workspaceId: ws, name: 'Maison', logoUrl: ANCIEN, logos: [ANCIEN], colors: ['#112233'], fonts: ['Inter'] });
  return { ws, id, user };
}
const ouvrir = (m: { ws: string; user: string }, role: string, plan: string) => {
  etat.session = { workspaceId: m.ws, workspaceName: 'Espace', role, plan, user: { id: m.user, email: `${m.user.slice(0, 8)}@exemple.invalid`, name: null } };
};
const lire = async (id: string) => (await db.select().from(schema.brands).where(eq(schema.brands.id, id)))[0]!;
const CTX: CtxSpatial = { utilisateur: { nom: 'M', initiales: 'M', email: 'm@x.fr', role: 'Admin' }, credits: { solde: 0, dotation: 0, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {} };
const carte = (p: Parameters<typeof CarteFavicon>[0]) => renderToStaticMarkup(<FournisseurSpatial value={CTX}><CarteFavicon {...p} /></FournisseurSpatial>);

beforeEach(() => {
  etat.session = null;
  vi.stubEnv('S3_ENDPOINT', 's3.gra.exemple.invalid'); vi.stubEnv('S3_BUCKET', 'tt'); vi.stubEnv('S3_ACCESS_KEY_ID', 'k'); vi.stubEnv('S3_SECRET_ACCESS_KEY', 's');
  vi.stubEnv('S3_PUBLIC_BASE_URL', '');
});

describe('Marque · import d’un fichier de logo · chemin serveur', () => {
  it('admin, offre Core · dépôt dans le bucket de SON espace, le logo devient celui par défaut, l’ancien reste, couleurs et polices intactes', async () => {
    const m = await marque('core');
    ouvrir(m, 'admin', 'core');
    const p = propsImportLogo(await chargerMarque(m.id));
    expect(p.raison).toBeNull();
    expect(p.actions).not.toBeNull();
    const pre = await p.actions!.preparer({ filename: 'logo.png', contentType: 'image/png', sizeBytes: 12_000 });
    expect(pre.error).toBeUndefined();
    expect(pre.publicUrl, 'le fichier est rangé chez CET espace').toContain(`assets/${m.ws}/`);
    const charte = charteAvecLogoImporte({ logos: p.logos, defaut: p.defaut }, pre.publicUrl!);
    expect(await p.actions!.enregistrer({ brandId: m.id, ...charte, colors: [...p.couleurs], fonts: [...p.polices] })).toEqual({ ok: true });
    const b = await lire(m.id);
    expect(b.logoUrl).toBe(pre.publicUrl);
    expect(b.logos).toEqual([ANCIEN, pre.publicUrl]);
    expect(b.colors).toEqual(['#112233']);
    expect(b.fonts).toEqual(['Inter']);
    // La carte relue · le logo importé est affiché (par la route média de la marque, droits relus).
    const f = propsFavicon(await chargerMarque(m.id));
    expect(f.titre).toBe('Logo enregistré dans la charte');
    expect(f.image).toBe(`/api/brands/${m.id}/media?url=${encodeURIComponent(pre.publicUrl!)}`);
    expect(carte(f)).not.toContain('pas encore disponible');
  });

  it('membre · la charte n’est pas réécrite (garde admin de saveBrandDAAction)', async () => {
    const m = await marque('core');
    ouvrir(m, 'member', 'core');
    const r = await saveBrandDAAction({ brandId: m.id, ...charteAvecLogoImporte({ logos: [ANCIEN], defaut: ANCIEN }, 'https://pirate.invalid/x.png'), colors: [], fonts: [] });
    expect(r.error).toBeTruthy();
    const b = await lire(m.id);
    expect(b.logoUrl).toBe(ANCIEN);
    expect(b.colors).toEqual(['#112233']);
  });

  it('admin d’un espace Starter · fermé avec la raison de la Bibliothèque, et le dépôt est refusé au serveur aussi', async () => {
    const m = await marque('starter');
    ouvrir(m, 'admin', 'starter');
    const p = propsImportLogo(await chargerMarque(m.id));
    expect(p.actions).toBeNull();
    expect(p.raison).toBe(TEXTE_REFUS_BIBLIOTHEQUE.plan);
    expect((await presignAssetUploadAction({ filename: 'logo.png', contentType: 'image/png', sizeBytes: 1 })).error).toBe(TEXTE_REFUS_BIBLIOTHEQUE.plan);
    const html = carte(propsFavicon(await chargerMarque(m.id)));
    expect(html).toMatch(/<label class="btn sm" aria-disabled="true" title="[^"]*offre Core/);
    expect(html).toMatch(/<input type="file"[^>]*disabled=""/);
  });

  it('sans stockage · fermé avec sa raison, aucune action transmise', async () => {
    vi.stubEnv('S3_BUCKET', '');
    const m = await marque('core');
    ouvrir(m, 'admin', 'core');
    const p = propsImportLogo(await chargerMarque(m.id));
    expect(p.actions).toBeNull();
    expect(p.raison).toBe(RAISON_LOGO_SANS_STOCKAGE);
  });
});
