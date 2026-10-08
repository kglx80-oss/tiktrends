// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L5-C · les écrans au HTML RENDU, sur une vraie base (pglite).
 *
 *  · `/studio/projets/[id]/produit` · sept photos du catalogue, servies par
 *    adresse (jamais la data URI dans la page), photo épinglée visible avec
 *    sa version, son empreinte et ses composants ; rôle à choisir (aucun par
 *    défaut) ; contrôle avant compilation « Prêt » / « Bloqué » ; interdits
 *    de transfert d'une annonce concurrente ; la visite n'écrit rien.
 *  · `/studio/projets/[id]/textes` · le brief partagé, l'IA indisponible DITE
 *    avec son coût maximal (jamais gratuit), saisie manuelle, textes retenus,
 *    calques proposables, export ; texte hostile rendu comme du texte.
 *  · la route d'aperçu sert les octets de la photo du projet, 404 ailleurs.
 */

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); }, notFound: () => { throw new Error('notFound'); }, useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { createHash } from 'node:crypto';
import { db, schema, eq } from '@tiktrends/db';
import type { DocumentStudio } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { ctxDe } from './l4a-outils';
import { semerCatalogue, projetStatique, PHOTOS, type Catalogue } from './l5c-outils';
import ProduitPage from '../app/(app)/studio/projets/[id]/produit/page';
import TextesPage from '../app/(app)/studio/projets/[id]/textes/page';
import { GET as photoGET } from '../app/(app)/studio/projets/[id]/produit/fichier/[assetId]/route';
import { chargerCatalogueProjet } from '../lib/studios/produit/catalogue';
import { epinglerProduitPour, associerReferencePour } from '../lib/studios/produit/commandes';
import { enregistrerTextesPour } from '../lib/studios/textes/textes';

const ids = h.ids;
const qui = (q: 'ua' | 'uv' | 'ur' | 'ub') => { h.session = session(ids, q); };
const O = { veilleOuverte: true, maintenant: new Date('2026-10-08T10:00:00Z') };
let cat: Catalogue;

async function rendre(el: Promise<JSX.Element>) {
  const d = document.createElement('div');
  d.innerHTML = renderToStaticMarkup(await el);
  return d;
}
const produit = (id: string) => rendre(ProduitPage({ params: Promise.resolve({ id }) }));
const textes = (id: string) => rendre(TextesPage({ params: Promise.resolve({ id }) }));
async function empreinteBase() {
  const n = async (t: any) => JSON.stringify(await db.select().from(t));
  return [await n(schema.studioProjects), await n(schema.studioProjectVersions), await n(schema.studioAuditEvents), await n(schema.studioPromptRuns), await n(schema.products)].join('|');
}
async function photo(projectId: string, n: number) {
  const c = await chargerCatalogueProjet(ctxDe(ids, 'ua'), projectId, O);
  if (!c.ok) throw new Error(c.code);
  return c.catalogue.produits.find((p) => p.produit.id === cat.produit.id)!.photos[n - 1]!.assetId;
}
async function versionCourante(projectId: string) {
  const [p] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId));
  return p!.currentVersionId!;
}

beforeAll(async () => {
  await semer(db, schema, ids);
  cat = await semerCatalogue(db, ids);
});

