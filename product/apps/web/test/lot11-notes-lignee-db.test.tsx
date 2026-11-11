// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { IdsStudios, SessionTest } from './studios-semis';

/**
 * Lot 11 V5 · PC E11 · les NOTES du canvas de lignée · au RÉSULTAT · vraie base
 * (pglite et les migrations du dépôt, 0076 comprise), VRAIES actions serveur
 * (garde relue · session, rôle, portée de marque, capacités), VRAIES vues
 * (page de la fiche rendue, puis montée et cliquée) · on lit le DOM.
 *
 *  · poser une note sur un nœud · l'indicateur sur la carte (notes OUVERTES),
 *    la note sous son nœud dans « La lignée en liste », la note dans le journal
 *    du projet (onglet « Activité ») · aucune carte ni aucun trait de plus ;
 *  · au clavier · l'indicateur est un bouton · il choisit le nœud et porte le
 *    focus sur ses notes · écrire depuis le détail, `<script>` reste du texte ·
 *    le focus revient au bouton une fois la vue relue rendue ;
 *  · modifier la sienne (ancien texte gardé, relu sous « Textes précédents »),
 *    pas celle d'un autre · résoudre / rouvrir ;
 *  · nœud disparu (variante retirée) · la note passe dans « Notes sans nœud »,
 *    lisible, jamais supprimée ;
 *  · un lien, une clé inventée, un nœud d'un autre projet · refusés, rien écrit ;
 *  · rôle insuffisant, lecture seule, autre marque, autre espace · refus sans fuite.
 * 0 $ · fournisseur simulé, aucun appel réseau, aucune dépense.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios, session: null as SessionTest | null, marque: null as { id: string; name: string } | null }));
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
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => h.marque, listBrands: async () => [] }));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ spentUsd: 0, capUsd: 10, summary: '', blocked: false }) }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); }, notFound: () => { throw new Error('notFound'); }, usePathname: () => '/studio/projets', useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { randomUUID } from 'node:crypto';
import { db, schema, eq, sql } from '@tiktrends/db';
import { RAISON_LECTEUR_NOTE, RAISON_NOEUD_ABSENT, RAISON_PAS_UN_NOEUD } from '@tiktrends/core';
import { session, semer } from './studios-semis';
import { ctxDe } from './l3-harnais';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES } from './l4c-harnais';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { lireLigneeProjetPour } from '../lib/studios/lignee/lignee';
import { lireNotesLigneePour, noterNoeudPour, resoudreNoteLigneePour } from '../lib/studios/notes-lignee';
import { lireNotesLignee, modifierNoteLignee, noterNoeudLignee, resoudreNoteLignee } from '../app/actions/studios/notes-lignee';
import { lireActiviteProjet } from '../app/actions/studios/activite';
import { chargerProjet } from '../app/(spatial)/sp/studio/projets/[id]/donnees';
import { Projet } from '../spatial/vues/projet/Projet';
import ProjetSpatial from '../app/(spatial)/sp/studio/projets/[id]/page';
import { avecSpatial } from './spatial/fournisseur';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

const ids = h.ids;
const S = { projet: '', v1: '', job: '', va: '', vb: '', secret: '', secretV1: '' };
const ua = () => session(ids, 'ua', { plan: 'plus' });
const ur = () => session(ids, 'ur', { plan: 'plus' });
const LIGNEE = { disposition: 'libre', graphe: 'lignee' };
const page = (projectId: string, sp: Record<string, string> = LIGNEE) => ProjetSpatial({ params: Promise.resolve({ id: projectId }), searchParams: Promise.resolve(sp) });
const html = async (projectId: string, sp: Record<string, string> = LIGNEE) => renderToStaticMarkup(avecSpatial(await page(projectId, sp)));
const texte = (x: string) => x.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, '’').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const attr = (x: string, nom: string) => [...x.matchAll(new RegExp(`${nom}="([^"]*)"`, 'g'))].map((m) => m[1]!.replace(/&amp;/g, '&').replace(/&gt;/g, '>'));
/** Le morceau de HTML d'un élément de la liste (`<li data-element-lignee=…>` jusqu'au suivant). */
const element = (x: string, id: string) => { const i = x.indexOf(`data-element-lignee="${id}"`); const j = x.indexOf('data-element-lignee=', i + 10); return i < 0 ? '' : x.slice(i, j < 0 ? undefined : j); };
const nNotes = async () => Number(((await db.execute(sql.raw('select count(*)::int as n from studio_lineage_notes'))) as unknown as { rows: Array<{ n: number }> }).rows[0]!.n);
const code = (r: unknown) => (r as { code?: string }).code;
const notesDe = async (projectId: string) => db.select().from(schema.studioLineageNotes).where(eq(schema.studioLineageNotes.projectId, projectId));

