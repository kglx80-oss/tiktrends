// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * L4-B · les écrans, au HTML RENDU, sur une vraie base (pglite).
 *
 *  · `/studio/projets` · premier usage, rempli (marque, type, étape, manques,
 *    date), vide pour la marque active, accès refusé · aucune écriture à la visite.
 *  · `/studio/projets/[id]` · l'écran SPATIAL (la fiche V5 est retirée) ·
 *    marque et version visibles, brief complet, hypothèse, variable,
 *    complétude, sources et leur provenance (tombstone compris), retour
 *    Veille, historique, export, propositions, variantes · introuvable neutre
 *    hors portée.
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
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); }, notFound: () => { throw new Error('notFound'); }, usePathname: () => '/studio/projets', useRouter: () => ({ refresh: () => {}, push: () => {} }) }));

import { db, schema, eq } from '@tiktrends/db';
import { session, semer } from './studios-semis';
// Vague 2 · la liste V5 est retirée · la garde passe sur l'écran Spatial servi à `/studio/projets`.
import ProjetsPage from '../app/(spatial)/sp/studio/projets/page';
import { avecSpatial } from './spatial/fournisseur';
// La fiche V5 est retirée · la garde passe sur l'écran Spatial servi à `/studio/projets/[id]`.
import ProjetSpatial from '../app/(spatial)/sp/studio/projets/[id]/page';
import { chargerProjet } from '../app/(spatial)/sp/studio/projets/[id]/donnees';
import { Projet } from '../spatial/vues/projet/Projet';
import type { OngletProjet } from '../spatial/vues/projet/types';
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
  d.innerHTML = renderToStaticMarkup(avecSpatial(await ProjetsPage({ searchParams: Promise.resolve(sp) })));
  return d;
};
const fiche = async (id: string, sp: Record<string, string> = {}) => {
  const d = document.createElement('div');
  d.innerHTML = renderToStaticMarkup(avecSpatial(await ProjetSpatial({ params: Promise.resolve({ id }), searchParams: Promise.resolve(sp) })));
  return d;
};
/** Un onglet de la fiche Spatiale (la page rend « Canvas ») · même lecture serveur que la page. */
const onglet = async (id: string, o: OngletProjet) => {
  const r = await chargerProjet(h.session as never, id);
  if (!r.ok) throw new Error(JSON.stringify(r.raison));
  const d = document.createElement('div');
  d.innerHTML = renderToStaticMarkup(avecSpatial(<Projet {...r.props} ongletInitial={o} />));
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
    expect(d.querySelector('.tile h3')?.textContent).toBe('Ton premier projet');
    expect(d.textContent).toContain('Préparer une création');
    expect(d.querySelector('[data-projet]')).toBeNull();
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
    const cartes = [...d.querySelectorAll('[data-projet]')];
    expect(cartes.map((c) => c.getAttribute('data-projet'))).toEqual([projet]);
    const c = cartes[0]!;
    expect(c.textContent).toContain('Marque A1');
    expect(c.textContent).toContain('Pub statique');
    // Spatial · l'étape en pastille, la version en pastille de couverture, le pied dit d'abord ce qui bloque, puis la fraîcheur.
    expect(c.querySelector('.meta .pill')?.textContent).toBe('Brief à compléter');
    expect(c.querySelector('.stp')?.textContent).toContain('Produit de la marque à choisir');
    expect(c.querySelector('.pill.ver')?.textContent).toBe('V1');
    expect(c.querySelector('.stp')?.textContent).toMatch(/à l’instant|il y a/);
    expect(d.textContent).toContain('voir toutes les marques');

    const toutes = await liste({ toutes: '1' });
    expect([...toutes.querySelectorAll('[data-projet]')].map((x) => x.getAttribute('data-projet')).sort()).toEqual([projet, projetSauvegarde].sort());
    expect(toutes.querySelector(`[data-projet="${projetSauvegarde}"]`)?.textContent).toContain('Vidéo');
  });

  it('vide pour la marque active · on le dit et on propose les autres marques', async () => {
    qui('ua'); h.active = { id: ids.brandA2, name: 'Marque A2' };
    await db.update(schema.studioProjects).set({ status: 'archived' }).where(eq(schema.studioProjects.id, projetSauvegarde));
    const d = await liste();
    expect(d.querySelector('.tile h3')?.textContent).toBe('Aucun projet pour Marque A2');
    expect(d.querySelector('[data-projet]')).toBeNull();
    await db.update(schema.studioProjects).set({ status: 'active' }).where(eq(schema.studioProjects.id, projetSauvegarde));
  });

  it('accès refusé · lecteur · aucune donnée de projet', async () => {
    qui('uv'); h.active = null;
    const d = await liste();
    expect(d.querySelector('.tile h3')?.textContent).toBe('Accès réservé');
    expect(d.innerHTML).not.toContain('Accroche chiffrée');
  });
});

