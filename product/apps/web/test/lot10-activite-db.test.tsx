// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 10 V5 · Projet · activité, journal et commentaires · sur une VRAIE base
 * (pglite + migrations du dépôt, 0074 comprise), par les VRAIES actions
 * (garde relue · session, rôle, portée de marque) et la VRAIE fiche rendue
 * (`chargerProjet` → `<Projet>`, onglet « Activité ») · on lit le DOM.
 *
 *  · journal · un projet semé par les vraies commandes (création, version,
 *    relecture humaine, export, renommage) puis une version sans audit et un
 *    événement inconnu · les phrases, dans l'ordre, du plus récent · la copie
 *    d'une duplication dit d'où elle vient · un événement inconnu est NEUTRE ·
 *    filtre par type et pages relus au serveur ;
 *  · un projet à lots RÉELS · devis, lancement, fin de génération ;
 *  · commentaires · sur une version (à l'écran) et sur une création · relus ·
 *    modifier le sien oui (ancien texte gardé), celui d'un autre non · résoudre,
 *    rouvrir · `<script>` affiché comme texte · vide refusé, raison dite ·
 *    le propriétaire est prévenu (notification existante) ;
 *  · refus · lecteur client (rien), lecture seule (lit, n'écrit pas), autre
 *    espace, membre restreint hors de sa marque · aucune fuite (message
 *    neutre, aucune ligne écrite).
 * 0 $ · fournisseur et stockage simulés, aucun appel réseau, aucune dépense.
 */

const etat = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  etat.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});
const nav = vi.hoisted(() => ({ refresh: () => {}, push: (_: string) => {} }));

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('next/navigation', () => ({ useRouter: () => nav, usePathname: () => '/studio/projets', redirect: (u: string) => { throw new Error(`redirect ${u}`); }, notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => null, listBrands: async () => [] }));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));

import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { contenuVide, PHRASE_EVENEMENT_INCONNU, SCHEMA_VERSION_CONTENU, empreinteContenu, type ContenuVersion, type DocumentStudio } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { png } from './l5a-outils';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, briefCanonique } from './l4c-harnais';
import { TOUS_LES_POINTS } from './relecture-export-outils';
import { avecSpatial } from './spatial/fournisseur';
import { injecterLecteurMedias } from '../lib/studios/rendu/medias';
import { exporterVersion, validerRelectureExport } from '../app/actions/studios/export';
import { creerProjet, dupliquerProjet, enregistrerDocument, renommerProjet } from '../app/actions/studios/projets';
import { commenterProjet, lireActiviteProjet, listerCommentairesProjet, modifierCommentaire, resoudreCommentaire } from '../app/actions/studios/activite';
import { chargerProjet } from '../app/(spatial)/sp/studio/projets/[id]/donnees';
import { Projet } from '../spatial/vues/projet/Projet';
import { OngletActivite } from '../spatial/vues/projet/OngletActivite';
import { activiteDuProjet, commenterPour, lireJournalPour, resoudreCommentairePour } from '../lib/studios/activite';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ids = etat.ids;
const qui = (q: 'ua' | 'uv' | 'ur' | 'ub') => { etat.session = session(ids, q); };
const stockage = new Map<string, Uint8Array>();
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const scene = { e: '', eV1: '', eV2: '', eV3: '', copie: '', l: '', sortie: '', a2: '', a2V1: '', p3: '', fond: '', logo: '' };

async function poser(cle: string, octets: Uint8Array): Promise<string> {
  stockage.set(cle, octets);
  const [a] = await db.insert(schema.studioAssets).values({
    workspaceId: ids.wsA, brandId: ids.brandA1, storageKey: cle, mime: 'image/png', bytes: octets.length, sha256: sha(octets), origin: 'upload', storageState: 'stored',
  }).returning();
  return a!.id;
}