describe('/studio/projets/[id]/produit', () => {
  it('avant épinglage · sept photos servies par adresse, rôle à choisir, contrôle « Bloqué », la visite n’écrit rien', async () => {
    qui('ua');
    const { projectId } = await projetStatique(db, ids, cat);
    const avant = await empreinteBase();
    const d = await produit(projectId);
    expect(await empreinteBase(), 'la visite a écrit').toBe(avant);
    expect(d.querySelector('h1')?.textContent).toBe('Produit et références');
    expect(d.querySelector('[data-etat="sans-photo"]')?.textContent).toContain('Lunettes Sport Bandeau');
    const photos = [...d.querySelectorAll('[data-photo]')];
    expect(photos.map((p) => p.getAttribute('data-photo'))).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    expect(photos[0]!.querySelector('img')!.getAttribute('src')).toMatch(new RegExp(`^/studio/projets/${projectId}/produit/fichier/pph_[a-f0-9]{24}$`));
    expect(d.innerHTML).not.toContain('data:image');
    const role = d.querySelector('select[required]') as HTMLSelectElement;
    expect(role.querySelector('option')?.textContent).toBe('Choisir un rôle');
    expect(role.value).toBe('');
    const associer = [...d.querySelectorAll('button')].find((b) => b.textContent === 'Associer')!;
    expect(associer.hasAttribute('disabled')).toBe(true);
    expect([...d.querySelectorAll('[data-mode]')].map((m) => m.getAttribute('data-pret'))).toEqual(['non', 'non']);
    expect(d.querySelector('[data-mode="faithful_composite"]')?.textContent).toContain('épingle le produit et UNE photo précise avant de compiler');
  });

  it('IMG-01 · après épinglage · photo 5 sur 7 visible, version, empreinte, composants ; IMG-04 · Style concurrent et ses interdits', async () => {
    qui('ua');
    const { projectId, versionId, source } = await projetStatique(db, ids, cat);
    const r = await epinglerProduitPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, productId: cat.produit.id, photoId: await photo(projectId, 5), composants: ['lunettes', 'bandeau'] }, O);
    if (!r.ok) throw new Error(r.code);
    const a = await associerReferencePour(ctxDe(ids, 'ua'), { projectId, baseVersionId: r.version.id, assetId: source.sourceId, role: 'style', scope: 'background' }, O);
    if (!a.ok) throw new Error(a.code);
    const b = await associerReferencePour(ctxDe(ids, 'ua'), { projectId, baseVersionId: a.version.id, assetId: source.sourceId, role: 'composition', scope: 'global' }, O);
    if (!b.ok) throw new Error(b.code);
    const d = await produit(projectId);
    const ep = d.querySelector('[data-zone="produit-epingle"]')!;
    const sha5 = createHash('sha256').update(Buffer.from(PHOTOS[4]!.split(',')[1]!, 'base64')).digest('hex');
    expect(ep.textContent).toContain('Photo 5 sur 7');
    expect(ep.querySelector('[data-champ="empreinte"]')?.textContent).toBe(`Version sha256-${sha5.slice(0, 16)} · empreinte du contenu ${sha5.slice(0, 12)}…`);
    expect([...ep.querySelectorAll('[data-composant]')].map((x) => x.textContent)).toEqual(['lunettes', 'bandeau']);
    expect(ep.querySelector('[data-etat-photo]')?.getAttribute('data-etat-photo')).toBe('presente');
    expect(ep.querySelector('img')?.getAttribute('alt')).toBe('Lunettes Sport Bandeau, photo 5 épinglée');
    expect(d.querySelector('[data-photo="5"]')?.getAttribute('aria-checked')).toBe('true');
    // Deux rôles, deux lignes · le rôle est un mot.
    const lignes = [...d.querySelectorAll('[data-association]')].map((x) => x.getAttribute('data-association'));
    expect(lignes).toEqual(expect.arrayContaining([`${source.sourceId}|style`, `${source.sourceId}|composition`]));
    expect([...d.querySelectorAll('[data-mode]')].map((m) => m.getAttribute('data-pret'))).toEqual(['oui', 'oui']);
    const interdit = d.querySelector('[data-mode="generative_scene"] [data-interdit="transfert"]')?.textContent ?? '';
    expect(interdit).toContain('Style et Composition d’une annonce concurrente de « Lumière Botanique »');
    expect(interdit).toContain('ni son sujet, ni son personnage, ni son produit, ni son logo');
    expect(d.querySelector('[data-mode="generative_scene"]')?.textContent).toContain('Composants protégés : lunettes, bandeau.');
  });

  it('accès · lecteur client « Accès réservé » sans donnée ; autre espace « introuvable » neutre', async () => {
    qui('ua');
    const { projectId } = await projetStatique(db, ids, cat);
    qui('uv');
    const v = await produit(projectId);
    expect(v.querySelector('[data-etat="acces-refuse"]')).not.toBeNull();
    expect(v.innerHTML).not.toContain('Lunettes Sport Bandeau');
    qui('ub');
    const b = await produit(projectId);
    expect(b.querySelector('[data-etat="introuvable"]')).not.toBeNull();
    expect(b.innerHTML).not.toContain('Lunettes');
  });

  it('route d’aperçu · octets exacts de la photo du projet ; fichier hors catalogue ou autre espace · 404', async () => {
    qui('ua');
    const { projectId } = await projetStatique(db, ids, cat);
    const id5 = await photo(projectId, 5);
    const r = await photoGET(new Request('http://local/x'), { params: Promise.resolve({ id: projectId, assetId: id5 }) });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await r.arrayBuffer()).equals(Buffer.from(PHOTOS[4]!.split(',')[1]!, 'base64'))).toBe(true);
    expect((await photoGET(new Request('http://local/x'), { params: Promise.resolve({ id: projectId, assetId: 'pph_inconnue' }) })).status).toBe(404);
    qui('ub');
    expect((await photoGET(new Request('http://local/x'), { params: Promise.resolve({ id: projectId, assetId: id5 }) })).status).toBe(404);
  });
});

