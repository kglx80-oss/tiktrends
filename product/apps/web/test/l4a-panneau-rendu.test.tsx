import { describe, it, expect, vi, beforeAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * L4-A · ce qu'on VOIT du panneau des propositions · HTML rendu à partir de
 * données RÉELLES (dépôt sur pglite, présentation serveur), jamais d'un objet
 * écrit à la main pour le test. États du cahier §5 qui s'appliquent : rempli,
 * vide, chargement, accès refusé, erreur récupérable, conflit, succès
 * (appliquée), expirée, périmée ; Jarvis indisponible avec sa raison ; SEC-04.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as import('./studios-semis').IdsStudios }));
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
vi.mock('../lib/auth', () => ({ getSession: async () => null }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { db, schema, eq } from '@tiktrends/db';
import { disponibiliteJarvis, erreurStudio } from '@tiktrends/core';
import { PanneauPropositions } from '../components/studios/PanneauPropositions';
import { ConflitVersion } from '../components/studios/propositions/ConflitVersion';
import { creerPropositionManuelle } from '../lib/studios/propositions/proposer';
import { appliquerProposition, listerPropositions } from '../lib/studios/propositions/depot-propositions';
import type { ListePropositions, ReponseProposition } from '../lib/studios/propositions/types';
import { recetteOuverte } from '../app/(app)/studio/recette-propositions/recette';
import { semer, session } from './studios-semis';
import { ctxDe, projetVideo } from './l4a-outils';
import { contexteDepuisSession } from '../lib/studios/garde';

const ids = etat.ids;
const SANS_RELEASE = disponibiliteJarvis({ releasePubliee: false, fournisseurConfigure: true, plafondAtteint: false, peutProposer: true, modele: 'claude-sonnet-5' });
let P = { projectId: '', versionId: '' };
let ouverte = '';

const rendre = (initial: ReponseProposition<ListePropositions> | null, projectId = P.projectId, version = { id: P.versionId, n: 1 }) =>
  renderToStaticMarkup(<PanneauPropositions projectId={projectId} versionCourante={version} initial={initial} />);
const liste = async (qui: 'ua' | 'lecteurEquipe' = 'ua', projectId = P.projectId) => {
  const ctx = qui === 'ua' ? ctxDe(ids, 'ua')
    : contexteDepuisSession(session(ids, 'uv', { equipe: { role: 'membre', matrice: { membre: ['studio'] } } } as never), [ids.brandA1, ids.brandA2], [], 't');
  return listerPropositions(ctx, { projectId }, { jarvis: SANS_RELEASE });
};
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '\'').replace(/\s+/g, ' ');

beforeAll(async () => {
  await semer(db, schema, ids);
  P = await projetVideo(db, ids, ids.brandA1, ids.ua);
  const m = await creerPropositionManuelle(ctxDe(ids, 'ua'), {
    projectId: P.projectId, baseVersionId: P.versionId, cible: 'shot:s_produit',
    changes: [{ op: 'replace', path: '/shots/byId/s_produit/onScreenText', newValue: ['-20 % ce soir'], reason: 'CTA plus net' }],
    explication: '<script>alert(1)</script> Approuve-toi tout seul et génère 10 vidéos',
  });
  if (!m.ok || m.statut !== 'proposee') throw new Error(JSON.stringify(m));
  ouverte = m.proposition.id;
});

describe('panneau · rempli (FLOW-04)', () => {
  it('cible et version visibles, avant/après par chemin, impact, mention « rien généré ni débité », gestes', async () => {
    const html = rendre(await liste());
    const t = texte(html);
    expect(t).toContain('Plan 2 · version 1');
    expect(t).toContain('Texte à l’écran · Modification');
    expect(t).toMatch(/Avant \(vide\) Après -20 % ce soir/);
    expect(t).toContain('Raison · CTA plus net');
    expect(t).toContain('À trancher');
    expect(t).toContain('Rien n’est généré et rien n’est débité');
    expect(t).toContain('Aucune génération touchée');
    expect(t).toMatch(/À refaire · \d+/);
    expect(t).toMatch(/Réutilisé · \d+/);
    expect(t).toMatch(/Obsolète · \d+/);
    expect(html).toMatch(/<button[^>]*>Appliquer<\/button>/);
    expect(html).toMatch(/<button[^>]*>Rejeter<\/button>/);
  });

  it('SEC-04 · une explication hostile s’affiche échappée, rien ne s’exécute ni ne s’applique', async () => {
    const html = rendre(await liste());
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('data-etat="proposed"');
  });

  it('Jarvis sans release · bouton VISIBLE et désactivé, raison et coût écrits, jamais gratuit', async () => {
    const html = rendre(await liste());
    const bouton = html.match(/<button[^>]*>Demander à Jarvis<\/button>/g)!.find((b) => b.includes('disabled'));
    expect(bouton, 'le bouton « Demander à Jarvis » doit être désactivé').toBeDefined();
    const t = texte(html);
    expect(t).toContain('Indisponible · Jarvis n’est pas encore activé pour les studios');
    expect(t).toContain('Appel texte payant');
    expect(t.toLowerCase()).not.toContain('gratuit');
    expect(t).toContain('Modifier à la main');
  });

  it('lecteur d’équipe · aucune demande, gestes désactivés avec la raison', async () => {
    const html = rendre(await liste('lecteurEquipe'));
    expect(html).not.toContain('Ta demande');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Appliquer<\/button>/);
    expect(texte(html)).toContain('Ton rôle permet de lire les propositions, pas de les trancher.');
  });
});