const doc = (fond: string, logo: string): DocumentStudio => ({
  width: 1080, height: 1080, colorSpace: 'sRGB', fonts: { f_titre: { family: 'Sans Bold', assetId: null } },
  layers: {
    fond: { id: 'fond', kind: 'image', name: 'Décor', visible: true, locked: false, x: 0, y: 0, width: 1080, height: 1080, rotationDeg: 0, opacity: 1, z: 0, assetId: fond, sourceWidth: 1080, sourceHeight: 1080, mask: null },
    titre: { id: 'titre', kind: 'text', name: 'Titre', visible: true, locked: false, x: 60, y: 60, width: 960, height: 150, rotationDeg: 0, opacity: 1, z: 20, text: 'La crème qui tient 24 h', fontId: 'f_titre', fontSizePx: 64, color: '#ffffff', align: 'center', lineHeight: 1.1 },
    logo: { id: 'logo', kind: 'logo', name: 'Logo', visible: true, locked: false, x: 900, y: 960, width: 120, height: 60, rotationDeg: 0, opacity: 1, z: 22, assetId: logo },
  },
});

let hote: HTMLDivElement; let root: Root | null = null;
async function monter(el: ReactElement) {
  if (root) act(() => root!.unmount());
  hote?.remove();
  hote = document.createElement('div'); document.body.appendChild(hote);
  root = createRoot(hote);
  await act(async () => { root!.render(avecSpatial(el)); });
}
const attendre = async () => { await act(async () => { for (let i = 0; i < 30; i += 1) await new Promise((r) => setTimeout(r, 5)); }); };
const cliquer = async (el: Element | null | undefined) => { if (!el) throw new Error('élément absent'); await act(async () => { (el as HTMLElement).click(); }); await attendre(); };
const saisir = async (el: HTMLTextAreaElement | HTMLSelectElement, v: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v); el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
};
/** La fiche relue du serveur, onglet « Activité » ouvert. */
async function activite(projectId: string): Promise<void> {
  const r = await chargerProjet(etat.session as never, projectId);
  if (!r.ok) throw new Error(JSON.stringify(r.raison));
  await monter(<Projet {...r.props} ongletInitial="activite" />);
}
const phrases = () => [...hote.querySelectorAll('[data-entrees-journal] .ev')].map((e) => [e.querySelector('[data-phrase]')?.textContent ?? '', e.querySelector('[data-detail]')?.textContent ?? null]);
const textes = () => [...hote.querySelectorAll('[data-liste-commentaires] [data-commentaire]')].map((c) => c.querySelector('[data-texte-commentaire]')?.textContent ?? '');
const code = (r: unknown) => (r as { code?: string }).code;

