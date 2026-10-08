// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L4-B · les écrans, au HTML RENDU, sur une vraie base (pglite).
 *
 *  · `/studio/projets` · premier usage, rempli (marque, type, étape, manques,
 *    date), vide pour la marque active, accès refusé · aucune écriture à la visite.
 *  · `/studio/projets/[id]` · marque et version visibles, brief complet,
 *    hypothèse, variable, produit, complétude, sources (tombstone compris),
 *    historique, export, deux emplacements réservés · introuvable neutre hors portée.
 */

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, active: null as { id: string; name: string } | null }));
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
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => h.active, listBrands: async () => [] }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); }, notFound: () => { throw new Error('notFound'); }, useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { db, schema, eq } from '@tiktrends/db';
import { session, semer } from './studios-semis';
import ProjetsPage from '../app/(app)/studio/projets/page';
import ProjetPage from '../app/(app)/studio/projets/[id]/page';
import { creerProjetDepuisSources } from '../app/actions/studios/sources';

const ids = h.ids;
const qui = (q: 'ua' | 'uv' | 'ur' | 'ub') => { h.session = session(ids, q); };
const ANNONCE = {
  id: '9001', platform: 'meta', daysRunning: 64, mediaType: 'image', thumbnailUrl: 'https://cdn.exemple.test/v.jpg',
  advertiserName: 'Lumière Botanique', body: 'Votre peau mérite mieux. Notre sérum à 12 % de vitamine C efface les taches.', callToAction: 'Acheter', landingDomain: 'lbcosmetiques.fr',
};
let projet = '';
let projetSauvegarde = '';

const liste = async (sp: Record<string, string> = {}) => {
  const d = document.createElement('div');
  d.innerHTML = renderToStaticMarkup(await ProjetsPage({ searchParams: Promise.resolve(sp) }));
  return d;
};
const fiche = async (id: string, sp: Record<string, string> = {}) => {
  const d = document.createElement('div');
  d.innerHTML = renderToStaticMarkup(await ProjetPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(sp) }));
  return d;
};
async function empreinteBase() {
  const n = async (t: any) => JSON.stringify(await db.select().from(t));
  return [await n(schema.studioProjects), await n(schema.studioProjectVersions), await n(schema.studioAuditEvents), await n(schema.savedAds), await n(schema.studioPromptRuns)].join('|');
}

beforeAll(async () => {
  await semer(db, schema, ids);
});

describe('/studio/projets · reprendre un projet', () => {
  it('premier usage · aucun projet · les trois gestes et le chemin vers la Veille', async () => {
    qui('ua'); h.active = null;
    const d = await liste();
    expect(d.querySelector('[data-etat="premier-usage"]')?.textContent).toContain('Préparer une création');
    expect(d.querySelector('a[href="/veille"]')).not.toBeNull();
  });

  it('rempli · marque, type, étape (en mots), ce qui manque, date · et la visite n’écrit rien', async () => {
    qui('ua');
    const a = await creerProjetDepuisSources({
      sources: [{ type: 'veille', annonce: ANNONCE, retour: 'q=serum&p=meta#ad-meta-9001' }], brandId: ids.brandA1, titre: 'Accroche chiffrée · test de rentrée', cleClic: 'clic-rendu-0001',
      hypothese: { origine: 'saisie', saisie: { statement: 'Une accroche chiffrée augmente le clic.', variable: 'Accroche', control: 'Bénéfice', treatment: 'Chiffre', metric: 'Taux de clic (CTR)' } },
    });
    if (!a.ok) throw new Error(a.code);
    projet = a.projet.id;
    const [s] = await db.insert(schema.savedAds).values({ workspaceId: ids.wsA, userId: ids.ua, brandId: ids.brandA2, platform: 'meta', externalId: '7002', snapshot: { ...ANNONCE, id: '7002' } }).returning();
    const b = await creerProjetDepuisSources({ sources: [{ type: 'sauvegarde', id: s!.id }], brandId: ids.brandA2, kind: 'video', cleClic: 'clic-rendu-0002' });
    if (!b.ok) throw new Error(b.code);
    projetSauvegarde = b.projet.id;

    const avant = await empreinteBase();
    h.active = { id: ids.brandA1, name: 'Marque A1' };
    const d = await liste();
    expect(await empreinteBase(), 'la visite a écrit').toBe(avant);
    expect(d.querySelector('[data-etat="rempli"]')).not.toBeNull();
    const cartes = [...d.querySelectorAll('[data-projet]')];
    expect(cartes.map((c) => c.getAttribute('data-projet'))).toEqual([projet]);
    const c = cartes[0]!;
    expect(c.textContent).toContain('Marque A1');
    expect(c.textContent).toContain('Pub statique');
    expect(c.querySelector('[data-etape]')?.textContent).toBe('Brief à compléter');
    expect(c.textContent).toContain('Ce qui manque · Produit de la marque à choisir');
    expect(c.textContent).toMatch(/Modifié le \d{2}\/\d{2}\/\d{4} · version 1 · 1 source/);
    expect(d.textContent).toContain('voir toutes les marques');

    const toutes = await liste({ toutes: '1' });
    expect([...toutes.querySelectorAll('[data-projet]')].map((x) => x.getAttribute('data-projet')).sort()).toEqual([projet, projetSauvegarde].sort());
    expect(toutes.querySelector(`[data-projet="${projetSauvegarde}"]`)?.textContent).toContain('Vidéo');
  });

  it('vide pour la marque active · on le dit et on propose les autres marques', async () => {
    qui('ua'); h.active = { id: ids.brandA2, name: 'Marque A2' };
    await db.update(schema.studioProjects).set({ status: 'archived' }).where(eq(schema.studioProjects.id, projetSauvegarde));
    const d = await liste();
    expect(d.querySelector('[data-etat="vide-marque"]')?.textContent).toContain('Aucun projet pour Marque A2');
    await db.update(schema.studioProjects).set({ status: 'active' }).where(eq(schema.studioProjects.id, projetSauvegarde));
  });

  it('accès refusé · lecteur · aucune donnée de projet', async () => {
    qui('uv'); h.active = null;
    const d = await liste();
    expect(d.querySelector('[data-etat="acces-refuse"]')?.textContent).toContain('Accès réservé');
    expect(d.innerHTML).not.toContain('Accroche chiffrée');
  });
});