let hote: HTMLDivElement | null = null; let root: Root | null = null;
afterEach(() => { if (root) act(() => root!.unmount()); root = null; hote?.remove(); hote = null; });
async function monter(projectId: string) {
  hote = document.createElement('div');
  document.body.appendChild(hote);
  root = createRoot(hote);
  const el = avecSpatial(await page(projectId));
  await act(async () => { root!.render(el); });
  return hote;
}
const attendre = async () => { await act(async () => { for (let i = 0; i < 30; i += 1) await new Promise((r) => setTimeout(r, 5)); }); };
const cliquer = async (el: Element | null | undefined) => { if (!el) throw new Error('élément absent'); await act(async () => { (el as HTMLElement).click(); }); await attendre(); };
const saisir = async (el: Element | null, v: string) => {
  if (!(el instanceof HTMLTextAreaElement)) throw new Error('champ absent');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
};

beforeAll(async () => {
  await semer(db, schema, ids);
  h.marque = { id: ids.brandA1, name: 'Marque A1' };
  const ctx = ctxDe(ids, 'ua');
  const p = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA1, userId: ids.ua, titre: 'Sérum · notes de lignée' });
  S.projet = p.projectId; S.v1 = p.versionId;
  S.job = await lancerLot(db, ctx, p.projectId, KEYFRAMES(2));
  await executer(db, S.job);
  const sorties = await sortiesDuJob(db, S.job);
  const a = await creerVariante(ctx, { assetId: sorties['keyframe:s1'] });
  const b = await creerVariante(ctx, { assetId: sorties['keyframe:s2'] });
  if (!a.ok || !b.ok) throw new Error('variantes');
  S.va = a.variante.id; S.vb = b.variante.id;
  const sec = await projetAvecBrief(db, { workspaceId: ids.wsA, brandId: ids.brandA2, userId: ids.ua, titre: 'Projet secret de la marque A2' });
  S.secret = sec.projectId; S.secretV1 = sec.versionId;
}, 120_000);