beforeAll(async () => {
  await semer(db, schema, ids);
  injecterLecteurMedias({ lire: async (m) => stockage.get(m.storageKey) ?? null });
  scene.fond = await poser('studios/l10/fond.png', await png(1080, 1080, (x, y) => [20, Math.round((y / 1080) * 120), 160 + Math.round((x / 1080) * 80), 255]));
  scene.logo = await poser('studios/l10/logo.png', await png(240, 120, () => [255, 255, 255, 255]));

  // ── Projet E · semé par les VRAIES commandes, dans cet ordre.
  qui('ua');
  const c = await creerProjet({ brandId: ids.brandA1, kind: 'image', title: 'Crème', contenu: { ...contenuVide(), brief: briefCanonique({ objective: 'Faire acheter la crème' }), document: doc(scene.fond, scene.logo) } });
  if (!c.ok) throw new Error(JSON.stringify(c));
  scene.e = c.projet.id; scene.eV1 = c.version.id;
  const v2 = await enregistrerDocument({ projectId: scene.e, baseVersionId: scene.eV1, changes: [{ op: 'replace', path: '/document/layers/titre/text', newValue: 'Nouvelle accroche', reason: 'accroche' }], raison: 'Nouvelle accroche' });
  if (!v2.ok) throw new Error(JSON.stringify(v2));
  scene.eV2 = v2.version.id;
  const rel = await validerRelectureExport({ projectId: scene.e, points: TOUS_LES_POINTS });
  if (!rel.ok) throw new Error(JSON.stringify(rel));
  const x = await exporterVersion({ projectId: scene.e, format: 'png' });
  if (!x.ok) throw new Error(JSON.stringify(x));
  const rn = await renommerProjet({ projectId: scene.e, titre: 'Crème · rentrée' });
  if (!rn.ok) throw new Error(JSON.stringify(rn));
  const cp = await dupliquerProjet({ projectId: scene.e });
  if (!cp.ok) throw new Error(JSON.stringify(cp));
  scene.copie = cp.projet.id;
  // Une version SANS audit (semée, comme une ancienne) · l'historique la dit quand même.
  const [cour] = await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.id, scene.eV2));
  const [v3] = await db.insert(schema.studioProjectVersions).values({
    projectId: scene.e, workspaceId: ids.wsA, brandId: ids.brandA1, parentId: scene.eV2, n: 3, schemaVersion: SCHEMA_VERSION_CONTENU,
    content: cour!.content, contentHash: empreinteContenu(cour!.content as ContenuVersion), authorId: ids.ur, reason: 'Reprise sans audit', createdAt: new Date(Date.now() + 1000),
  }).returning();
  scene.eV3 = v3!.id;
  // Un événement que la règle ne connaît pas · code, raison et détails ne doivent jamais sortir.
  await db.insert(schema.studioAuditEvents).values({
    actorId: ids.ua, effectiveRole: 'espace:member', workspaceId: ids.wsA, brandId: ids.brandA1, action: 'zz.interne.inconnu', targetType: 'studio_project', targetId: scene.e,
    reason: '<b>raison interne</b>', traceId: 'st_l10', details: { secret: 'sk_live_l10' }, occurredAt: new Date(Date.now() + 2000),
  });

  // ── Projet L · lots RÉELS (devis → approbation → worker simulé).
  const l = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · lots du lot 10' });
  scene.l = l.projectId;
  const job = await lancerLot(db, ctxDe(ids, 'ua'), l.projectId, KEYFRAMES(2));
  await executer(db, job);
  scene.sortie = (await sortiesDuJob(db, job))['keyframe:s1']!;

  // ── Projet de la marque A2 (fermée au membre restreint `ur`) et projet à 26 événements (pages).
  const a2 = await creerProjet({ brandId: ids.brandA2, kind: 'image', title: 'Projet secret A2' });
  if (!a2.ok) throw new Error(JSON.stringify(a2));
  scene.a2 = a2.projet.id; scene.a2V1 = a2.version.id;
  const p3 = await creerProjet({ brandId: ids.brandA1, kind: 'text', title: 'Nom 0' });
  if (!p3.ok) throw new Error(JSON.stringify(p3));
  scene.p3 = p3.projet.id;
  for (let i = 1; i <= 25; i += 1) { const r = await renommerProjet({ projectId: scene.p3, titre: `Nom ${i}` }); if (!r.ok) throw new Error(JSON.stringify(r)); }
});
afterAll(() => { injecterLecteurMedias(null); if (root) act(() => root!.unmount()); });
beforeEach(() => qui('ua'));

/* ───────────────────────────── 1 · journal ───────────────────────────── */