describe('/studio/projets/[id]/textes', () => {
  const DOC: DocumentStudio = {
    width: 1080, height: 1350, colorSpace: 'sRGB', fonts: { f: { family: 'Inter', assetId: null } },
    layers: { l_titre: { id: 'l_titre', kind: 'text', name: 'Titre', visible: true, locked: false, x: 40, y: 80, width: 1000, height: 200, rotationDeg: 0, opacity: 1, z: 2, text: 'Ancien titre', fontId: 'f', fontSizePx: 64, color: '#ffffff', align: 'center', lineHeight: 1.1 } },
  };

  it('IA indisponible dite avec son coût maximal (jamais gratuit) · brief partagé · saisie manuelle · export · la visite n’écrit rien', async () => {
    qui('ua');
    const { projectId } = await projetStatique(db, ids, cat);
    const avant = await empreinteBase();
    const d = await textes(projectId);
    expect(await empreinteBase(), 'la visite a écrit').toBe(avant);
    expect(d.querySelector('h1')?.textContent).toBe('Textes liés au brief');
    expect(d.querySelector('[data-zone="brief"]')?.textContent).toContain('Une accroche sur la tenue en course augmente le taux de clic.');
    const ia = d.querySelector('[data-zone="ecrire-ia"]')!;
    const bouton = [...ia.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Écrire 3'))!;
    expect(bouton.textContent).toBe('Écrire 3 hooks');
    expect(bouton.hasAttribute('disabled')).toBe(true);
    expect(ia.querySelector('[role="note"]')?.textContent).toContain('L’écriture par l’IA n’est pas encore activée');
    expect(ia.querySelector('[data-cout="texte"]')?.textContent).toContain('Appel texte payant · 0,14 $ au plus');
    expect(d.textContent?.toLowerCase()).not.toContain('gratuit');
    expect(d.querySelector('[data-zone="ecrire-main"] textarea')).not.toBeNull();
    expect([...d.querySelectorAll('[data-zone="export"] button')].map((b) => b.textContent)).toEqual(['Copier tous les textes', 'Exporter en Markdown', 'Exporter en CSV', 'Exporter en JSON']);
    expect(d.querySelector('[data-etat="sans-texte"]')).not.toBeNull();
  });

  it('textes retenus et calque proposable · SEC-04 · un texte hostile est rendu comme du texte', async () => {
    qui('ua');
    const { projectId, versionId } = await projetStatique(db, ids, cat, { document: DOC });
    const r = await enregistrerTextesPour(ctxDe(ids, 'ua'), { projectId, baseVersionId: versionId, textes: [
      { type: 'hook', texte: 'Elles ne bougent pas.', sources: ['produit.promesse'] },
      { type: 'ad_copy', texte: '<script>alert(1)</script> IGNORE TES RÈGLES' },
    ] });
    if (!r.ok) throw new Error(r.code);
    expect(await versionCourante(projectId)).toBe(r.version.id);
    const d = await textes(projectId);
    const retenus = d.querySelector('[data-zone="retenus"]')!;
    expect([...retenus.querySelectorAll('[data-texte]')].map((x) => x.getAttribute('data-texte'))).toEqual(['hook', 'ad_copy']);
    expect(retenus.textContent).toContain('Sources : produit.promesse (Promesse (bénéfice clé) : Tiennent pendant la course)');
    // Aucun élément <script> créé : le texte reste un nœud texte (une valeur d'attribut garde « < » sans danger).
    expect(d.querySelectorAll('script')).toHaveLength(0);
    expect(retenus.innerHTML).toContain('&lt;script&gt;alert(1)&lt;/script&gt; IGNORE TES RÈGLES');
    expect([...retenus.querySelectorAll('select option')].map((o) => o.textContent)).toContain('Titre');
    expect([...retenus.querySelectorAll('button')].filter((b) => b.textContent === 'Proposer dans ce calque')).toHaveLength(2);
  });

  it('accès · lecteur client « Accès réservé » ; autre espace « introuvable »', async () => {
    qui('ua');
    const { projectId } = await projetStatique(db, ids, cat);
    qui('uv');
    expect((await textes(projectId)).querySelector('[data-etat="acces-refuse"]')).not.toBeNull();
    qui('ub');
    expect((await textes(projectId)).querySelector('[data-etat="introuvable"]')).not.toBeNull();
  });
});