describe('/studio/projets/[id] · la page projet', () => {
  it('marque et version visibles, brief, hypothèse, variable, produit, complétude, sources, historique, export, emplacements', async () => {
    qui('ua');
    const avant = await empreinteBase();
    const d = await fiche(projet);
    expect(await empreinteBase(), 'la visite a écrit').toBe(avant);
    expect(d.querySelector('h1')?.textContent).toBe('Accroche chiffrée · test de rentrée');
    expect(d.querySelector(`[data-marque="${ids.brandA1}"]`)?.textContent).toBe('Marque Marque A1');
    expect(d.querySelector('[data-version]')?.textContent).toMatch(/^Version 1 du \d{2}\/\d{2}\/\d{4}$/);
    const hyp = d.querySelector('[data-hypothese="hyp_saisie"]')!;
    expect(hyp.textContent).toContain('Une accroche chiffrée augmente le clic.');
    expect(hyp.textContent).toContain('Variable testée · Accroche');
    expect(hyp.textContent).toContain('Témoin · Bénéfice');
    expect(hyp.textContent).toContain('Mesure · Taux de clic (CTR)');
    expect(d.textContent).toContain('Aucun produit choisi');
    expect(d.querySelector('[data-manque="produit"]')?.textContent).toContain('à faire');
    const src = d.querySelector('[data-source]')!;
    expect(src.getAttribute('data-statut')).toBe('active');
    expect(src.textContent).toContain('Narration · absente · Aucune transcription ni piste audio');
    expect(src.querySelector('a')?.getAttribute('href')).toBe('/veille?q=serum&p=meta#ad-meta-9001');
    expect(d.querySelector('a[href="/veille?q=serum&p=meta#ad-meta-9001"]')?.textContent).toContain('Revenir à la recherche de Veille');
    expect(d.querySelector('[data-version-n="1"]')?.textContent).toContain('courante');
    expect(d.textContent).toContain('Exporter le brief');
    expect(d.querySelector('[data-emplacement="propositions"]')).not.toBeNull();
    // Intégration L4-A · le panneau des propositions est RENDU dans son emplacement, pas seulement réservé.
    expect(d.querySelector('[data-emplacement="propositions"] [data-panneau="propositions"]')?.textContent, 'panneau des propositions absent de la page projet').toContain('Propositions');
    expect(d.querySelector('[data-emplacement="variantes-tests"]')).not.toBeNull();
    // Intégration L4-C · « Variantes et tests » est RENDU dans son emplacement.
    expect(d.querySelector('[data-emplacement="variantes-tests"] #titre-variantes')?.textContent, 'variantes et tests absents de la page projet').toBe('Variantes et tests');
    // Intégration L5 · l'atelier du projet mène aux trois écrans des lots L5-B et L5-C.
    const atelier = [...d.querySelectorAll('nav[aria-label="Atelier du projet"] a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(atelier, 'liens de l’atelier absents de la page projet').toEqual([
      ['Éditer l’image', `/studio/projets/${projet}/image`],
      ['Produit et références', `/studio/projets/${projet}/produit`],
      ['Textes liés au brief', `/studio/projets/${projet}/textes`],
      // L6-A · le studio vidéo du projet.
      ['Vidéo · storyboard et montage', `/studio/projets/${projet}/video`],
      // L6-B · identités des personnages et voix.
      ['Identités et voix', `/studio/projets/${projet}/identites`],
    ]);
    expect(d.innerHTML, 'tiret cadratin à l’écran').not.toContain('—');
    expect(d.innerHTML).not.toMatch(/Trendtrack/i);
  });

  it('source retirée · tombstone affiché, plus de lien ni d’aperçu, observations gardées', async () => {
    qui('ua');
    await db.delete(schema.savedAds).where(eq(schema.savedAds.externalId, '7002'));
    const d = await fiche(projetSauvegarde);
    const src = d.querySelector('[data-source]')!;
    expect(src.getAttribute('data-statut')).toBe('supprimee');
    expect(src.textContent).toContain('Source retirée');
    expect(src.textContent).toContain('observations conservées');
    expect(src.textContent).toContain('La source n’est plus accessible · aucun lien.');
    expect(src.querySelector('img')).toBeNull();
    expect(d.querySelector('[data-manque="source_inaccessible"]')).not.toBeNull();
  });

  it('SEC-01 · autre espace · page neutre « introuvable », aucune donnée', async () => {
    qui('ub');
    const d = await fiche(projet);
    expect(d.querySelector('[data-etat="introuvable"]')).not.toBeNull();
    for (const s of ['Accroche chiffrée', 'Marque A1', 'Lumière', projet]) expect(d.innerHTML, `fuite « ${s} »`).not.toContain(s);
  });

  it('SEC-02 · restreint à A1 · le projet de A2 est introuvable', async () => {
    qui('ur');
    const d = await fiche(projetSauvegarde);
    expect(d.querySelector('[data-etat="introuvable"]')).not.toBeNull();
  });
});