describe('lot 10 · le journal d’un projet · qui a fait quoi, lu, dans l’ordre', () => {
  it('le projet semé · les phrases du plus récent au plus ancien, version sans audit comprise, événement inconnu neutre', async () => {
    await activite(scene.e);
    expect(hote.querySelector('button[data-ptab="activite"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(phrases()).toEqual([
      [PHRASE_EVENEMENT_INCONNU, null],
      ['Version 3 enregistrée', 'Reprise sans audit'],
      ['Projet renommé', '« Crème » devient « Crème · rentrée »'],
      ['Version 2 exportée', 'PNG · 1080 × 1080 · creme-v2-png.png'],
      ['Relecture humaine validée · version 2', '5 points relus avant export'],
      ['Version 2 enregistrée', 'Nouvelle accroche'],
      ['Projet créé', null],
    ]);
    // Qui, quand, quelle version · « Toi » pour la session, le membre par son adresse.
    const qui0 = [...hote.querySelectorAll('[data-entrees-journal] [data-qui]')].map((q) => q.textContent!.replace(/^\d\d\/\d\d\/\d{4} · \d\d:\d\d · /, ''));
    expect(qui0).toEqual(['Toi', 'ur@studios.test · version 3', 'Toi · version 2', 'Toi · version 2', 'Toi · version 2', 'Toi · version 2', 'Toi · version 1']);
    // Rien du code, de la raison ni des détails de l'événement inconnu.
    expect(hote.innerHTML).not.toMatch(/zz\.interne|raison interne|sk_live_l10/);
    // « Voir le livrable » d'un export mène à l'export de CETTE version · « Examiner » à la version.
    const liens = [...hote.querySelectorAll('[data-entrees-journal] a')].map((a) => [a.textContent, a.getAttribute('href')]);
    expect(liens).toContainEqual(['Voir le livrable', `/studio/projets/${scene.e}/export?version=${scene.eV2}`]);
    expect(liens).toContainEqual(['Examiner la version 3', `/studio/projets/${scene.e}?version=${scene.eV3}`]);
    expect(hote.querySelector('[data-resume-journal]')?.textContent).toBe('7 événements');
  });

  it('la copie d’une duplication dit d’où elle vient · rien de produit n’y figure', async () => {
    await activite(scene.copie);
    expect(phrases()).toEqual([['Projet créé par duplication', 'Copie de « Crème · rentrée » (version 2) · structure seule, sans générations, exports, tests ni mesures']]);
  });

  it('filtrer par type relit le serveur · seuls les exports · « Tout » revient', async () => {
    await activite(scene.e);
    const filtres = [...hote.querySelectorAll('[data-filtres-journal] button')].map((b) => b.textContent);
    expect(filtres).toEqual(['Tout · 7', 'Versions · 2', 'Exports · 1', 'Relectures · 1', 'Projet · 2', 'Autres · 1']);
    await cliquer(hote.querySelector('[data-filtres-journal] button[data-type="exports"]'));
    expect(phrases().map((p) => p[0])).toEqual(['Version 2 exportée']);
    expect(hote.querySelector('[data-filtres-journal] button[data-type="exports"]')?.getAttribute('aria-pressed')).toBe('true');
    await cliquer(hote.querySelector('[data-filtres-journal] button[data-type=""]'));
    expect(phrases()).toHaveLength(7);
  });

  it('un projet à lots réels · devis, lancement, fin de génération · « Voir le journal » depuis les tâches', async () => {
    await activite(scene.l);
    // Les étapes internes du moteur (prise en charge, en cours, enregistrement, fin écrite par le worker) ne se disent pas · la fin se lit UNE fois, sur la tâche.
    const consigne = 'Consigne d’image d’un plan compilée et validée';
    expect(phrases().map((p) => p[0])).toEqual(['Génération terminée', 'Génération lancée · devis approuvé', 'Devis préparé', consigne, consigne, consigne, consigne, 'Version 1 enregistrée']);
    expect(hote.innerHTML).not.toContain(PHRASE_EVENEMENT_INCONNU);
    // L'opération du lot (`studio.generation`) n'a pas de libellé · elle ne se dit pas, jamais en brut.
    expect(phrases()[0]![1]).toBeNull();
    expect(hote.innerHTML).not.toContain('studio.generation');
    const r = await chargerProjet(etat.session as never, scene.l);
    await monter(<Projet {...(r as { ok: true; props: Parameters<typeof Projet>[0] }).props} ongletInitial="crea" />);
    expect(hote.querySelector('#taches [data-voir-journal]')?.getAttribute('href')).toBe('#activite');
  });

  it('pages bornées · 26 événements · deux pages de 20 · « Plus anciens » relit le serveur, « Plus récents » est fermé avec sa raison sur la première', async () => {
    await activite(scene.p3);
    expect(hote.querySelector('[data-resume-journal]')?.textContent).toBe('26 événements · page 1 sur 2');
    expect(phrases()).toHaveLength(20);
    const prec = hote.querySelector('[data-page="precedente"]') as HTMLButtonElement;
    expect(prec.getAttribute('aria-disabled')).toBe('true');
    expect(hote.querySelector(`#${CSS.escape(prec.getAttribute('aria-describedby')!)}`)?.textContent).toBe('Tu lis déjà les plus récents.');
    await cliquer(hote.querySelector('[data-page="suivante"]'));
    expect(hote.querySelector('[data-resume-journal]')?.textContent).toBe('26 événements · page 2 sur 2');
    expect(phrases().map((p) => p[0])).toEqual([...Array(5).fill('Projet renommé'), 'Projet créé']);
    expect(phrases()[4]![1]).toBe('« Nom 0 » devient « Nom 1 »');
    const hors = await lireActiviteProjet({ projectId: scene.p3, page: 99 });
    expect(hors.ok && [hors.journal.page, hors.journal.entrees.length]).toEqual([2, 6]);
  });
});