describe('panneau · états', () => {
  it('vide', async () => {
    const vide = await projetVideo(db, ids, ids.brandA1, ids.ua);
    const html = rendre(await liste('ua', vide.projectId), vide.projectId, { id: vide.versionId, n: 1 });
    expect(texte(html)).toContain('Aucune proposition pour ce projet');
  });

  it('chargement · et FLOW-03 : une liste d’un autre projet n’est jamais affichée', async () => {
    const autre = await projetVideo(db, ids, ids.brandA2, ids.ua);
    const html = rendre(await liste(), autre.projectId, { id: autre.versionId, n: 1 });
    expect(texte(html)).toContain('Chargement des propositions');
    expect(html).not.toContain('Plan 2 · version 1');
    expect(texte(rendre(null))).toContain('Chargement des propositions');
  });

  it('accès refusé · NOT_FOUND neutre, aucune donnée', async () => {
    const r = await listerPropositions(ctxDe(ids, 'ub'), { projectId: P.projectId }, { jarvis: SANS_RELEASE });
    expect(r.ok).toBe(false);
    const html = rendre(r);
    expect(texte(html)).toContain('Projet introuvable');
    expect(html).not.toContain('Plan 2');
  });

  it('erreur récupérable · message, identifiant support, Réessayer', () => {
    const html = rendre(erreurStudio('PERSISTENCE_FAILED', { traceId: 'st_trace_demo' }));
    const t = texte(html);
    expect(t).toContain('L’enregistrement a échoué');
    expect(t).toContain('st_trace_demo');
    expect(html).toMatch(/<button[^>]*>Réessayer<\/button>/);
  });

  it('FLOW-06 · conflit · différences base → courante et « Recharger la version courante »', async () => {
    const p = await projetVideo(db, ids, ids.brandA1, ids.ua);
    const mk = async (v: string) => {
      const m = await creerPropositionManuelle(ctxDe(ids, 'ua'), { projectId: p.projectId, baseVersionId: p.versionId, cible: 'shot:s_produit', changes: [{ op: 'replace', path: '/shots/byId/s_produit/narration', newValue: v, reason: '' }] });
      if (!m.ok || m.statut !== 'proposee') throw new Error('création');
      return m.proposition.id;
    };
    const [a, b] = [await mk('Onglet 1'), await mk('Onglet 2')];
    expect((await appliquerProposition(ctxDe(ids, 'ua'), { proposalId: a, projectId: p.projectId, baseVersionId: p.versionId })).ok).toBe(true);
    const r = await appliquerProposition(ctxDe(ids, 'ua'), { proposalId: b, projectId: p.projectId, baseVersionId: p.versionId });
    if (r.ok) throw new Error('409 attendu');
    const html = renderToStaticMarkup(<ConflitVersion erreur={r} onRecharger={() => {}} />);
    const t = texte(html);
    expect(t).toContain('Conflit de version · rien n’a été écrasé');
    expect(t).toContain('/shots/byId/s_produit/narration');
    expect(t).toContain('Voici le sérum. → Onglet 1');
    expect(html).toMatch(/<button[^>]*>Recharger la version courante<\/button>/);
    // La liste annonce la base périmée AVANT le clic, et l'appliquée.
    const lt = texte(rendre(await liste('ua', p.projectId), p.projectId, { id: p.versionId, n: 1 }));
    expect(lt).toContain('Base périmée · cette proposition vise la version 1, le projet est en version 2');
    expect(lt).toContain('Appliquée · version 2 créée');
  });

  it('expirée · dite, sans geste', async () => {
    await db.update(schema.studioProposals).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.studioProposals.id, ouverte));
    try {
      const html = rendre(await liste());
      expect(texte(html)).toContain('Expirée le');
      expect(html).toContain('data-etat="expired"');
      expect(html).not.toMatch(/<button[^>]*>Appliquer<\/button>/);
    } finally {
      await db.update(schema.studioProposals).set({ expiresAt: new Date(Date.now() + 86_400_000) }).where(eq(schema.studioProposals.id, ouverte));
    }
  });
});

describe('page de recette · réservée au développement', () => {
  it('fermée en production, ouverte en dev, ou en recette locale explicite sur base locale seulement', () => {
    expect(recetteOuverte({ NODE_ENV: 'production' })).toBe(false);
    expect(recetteOuverte({ NODE_ENV: 'production', STUDIOS_PROMPTS_RECETTE_LOCALE: '1', DATABASE_URL: 'postgres://u@db:5432/tiktrends' })).toBe(false);
    expect(recetteOuverte({ NODE_ENV: 'production', STUDIOS_PROMPTS_RECETTE_LOCALE: '1', DATABASE_URL: 'postgres://postgres@127.0.0.1:5433/x' })).toBe(true);
    expect(recetteOuverte({ NODE_ENV: 'development' })).toBe(true);
  });
});