describe('PC E11 · poser une note sur un nœud · indicateur, liste, journal · rien d’autre ne change', () => {
  it('la note posée par l’action se lit sur la carte (indicateur), sous son nœud dans la liste et dans le journal · aucune carte ni aucun trait de plus', async () => {
    h.session = ua();
    const avant = await html(S.projet);
    const cartesAvant = attr(avant, 'data-carte').sort();
    const traitsAvant = attr(avant, 'data-lien').sort();
    expect(cartesAvant).toContain(`creation:${S.va}`);
    expect(avant).not.toContain('data-ouvrir-notes=');

    const r = await noterNoeudLignee({ projectId: S.projet, noeud: `creation:${S.va}`, texte: 'Le produit est trop petit sur cette création' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    const [l] = await notesDe(S.projet);
    expect(l).toMatchObject({ nodeKey: `creation:${S.va}`, authorId: ids.ua, body: 'Le produit est trop petit sur cette création', resolvedAt: null, history: [] });
    expect(l!.nodeLabel).toMatch(/^Création · Image 1 du lot 1$/);

    const x = await html(S.projet);
    // Sur le canvas · l'indicateur des notes OUVERTES, un bouton, et le nom accessible de la carte le dit.
    expect(attr(x, 'data-ouvrir-notes')).toEqual([`creation:${S.va}`]);
    expect(x).toMatch(new RegExp(`data-carte="creation:${S.va}"[^>]*aria-label="[^"]*· 1 note ouverte"`));
    expect(x).toMatch(/<button type="button" class="pill c" data-ouvrir-notes="[^"]*" aria-label="1 note ouverte sur « Création · Image 1 du lot 1 » · ouvrir les notes"/);
    // Dans la liste · la note SOUS son nœud, et sous lui seulement.
    const li = element(x, `creation:${S.va}`);
    expect(texte(li)).toContain('Notes · 1 note ouverte');
    expect(texte(li)).toContain('Le produit est trop petit sur cette création');
    expect(texte(element(x, `creation:${S.vb}`))).toContain('Notes · Aucune note sur ce nœud.');
    expect(texte(element(x, `creation:${S.vb}`))).not.toContain('Le produit est trop petit');
    // Aucun nœud libre, aucun lien · les cartes et les traits sont ceux de la lignée, exactement.
    expect(attr(x, 'data-carte').sort()).toEqual(cartesAvant);
    expect(attr(x, 'data-lien').sort()).toEqual(traitsAvant);
    const m = await lireLigneeProjetPour(ctxDe(ids, 'ua'), S.projet, { veilleOuverte: true, maintenant: new Date() });
    expect(m.ok && m.lignee.lignee.noeuds.map((n) => n.id).sort()).toEqual(cartesAvant);
    expect(x).not.toContain('data-notes-sans-noeud');

    // Le journal du projet · l'action, puis l'onglet « Activité » rendu.
    const j = await lireActiviteProjet({ projectId: S.projet, type: 'notes' });
    if (!j.ok) throw new Error(JSON.stringify(j));
    expect(j.journal.entrees.map((e) => [e.phrase, e.detail, e.lien?.href])).toEqual([['Note sur la lignée', 'Sur « Création · Image 1 du lot 1 »', `/studio/projets/${S.projet}?disposition=libre&graphe=lignee`]]);
    const c = await chargerProjet(h.session as never, S.projet);
    if (!c.ok) throw new Error(JSON.stringify(c.raison));
    const act0 = renderToStaticMarkup(avecSpatial(<Projet {...c.props} ongletInitial="activite" />));
    const ev = act0.slice(act0.indexOf('data-evenement="notes"'));
    expect(texte(ev.slice(0, ev.indexOf('</div>') + 200))).toMatch(/Note sur la lignée Sur « Création · Image 1 du lot 1 » \d\d\/\d\d\/\d{4} · \d\d:\d\d · Toi/);
    // Le texte de la note ne sort jamais dans le journal.
    expect(texte(act0.slice(act0.indexOf('data-journal-projet'), act0.indexOf('data-commentaires-projet')))).not.toContain('trop petit');
  });

  it('au clavier · l’indicateur choisit le nœud et porte le focus sur ses notes · écrire depuis le détail · `<script>` reste du texte · le focus revient au bouton', async () => {
    h.session = ua();
    const d = await monter(S.projet);
    const ind = d.querySelector<HTMLButtonElement>(`[data-ouvrir-notes="creation:${S.va}"]`)!;
    expect(ind.tagName).toBe('BUTTON');
    ind.focus();
    await cliquer(ind);
    const panneau = d.querySelector(`[data-notes-panneau="detail:creation:${S.va}"]`)!;
    expect(panneau, 'les notes du nœud dans le détail').toBeTruthy();
    expect(document.activeElement).toBe(panneau.querySelector('[data-titre-notes]'));
    expect(panneau.querySelector('[data-texte-note]')!.textContent).toBe('Le produit est trop petit sur cette création');

    await cliquer(panneau.querySelector('[data-geste="ecrire-note"]'));
    expect(document.activeElement).toBe(panneau.querySelector('[data-champ="texte-note"]'));
    // Vide · le bouton reste focalisable, fermé, sa raison écrite à côté.
    expect(panneau.querySelector('[data-geste="poser-note"]')!.getAttribute('aria-disabled')).toBe('true');
    expect(panneau.querySelector('[data-raison-ferme="poser-note"]')!.textContent).toBe('La note est vide · écris ce que tu veux retenir sur ce nœud.');
    await saisir(panneau.querySelector('[data-champ="texte-note"]'), '<script>alert("x")</script> à vérifier');
    await cliquer(panneau.querySelector('[data-geste="poser-note"]'));
    await vi.waitFor(() => expect(d.querySelectorAll(`[data-notes-panneau="detail:creation:${S.va}"] [data-note]`).length).toBe(2));
    const p2 = d.querySelector(`[data-notes-panneau="detail:creation:${S.va}"]`)!;
    expect([...p2.querySelectorAll('[data-texte-note]')].map((e) => e.textContent)).toEqual(['Le produit est trop petit sur cette création', '<script>alert("x")</script> à vérifier']);
    expect(d.querySelectorAll('script').length, 'une balise <script> a été créée').toBe(0);
    expect(p2.querySelector('[data-titre-notes]')!.textContent).toContain('2 notes ouvertes');
    expect(d.querySelector(`[data-ouvrir-notes="creation:${S.va}"]`)!.textContent).toBe('2 notes');
    await vi.waitFor(() => expect(document.activeElement).toBe(p2.querySelector('[data-geste="ecrire-note"]')));
    expect(p2.querySelector('[role="status"], [data-message]')?.textContent ?? p2.textContent).toContain('Note posée sur « Création · Image 1 du lot 1 ».');
    expect((await notesDe(S.projet)).map((n) => n.body).sort()).toEqual(['<script>alert("x")</script> à vérifier', 'Le produit est trop petit sur cette création']);
  });
});

describe('PC E11 · modifier la sienne (ancien texte gardé), pas celle d’un autre · résoudre / rouvrir', () => {
  it('modifier SA note depuis la liste · l’ancien texte est gardé en base et relu sous « Textes précédents »', async () => {
    h.session = ua();
    const d = await monter(S.projet);
    const [k] = (await notesDe(S.projet)).filter((n) => n.body.startsWith('Le produit'));
    const ici = d.querySelector(`[data-notes-panneau="liste:creation:${S.va}"] [data-note="${k!.id}"]`)!;
    await cliquer(ici.querySelector('[data-geste="modifier-note"]'));
    await saisir(ici.querySelector('[data-champ="edition-note"]'), 'Le produit est trop petit · agrandir de 20 %');
    await cliquer(ici.querySelector('[data-geste="enregistrer-note"]'));
    await vi.waitFor(() => expect(d.querySelector(`[data-notes-panneau="liste:creation:${S.va}"] [data-note="${k!.id}"] [data-texte-note]`)?.textContent).toBe('Le produit est trop petit · agrandir de 20 %'));
    const apres = d.querySelector(`[data-notes-panneau="liste:creation:${S.va}"] [data-note="${k!.id}"]`)!;
    expect(apres.querySelector('[data-modifie-note]')!.textContent).toMatch(/^Modifiée le \d\d\/\d\d\/\d{4} · \d\d:\d\d$/);
    expect(apres.querySelector('[data-anciens-textes] summary')!.textContent).toBe('Textes précédents · 1');
    expect(apres.querySelector('[data-ancien-texte]')!.textContent).toMatch(/^Remplacé le .* · Le produit est trop petit sur cette création$/);
    await vi.waitFor(() => expect(document.activeElement).toBe(apres.querySelector('[data-geste="modifier-note"]')));
    const [l] = (await notesDe(S.projet)).filter((n) => n.id === k!.id);
    expect(l!.body).toBe('Le produit est trop petit · agrandir de 20 %');
    expect((l!.history as Array<{ texte: string }>).map((x) => x.texte)).toEqual(['Le produit est trop petit sur cette création']);
    expect(l!.editedAt).not.toBeNull();
  });

  it('la note d’un autre · ni geste « Modifier » à l’écran, ni écriture par l’action · résoudre reste possible', async () => {
    const [k] = (await notesDe(S.projet)).filter((n) => n.body.startsWith('Le produit'));
    h.session = ur();
    const r = await modifierNoteLignee({ noteId: k!.id, rowVersion: k!.rowVersion, texte: 'Je réécris ta note' });
    expect(!r.ok && [r.code, r.message]).toEqual(['FORBIDDEN', 'Seule la personne qui l’a écrite peut la modifier · ajoute une nouvelle note.']);
    expect((await notesDe(S.projet)).find((n) => n.id === k!.id)!.body).toBe('Le produit est trop petit · agrandir de 20 %');
    const dom = new DOMParser().parseFromString(await html(S.projet), 'text/html');
    const note = dom.querySelector(`[data-notes-panneau="liste:creation:${S.va}"] [data-note="${k!.id}"]`)!;
    expect(note, 'la note d’un autre est lue').toBeTruthy();
    expect([...note.querySelectorAll('[data-geste]')].map((b) => b.getAttribute('data-geste'))).toEqual(['resoudre-note']);
    // Sa propre note garde son geste « Modifier ».
    h.session = ua();
    const dua = new DOMParser().parseFromString(await html(S.projet), 'text/html');
    expect([...dua.querySelector(`[data-notes-panneau="liste:creation:${S.va}"] [data-note="${k!.id}"]`)!.querySelectorAll('[data-geste]')].map((b) => b.getAttribute('data-geste'))).toEqual(['modifier-note', 'resoudre-note']);
  });

  it('résoudre (par un autre membre) puis rouvrir · l’indicateur ne compte que les ouvertes · le journal dit la résolution · jamais supprimée', async () => {
    const [k] = (await notesDe(S.projet)).filter((n) => n.body.startsWith('Le produit'));
    h.session = ur();
    const d = await monter(S.projet);
    const ici = () => d.querySelector(`[data-notes-panneau="liste:creation:${S.va}"] [data-note="${k!.id}"]`)!;
    await cliquer(ici().querySelector('[data-geste="resoudre-note"]'));
    await vi.waitFor(() => expect(ici().getAttribute('data-resolue')).toBe('oui'));
    expect(ici().querySelector('[data-resolue-par]')!.textContent).toMatch(/^Résolue par Toi · \d\d\/\d\d\/\d{4} · \d\d:\d\d$/);
    expect(d.querySelector(`[data-ouvrir-notes="creation:${S.va}"]`)!.textContent).toBe('1 note');
    await vi.waitFor(() => expect(document.activeElement).toBe(ici().querySelector('[data-geste="rouvrir-note"]')));
    const [res] = (await notesDe(S.projet)).filter((n) => n.id === k!.id);
    expect([res!.resolvedBy, !!res!.resolvedAt]).toEqual([ids.ur, true]);
    const j = await lireActiviteProjet({ projectId: S.projet, type: 'notes' });
    expect(j.ok && j.journal.entrees.map((e) => e.phrase)).toEqual(['Note de la lignée résolue', 'Note sur la lignée', 'Note sur la lignée']);

    await cliquer(ici().querySelector('[data-geste="rouvrir-note"]'));
    await vi.waitFor(() => expect(ici().getAttribute('data-resolue')).toBe('non'));
    expect(d.querySelector(`[data-ouvrir-notes="creation:${S.va}"]`)!.textContent).toBe('2 notes');
    const [rouv] = (await notesDe(S.projet)).filter((n) => n.id === k!.id);
    expect([rouv!.resolvedBy, rouv!.resolvedAt]).toEqual([null, null]);
    expect(await nNotes()).toBe(2);
    // La base refuse la suppression · une note se résout.
    await expect(db.delete(schema.studioLineageNotes).where(eq(schema.studioLineageNotes.id, k!.id))).rejects.toThrow(/NOTE_JAMAIS_SUPPRIMEE/);
    expect(await nNotes()).toBe(2);
  });
});

describe('PC E11 · nœud disparu · la note reste lisible dans « Notes sans nœud »', () => {
  it('la variante vb est retirée · sa carte disparaît, sa note passe dans « Notes sans nœud » sous le libellé gardé · rien n’est supprimé, la note se résout encore', async () => {
    h.session = ua();
    const r = await noterNoeudLignee({ projectId: S.projet, noeud: `creation:${S.vb}`, texte: 'Variante à écarter' });
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(attr(await html(S.projet), 'data-ouvrir-notes').sort()).toEqual([`creation:${S.va}`, `creation:${S.vb}`].sort());
    // La donnée est retirée (la variante n'existe plus) · la projection ne la donne plus.
    await db.delete(schema.studioVariants).where(eq(schema.studioVariants.id, S.vb));
    const x = await html(S.projet);
    expect(attr(x, 'data-carte')).not.toContain(`creation:${S.vb}`);
    expect(attr(x, 'data-ouvrir-notes')).toEqual([`creation:${S.va}`]);
    const sans = x.slice(x.indexOf('data-notes-sans-noeud'));
    expect(texte(sans)).toMatch(/^.*?Notes sans nœud · 1 Le nœud de ces notes n’est plus dans la lignée/);
    expect(texte(sans)).toMatch(/ua@studios\.test|Toi/);
    expect(texte(sans)).toContain('sur « Création · Image 2 du lot 1 »');
    expect(texte(sans)).toContain('Variante à écarter');
    expect(await nNotes()).toBe(3);
    // Toujours un fil · on la résout depuis « Notes sans nœud ».
    const d = await monter(S.projet);
    const [k] = (await notesDe(S.projet)).filter((n) => n.body === 'Variante à écarter');
    await cliquer(d.querySelector(`[data-notes-panneau="sans-noeud"] [data-note="${k!.id}"] [data-geste="resoudre-note"]`));
    await vi.waitFor(() => expect(d.querySelector(`[data-notes-panneau="sans-noeud"] [data-note="${k!.id}"]`)!.getAttribute('data-resolue')).toBe('oui'));
    // Le journal la dit encore, sous le libellé gardé.
    const j = await lireActiviteProjet({ projectId: S.projet, type: 'notes' });
    expect(j.ok && j.journal.entrees.slice(0, 2).map((e) => [e.phrase, e.detail])).toEqual([['Note de la lignée résolue', 'Sur « Création · Image 2 du lot 1 »'], ['Note sur la lignée', 'Sur « Création · Image 2 du lot 1 »']]);
  });

  it('poser une note sur un nœud disparu · refusé, rien écrit', async () => {
    h.session = ua();
    const avant = await nNotes();
    const r = await noterNoeudLignee({ projectId: S.projet, noeud: `creation:${S.vb}`, texte: 'Trop tard' });
    expect(!r.ok && [r.code, r.message]).toEqual(['INVALID_SCHEMA', RAISON_NOEUD_ABSENT]);
    expect(await nNotes()).toBe(avant);
  });
});

describe('PC E11 · jamais un lien, jamais libre, jamais d’ailleurs · refus sans fuite', () => {
  it('un lien, un texte libre, une clé inventée, le nœud d’un autre projet · refusés avec leur raison, rien écrit', async () => {
    h.session = ua();
    const avant = await nNotes();
    const essai = (noeud: unknown, t = 'x') => noterNoeudLignee({ projectId: S.projet, noeud, texte: t });
    for (const [noeud, raison] of [
      [`brief:${S.v1}>groupe:${S.job}`, RAISON_PAS_UN_NOEUD], ['une note libre', RAISON_PAS_UN_NOEUD], [{ x: 1, y: 2 }, RAISON_PAS_UN_NOEUD], ['keyframe:s1', RAISON_PAS_UN_NOEUD],
      [`creation:${randomUUID()}`, RAISON_NOEUD_ABSENT], [`brief:${S.secretV1}`, RAISON_NOEUD_ABSENT],
    ] as const) {
      const r = await essai(noeud);
      expect(!r.ok && [r.code, r.message], JSON.stringify(noeud)).toEqual(['INVALID_SCHEMA', raison]);
    }
    const vide = await essai(`brief:${S.v1}`, ' \n ');
    expect(!vide.ok && vide.message).toBe('La note est vide · écris ce que tu veux retenir sur ce nœud.');
    expect(code(await essai(`brief:${S.v1}`, 'x'.repeat(2001)))).toBe('INVALID_SCHEMA');
    expect(await nNotes()).toBe(avant);
  });

  it('rôle insuffisant (lecteur client) · ni lecture ni écriture · refus sans fuite, rien écrit', async () => {
    const avant = await nNotes();
    const [k] = await notesDe(S.projet);
    h.session = session(ids, 'uv', { plan: 'plus' });
    for (const r of [
      await lireNotesLignee({ projectId: S.projet }),
      await noterNoeudLignee({ projectId: S.projet, noeud: `brief:${S.v1}`, texte: 'Je passe' }),
      await modifierNoteLignee({ noteId: k!.id, rowVersion: k!.rowVersion, texte: 'Je passe' }),
      await resoudreNoteLignee({ noteId: k!.id, rowVersion: k!.rowVersion, resolue: true }),
    ]) {
      expect(code(r)).toBe('FORBIDDEN');
      expect(JSON.stringify(r)).not.toMatch(/Sérum|produit|Variante|ua@studios/);
    }
    expect(await nNotes()).toBe(avant);
  });

  it('lecture seule (`studio.read` sans `studio.propose`) · lit les notes · n’écrit pas, ne résout pas · la vue le dit, sans formulaire ni geste', async () => {
    const avant = await nNotes();
    const lecteur = { ...ctxDe(ids, 'ua'), permissions: { espace: new Set(['studio.read'] as const), plateforme: new Set<never>() } } as never;
    const l = await lireNotesLigneePour(lecteur, { projectId: S.projet });
    expect(l.ok && [l.peutEcrire, l.notes.length]).toEqual([false, 3]);
    expect(l.ok && l.notes.every((n) => !n.gestes.modifier.ok && !n.gestes.resoudre.ok && !n.gestes.rouvrir.ok && n.gestes.resoudre.raison === RAISON_LECTEUR_NOTE)).toBe(true);
    expect(code(await noterNoeudPour(lecteur, { projectId: S.projet, noeud: `brief:${S.v1}`, texte: 'Je passe' }, { veilleOuverte: true, maintenant: new Date() }))).toBe('FORBIDDEN');
    const [k] = await notesDe(S.projet);
    expect(code(await resoudreNoteLigneePour(lecteur, { noteId: k!.id, rowVersion: k!.rowVersion, resolue: true }))).toBe('FORBIDDEN');
    expect(await nNotes()).toBe(avant);
    // La vue rendue avec ces notes · la raison du lecteur, aucun formulaire, aucun geste.
    const { NotesNoeud, useNotesLignee } = await import('../spatial/vues/projet/NotesLignee');
    function Lecteur() {
      const ctl = useNotesLignee(S.projet, l.ok ? { ok: true, vue: { peutEcrire: l.peutEcrire, notes: l.notes } } : null);
      return <NotesNoeud noeud={{ id: `creation:${S.va}`, titre: 'Image 1 du lot 1' }} notes={ctl.vue!.notes.filter((n) => n.noeud === `creation:${S.va}`)} lieu="liste" ctl={ctl} />;
    }
    const x = renderToStaticMarkup(avecSpatial(<Lecteur />));
    expect(texte(x)).toContain(RAISON_LECTEUR_NOTE);
    expect(x).not.toContain('data-geste=');
    expect(x).not.toContain('<textarea');
    expect(x.match(/data-note="/g)).toHaveLength(2);
  });

  it('autre marque (`ur`, restreint à A1) · autre espace (`ub`) · introuvable, même message neutre, rien écrit, rien lu', async () => {
    const avant = await nNotes();
    const [k] = await notesDe(S.projet);
    // Une note dans le projet de A2, posée par qui la voit.
    h.session = ua();
    const sec = await noterNoeudLignee({ projectId: S.secret, noeud: `brief:${S.secretV1}`, texte: 'Note secrète de A2' });
    if (!sec.ok) throw new Error(JSON.stringify(sec));
    const [ks] = await notesDe(S.secret);
    h.session = ur();
    for (const r of [
      await lireNotesLignee({ projectId: S.secret }),
      await noterNoeudLignee({ projectId: S.secret, noeud: `brief:${S.secretV1}`, texte: 'Intrus' }),
      await modifierNoteLignee({ noteId: ks!.id, rowVersion: ks!.rowVersion, texte: 'Intrus' }),
      await resoudreNoteLignee({ noteId: ks!.id, rowVersion: ks!.rowVersion, resolue: true }),
    ]) {
      expect(code(r)).toBe('NOT_FOUND');
      expect(JSON.stringify(r)).not.toMatch(/secr|A2|ua@studios/);
    }
    h.session = session(ids, 'ub', { plan: 'plus' });
    for (const r of [
      await lireNotesLignee({ projectId: S.projet }),
      await noterNoeudLignee({ projectId: S.projet, noeud: `brief:${S.v1}`, texte: 'Intrus' }),
      await modifierNoteLignee({ noteId: k!.id, rowVersion: k!.rowVersion, texte: 'Intrus' }),
      await resoudreNoteLignee({ noteId: k!.id, rowVersion: k!.rowVersion, resolue: true }),
    ]) {
      expect(code(r)).toBe('NOT_FOUND');
      expect(JSON.stringify(r)).not.toMatch(/Sérum|produit|Variante|ua@studios/);
    }
    const x = await html(S.projet);
    expect(x).not.toContain('data-note=');
    expect(x).not.toContain('Variante à écarter');
    expect(await nNotes()).toBe(avant + 1);
    expect((await notesDe(S.secret)).map((n) => [n.body, n.resolvedAt])).toEqual([['Note secrète de A2', null]]);
  });
});