/* ───────────────────────────── 2 · commentaires ───────────────────────────── */

describe('lot 10 · commenter une version et une création · modifier le sien, résoudre, rouvrir', () => {
  it('à l’écran · « Publier » fermé tant que le texte est vide (raison dite) · commenter la version 2 · relu', async () => {
    await activite(scene.e);
    const publier = () => hote.querySelector('[data-geste="publier-commentaire"]') as HTMLButtonElement;
    expect(publier().getAttribute('aria-disabled')).toBe('true');
    expect(hote.querySelector('[data-raison-ferme="publier-commentaire"]')?.textContent).toBe('Le commentaire est vide · écris ce que tu as vu avant de publier.');
    const cibles = [...hote.querySelectorAll('[data-champ="cible-commentaire"] option')].map((o) => o.textContent);
    expect(cibles).toEqual(['Version 3', 'Version 2 · courante', 'Version 1']);
    await saisir(hote.querySelector('[data-champ="cible-commentaire"]') as HTMLSelectElement, `version:${scene.eV2}`);
    await saisir(hote.querySelector('[data-champ="texte-commentaire"]') as HTMLTextAreaElement, '  Le titre déborde à droite\n\nà reprendre  ');
    expect(publier().getAttribute('aria-disabled')).toBeNull();
    await act(async () => { (hote.querySelector('[data-nouveau-commentaire]') as HTMLFormElement).requestSubmit(); });
    await attendre();
    expect(textes()).toEqual(['Le titre déborde à droite\n\nà reprendre']);
    expect(hote.querySelector('[data-liste-commentaires] [data-entete-commentaire]')?.textContent).toMatch(/^Toi · \d\d\/\d\d\/\d{4} · \d\d:\d\d · sur Version 2$/);
    expect((hote.querySelector('[data-champ="texte-commentaire"]') as HTMLTextAreaElement).value).toBe('');
    // En base · normalisé, sur LA version, par la session.
    const [k] = await db.select().from(schema.studioComments).where(eq(schema.studioComments.projectId, scene.e));
    expect(k).toMatchObject({ targetType: 'version', versionId: scene.eV2, assetId: null, authorId: ids.ua, body: 'Le titre déborde à droite\n\nà reprendre', resolvedAt: null, history: [] });
    // Le journal le dit (relu du serveur).
    await activite(scene.e);
    // Le semis date deux faits « à venir » (version 3 sans audit à +1 s, événement inconnu à +2 s) ·
    // sur une machine rapide le commentaire est écrit avant ces instants · seuls ces deux-là peuvent
    // le précéder, tout le reste du journal (écrit au semis) vient après lui.
    const ordre = phrases().map((p) => p[0]);
    const i = ordre.indexOf('Commentaire sur la version 2');
    expect(phrases()[i], 'le commentaire n’est pas dans le journal').toEqual(['Commentaire sur la version 2', null]);
    expect(ordre.slice(0, i).every((x) => x === PHRASE_EVENEMENT_INCONNU || x === 'Version 3 enregistrée'), 'un fait plus ancien que le commentaire passe devant lui').toBe(true);
    expect(i, 'le commentaire n’est pas avant les faits du semis').toBeLessThan(ordre.indexOf('Projet renommé'));
  });

  it('commenter une création (sortie livrée) · `<script>` reste du texte · relu dans la fiche rendue du serveur', async () => {
    const r = await commenterProjet({ projectId: scene.l, cible: 'creation', cibleId: scene.sortie, texte: '<script>window.__xss = 1</script><b>gras</b>' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.commentaires.map((c) => [c.cible.type, c.cible.libelle])).toEqual([['creation', 'Lot 1 · Image 1 du lot 1']]);
    await activite(scene.l);
    expect(textes()).toEqual(['<script>window.__xss = 1</script><b>gras</b>']);
    const tuile = hote.querySelector('[data-commentaires-projet]')!;
    expect(tuile.querySelector('script')).toBeNull();
    expect(tuile.querySelector('[data-texte-commentaire] b')).toBeNull();
    expect((window as { __xss?: number }).__xss).toBeUndefined();
    const html = renderToStaticMarkup(avecSpatial(<Projet {...((await chargerProjet(etat.session as never, scene.l)) as { ok: true; props: Parameters<typeof Projet>[0] }).props} ongletInitial="activite" />));
    expect(html).toContain('&lt;script&gt;window.__xss = 1&lt;/script&gt;&lt;b&gt;gras&lt;/b&gt;');
    expect(html).not.toContain('<script>window');
    expect(phrases()[0]).toEqual(['Commentaire sur une création', 'Lot 1 · Image 1 du lot 1']);
  });

  it('modifier le sien · l’ancien texte est gardé · celui d’un autre · pas de geste à l’écran, refus au serveur', async () => {
    qui('ur');
    const r = await commenterProjet({ projectId: scene.e, cible: 'version', cibleId: scene.eV3, texte: 'Le logo est trop petit' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const sien = r.commentaires.find((c) => c.texte === 'Le logo est trop petit')!;
    const autre = r.commentaires.find((c) => c.texte.startsWith('Le titre déborde'))!;
    expect([sien.gestes.modifier.ok, autre.gestes.modifier.ok, autre.gestes.resoudre.ok]).toEqual([true, false, true]);
    // `ur` ne peut pas modifier le commentaire de `ua` · refus, texte intact.
    const vole = await modifierCommentaire({ commentId: autre.id, rowVersion: autre.rowVersion, texte: 'Réécrit par un autre' });
    expect(code(vole)).toBe('FORBIDDEN');
    expect(!vole.ok && vole.message).toBe('Seule la personne qui l’a écrit peut le modifier · réponds par un nouveau commentaire.');
    // À l'écran de `ua` · « Modifier » sur le sien seulement.
    qui('ua');
    await activite(scene.e);
    const carte = (t: string) => [...hote.querySelectorAll('[data-commentaire]')].find((c) => c.querySelector('[data-texte-commentaire]')?.textContent?.startsWith(t))!;
    expect(carte('Le logo').querySelector('[data-geste="modifier-commentaire"]')).toBeNull();
    expect(carte('Le titre déborde').querySelector('[data-geste="modifier-commentaire"]')).not.toBeNull();
    await cliquer(carte('Le titre déborde').querySelector('[data-geste="modifier-commentaire"]'));
    const champ = hote.querySelector('[data-champ="edition-commentaire"]') as HTMLTextAreaElement;
    await saisir(champ, '   ');
    expect(hote.querySelector('[data-raison-ferme="enregistrer-commentaire"]')?.textContent).toBe('Le commentaire est vide · écris ce que tu as vu avant de publier.');
    await saisir(champ, 'Le titre déborde · corrigé en V3 ?');
    await cliquer(hote.querySelector('[data-geste="enregistrer-commentaire"]'));
    expect(carte('Le titre déborde').querySelector('[data-modifie]')?.textContent).toMatch(/^Modifié le \d\d\/\d\d\/\d{4} · \d\d:\d\d$/);
    const [k] = await db.select().from(schema.studioComments).where(eq(schema.studioComments.id, autre.id));
    expect(k!.body).toBe('Le titre déborde · corrigé en V3 ?');
    expect((k!.history as Array<{ texte: string }>).map((h) => h.texte)).toEqual(['Le titre déborde à droite\n\nà reprendre']);
    // Une copie périmée (ancien `rowVersion`) ne réécrit rien.
    const perime = await modifierCommentaire({ commentId: autre.id, rowVersion: autre.rowVersion, texte: 'Écrasement' });
    expect(code(perime)).toBe('VERSION_CONFLICT');
    // Vide refusé au serveur, avec sa raison.
    const vide = await modifierCommentaire({ commentId: autre.id, rowVersion: k!.rowVersion, texte: ' \n ' });
    expect(!vide.ok && [vide.code, vide.message]).toEqual(['INVALID_SCHEMA', 'Le commentaire est vide · écris ce que tu as vu avant de publier.']);
  });

  it('résoudre puis rouvrir · par un autre membre qui propose · jamais supprimé, lu sous « Résolus »', async () => {
    const [k] = await db.select().from(schema.studioComments).where(and(eq(schema.studioComments.projectId, scene.e), eq(schema.studioComments.authorId, ids.ua)));
    qui('ur');
    const r = await resoudreCommentaire({ commentId: k!.id, rowVersion: k!.rowVersion, resolu: true });
    if (!r.ok) throw new Error(JSON.stringify(r));
    qui('ua');
    await activite(scene.e);
    expect(textes()).toEqual(['Le logo est trop petit']);
    await cliquer(hote.querySelector('[data-filtres-commentaires] button[data-filtre="resolus"]'));
    expect(textes()).toEqual(['Le titre déborde · corrigé en V3 ?']);
    expect(hote.querySelector('[data-commentaire] [data-resolu-par]')?.textContent).toMatch(/^Résolu par ur@studios\.test · \d\d\/\d\d\/\d{4} · \d\d:\d\d$/);
    // Résolu · plus modifiable (le geste disparaît), il se rouvre.
    expect(hote.querySelector('[data-commentaire] [data-geste="modifier-commentaire"]')).toBeNull();
    await cliquer(hote.querySelector('[data-commentaire] [data-geste="rouvrir-commentaire"]'));
    await cliquer(hote.querySelector('[data-filtres-commentaires] button[data-filtre="ouverts"]'));
    expect(textes()).toEqual(['Le titre déborde · corrigé en V3 ?', 'Le logo est trop petit']);
    const [apres] = await db.select().from(schema.studioComments).where(eq(schema.studioComments.id, k!.id));
    expect([apres!.resolvedAt, apres!.resolvedBy]).toEqual([null, null]);
    // Le journal garde la résolution (la date de la résolution est relue tant qu'elle est posée · rouvert, elle n'est plus dite).
    expect((await db.select().from(schema.studioComments).where(eq(schema.studioComments.projectId, scene.e))).length).toBe(2);
  });

  it('le propriétaire est prévenu d’un commentaire d’une autre personne · jamais de son propre commentaire', async () => {
    const N = schema.notifications;
    const pour = async (u: string) => db.select({ titre: N.title, corps: N.body, href: N.href, type: N.type }).from(N).where(eq(N.userId, u));
    expect(await pour(ids.ua)).toEqual([{ titre: 'Nouveau commentaire · Crème · rentrée', corps: 'Le logo est trop petit', href: `/studio/projets/${scene.e}#activite`, type: 'studio_comment' }]);
    expect(await pour(ids.ur)).toEqual([]);
  });
});

/* ───────────────────────────── 3 · refus ───────────────────────────── */

describe('lot 10 · refus sans fuite · lecteur, autre espace, autre marque, cible d’ailleurs', () => {
  const nCommentaires = async () => (await db.select({ id: schema.studioComments.id }).from(schema.studioComments)).length;

  it('rôle insuffisant (lecteur client) · ni lecture ni écriture · refus sans fuite, rien écrit', async () => {
    const avant = await nCommentaires();
    const [k] = await db.select().from(schema.studioComments).where(eq(schema.studioComments.projectId, scene.e)).limit(1);
    qui('uv');
    for (const r of [
      await lireActiviteProjet({ projectId: scene.e }), await listerCommentairesProjet({ projectId: scene.e }),
      await commenterProjet({ projectId: scene.e, cible: 'version', cibleId: scene.eV2, texte: 'Je passe' }),
      await modifierCommentaire({ commentId: k!.id, rowVersion: k!.rowVersion, texte: 'Je passe' }),
      await resoudreCommentaire({ commentId: k!.id, rowVersion: k!.rowVersion, resolu: true }),
    ]) {
      expect(code(r)).toBe('FORBIDDEN');
      expect(JSON.stringify(r)).not.toMatch(/Crème|Le titre|Le logo|ua@studios/);
    }
    expect(await nCommentaires()).toBe(avant);
  });

  it('lecture seule (`studio.read` sans `studio.propose`) · lit le journal et les commentaires · n’écrit pas, ne résout pas · l’écran le dit, sans formulaire ni geste', async () => {
    const avant = await nCommentaires();
    const lecteur = { ...ctxDe(ids, 'ua'), permissions: { espace: new Set(['studio.read'] as const), plateforme: new Set<never>() } } as never;
    const j = await lireJournalPour(lecteur, { projectId: scene.e });
    expect(j.ok && j.journal.tous).toBeGreaterThan(5);
    expect(code(await commenterPour(lecteur, { projectId: scene.e, cible: 'version', cibleId: scene.eV2, texte: 'Je passe' }))).toBe('FORBIDDEN');
    const [k] = await db.select().from(schema.studioComments).where(eq(schema.studioComments.projectId, scene.e)).limit(1);
    expect(code(await resoudreCommentairePour(lecteur, { commentId: k!.id, rowVersion: k!.rowVersion, resolu: true }))).toBe('FORBIDDEN');
    await monter(<OngletActivite {...await activiteDuProjet(lecteur, scene.e)} />);
    expect(hote.querySelector('[data-nouveau-commentaire]')).toBeNull();
    expect(hote.querySelector('[data-raison-lecteur]')?.textContent).toContain('Ton rôle permet de lire les commentaires de ce projet');
    expect(hote.querySelectorAll('[data-commentaire] [data-geste]').length).toBe(0);
    expect(textes().length).toBe(2);
    expect(phrases().length).toBeGreaterThan(5);
    expect(await nCommentaires()).toBe(avant);
  });

  it('autre espace · autre marque · introuvable, même message neutre, rien écrit, rien lu', async () => {
    const avant = await nCommentaires();
    const [k] = await db.select().from(schema.studioComments).where(eq(schema.studioComments.projectId, scene.e)).limit(1);
    qui('ub');
    for (const r of [
      await lireActiviteProjet({ projectId: scene.e }), await listerCommentairesProjet({ projectId: scene.e }),
      await commenterProjet({ projectId: scene.e, cible: 'version', cibleId: scene.eV2, texte: 'Intrus' }),
      await modifierCommentaire({ commentId: k!.id, rowVersion: k!.rowVersion, texte: 'Intrus' }),
      await resoudreCommentaire({ commentId: k!.id, rowVersion: k!.rowVersion, resolu: true }),
    ]) {
      expect(code(r)).toBe('NOT_FOUND');
      expect(JSON.stringify(r)).not.toMatch(/Crème|Le titre|Le logo|ua@studios/);
    }
    qui('ur');
    const a2 = await lireActiviteProjet({ projectId: scene.a2 });
    expect(code(a2)).toBe('NOT_FOUND');
    expect(JSON.stringify(a2)).not.toContain('Projet secret A2');
    expect(code(await commenterProjet({ projectId: scene.a2, cible: 'version', cibleId: scene.a2V1, texte: 'Intrus' }))).toBe('NOT_FOUND');
    expect(await nCommentaires()).toBe(avant);
  });

  it('une cible d’ailleurs · version d’un autre projet, création d’un autre projet · introuvable · rien écrit', async () => {
    const avant = await nCommentaires();
    expect(code(await commenterProjet({ projectId: scene.e, cible: 'version', cibleId: scene.a2V1, texte: 'Mauvaise cible' }))).toBe('NOT_FOUND');
    expect(code(await commenterProjet({ projectId: scene.e, cible: 'creation', cibleId: scene.sortie, texte: 'Mauvaise cible' }))).toBe('NOT_FOUND');
    expect(code(await commenterProjet({ projectId: scene.e, cible: 'projet', cibleId: scene.eV2, texte: 'Mauvaise cible' }))).toBe('INVALID_SCHEMA');
    const vide = await commenterProjet({ projectId: scene.e, cible: 'version', cibleId: scene.eV2, texte: '  ' });
    expect(!vide.ok && [vide.code, vide.message]).toEqual(['INVALID_SCHEMA', 'Le commentaire est vide · écris ce que tu as vu avant de publier.']);
    expect(code(await commenterProjet({ projectId: scene.e, cible: 'version', cibleId: scene.eV2, texte: 'x'.repeat(2001) }))).toBe('INVALID_SCHEMA');
    expect(await nCommentaires()).toBe(avant);
  });
});