describe('/studio/projets/[id] · la page projet', () => {
  it('marque et version visibles, brief, hypothèse, variable, complétude, sources, retour Veille, historique, export, propositions, variantes', async () => {
    qui('ua');
    const avant = await empreinteBase();
    const d = await fiche(projet);
    const brief = await onglet(projet, 'brief');
    const crea = await onglet(projet, 'crea');
    expect(await empreinteBase(), 'la visite a écrit').toBe(avant);
    expect(d.querySelector('h1')?.textContent).toBe('Accroche chiffrée · test de rentrée');
    const sous = d.querySelector('header.top small')!.textContent!;
    expect(sous).toContain('Marque A1');
    expect(sous).toMatch(/V1|version 1/i);
    // Le canvas et le panneau Jarvis du projet, par défaut.
    expect(d.querySelector('.lanes')).not.toBeNull();
    expect(d.querySelector('aside.jpanel')).not.toBeNull();
    // Retour vers la recherche de Veille d'où vient le projet (lot 18B).
    expect(d.querySelector('[data-retour-veille]')?.getAttribute('href')).toBe('/veille?q=serum&p=meta#ad-meta-9001');
    const kv = (dt: string) => [...brief.querySelectorAll('dl.kv2 dt')].find((x) => x.textContent === dt)?.nextElementSibling?.textContent;
    expect(kv('Hypothèse')).toBe('Une accroche chiffrée augmente le clic.');
    expect(kv('Variable testée')).toBe('Accroche');
    expect(kv('Témoin')).toBe('Bénéfice');
    expect(kv('Mesure')).toBe('Taux de clic (CTR)');
    expect(brief.querySelector('[data-manque="produit"]')?.textContent).toContain('à faire');
    const src = brief.querySelector('[data-source]')!;
    expect(src.getAttribute('data-statut')).toBe('active');
    expect(src.textContent).toContain('Narration · absente · Aucune transcription ni piste audio');
    expect(src.querySelector('a')?.getAttribute('href')).toBe('/veille?q=serum&p=meta#ad-meta-9001');
    expect(src.querySelector('a')?.textContent).toBe('Voir la source dans la Veille');
    expect(brief.querySelector('[data-version-n="1"]')?.textContent).toContain('Courante');
    expect(brief.textContent).toContain('Exporter le brief');
    // Intégration L4-A · le panneau des propositions est RENDU, pas seulement réservé.
    expect(brief.querySelector('#propositions')?.textContent, 'propositions absentes de la fiche').toContain('Version courante · version 1');
    // Intégration L4-C · « Variantes » est RENDU dans l'onglet Créations.
    expect(crea.querySelector('#variantes'), 'variantes absentes de la fiche').not.toBeNull();
    // Les ateliers du projet et l'export (action de l'en-tête).
    expect([...brief.querySelectorAll('[data-atelier] a')].map((a) => a.getAttribute('href'))).toEqual(expect.arrayContaining([
      `/studio/projets/${projet}/image`, `/studio/projets/${projet}/textes`, `/studio/projets/${projet}/produit`, `/studio/projets/${projet}/identites`,
    ]));
    expect(d.querySelector(`.wshead a[href="/studio/projets/${projet}/export"]`)).not.toBeNull();
    for (const x of [d, brief, crea]) {
      expect(x.innerHTML, 'tiret cadratin à l’écran').not.toContain('—');
      expect(x.innerHTML).not.toMatch(/Trendtrack/i);
    }
  });

  it('source retirée · tombstone affiché, plus de lien ni d’aperçu, observations gardées', async () => {
    qui('ua');
    await db.delete(schema.savedAds).where(eq(schema.savedAds.externalId, '7002'));
    const d = await onglet(projetSauvegarde, 'brief');
    const src = d.querySelector('[data-source]')!;
    expect(src.getAttribute('data-statut')).toBe('supprimee');
    expect(src.textContent).toContain('Source retirée');
    expect(src.textContent).toContain('observations conservées');
    expect(src.textContent).toContain('La source n’est plus accessible · aucun lien.');
    expect(src.querySelector('a')).toBeNull();
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
