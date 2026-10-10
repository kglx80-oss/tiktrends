import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * R4 · les dépenses « à réconcilier » À L'ÉCRAN du propriétaire, sur une VRAIE
 * base (pglite, migrations du dépôt dont 0055). On REND la vraie page
 * `/admin/depenses` et on lit le HTML :
 *
 *  · rempli · nombre, montant compté au maximum, cause en clair, date, action,
 *    et le geste attendu (comparer à la facture) ; une ligne ordinaire n'y
 *    figure pas ;
 *  · vide · le silence dit ; erreur de lecture · dite, la page tient ;
 *  · consulter n'écrit RIEN (lignes `ai_spend` identiques, au champ près) ;
 *  · porte · un admin d'espace qui n'est pas fondateur (plateforme) est
 *    renvoyé AVANT toute lecture, un membre aussi ; rien ne fuit.
 */

const etat = vi.hoisted(() => ({ session: null as unknown, lectures: 0 }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return {
    ...actual, db,
    // Espion de lecture · compte les lectures « à réconcilier », sans en changer le résultat.
    lireDepensesAReconcilier: (...a: Parameters<typeof actual.lireDepensesAReconcilier>) => { etat.lectures++; return actual.lireDepensesAReconcilier(...a); },
  };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); } }));

import { randomUUID } from 'node:crypto';
import { db, schema } from '@tiktrends/db';
import DepensesPage from '../app/(app)/admin/depenses/page';
import { SectionReconciliation } from '../app/(app)/admin/depenses/SectionReconciliation';

const FONDATEUR = 'fondateur-r4@exemple.invalid';
const env = { f: process.env.FOUNDER_EMAILS, cap: process.env.AI_SPEND_CAP_USD };
const sess = (role: string, email: string) => ({ user: { id: randomUUID(), email, name: 'K' }, workspaceId: randomUUID(), workspaceName: 'Espace', role, plan: 'business', equipe: null });

/** Le texte visible d'un fragment HTML. */
const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const section = (html: string) => {
  const m = /<section[^>]*id="a-reconcilier"[\s\S]*?<\/section>/.exec(html);
  return m ? m[0] : '';
};
const tout = () => db!.select().from(schema.aiSpend).orderBy(schema.aiSpend.id);

const il = (h: number) => new Date(Date.now() - h * 3_600_000);

beforeAll(() => { process.env.FOUNDER_EMAILS = FONDATEUR; process.env.AI_SPEND_CAP_USD = '10'; });
afterAll(() => {
  for (const [k, v] of [['FOUNDER_EMAILS', env.f], ['AI_SPEND_CAP_USD', env.cap]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});
beforeEach(async () => {
  await db!.delete(schema.aiSpend);
  etat.lectures = 0;
  etat.session = sess('owner', FONDATEUR);
});

async function semer() {
  await db!.insert(schema.aiSpend).values([
    { provider: 'anthropic', model: 'claude-sonnet-5', action: 'studio:brief', estimatedUsd: 0.42, actualUsd: 0.42, reconcileReason: 'coupure', createdAt: il(2) },
    { provider: 'fal', model: 'nano-banana', action: 'studio:image', estimatedUsd: 0.3, actualUsd: 0.3, reconcileReason: 'delai', createdAt: il(5) },
    // Ligne ordinaire réglée · jamais « à réconcilier ».
    { provider: 'anthropic', model: 'claude-sonnet-5', action: 'jarvis:chat', estimatedUsd: 0.2, actualUsd: 0.05, inputTokens: 100, outputTokens: 20, createdAt: il(1) },
    // Hors fenêtre de 30 jours.
    { provider: 'anthropic', model: 'claude-sonnet-5', action: 'vieux:appel', estimatedUsd: 1, actualUsd: 1, reconcileReason: 'service', createdAt: il(24 * 40) },
  ]);
}

describe('R4 · /admin/depenses · section « à réconcilier » au HTML rendu', () => {
  it('rempli · nombre, montant au maximum, cause en clair, date, action, geste attendu', async () => {
    await semer();
    const html = renderToStaticMarkup(await DepensesPage());
    const s = section(html);
    expect(s, 'la section « à réconcilier » n’est pas rendue').not.toBe('');
    expect(s).toContain('data-reconciliation="rempli"');
    const t = texte(s);
    expect(t).toContain('À réconcilier avec la facture');
    expect(t).toContain('2 à rapprocher');
    expect(t).toContain('2 dépenses à réconcilier · 0,72 $ comptés au plafond au maximum, en attendant la facture.');
    expect(t).toContain('Anthropic · 1 ligne · 0,4200 $');
    expect(t).toContain('fal · 1 ligne · 0,3000 $');
    expect(t).toContain('connexion coupée ou réponse perdue après envoi');
    expect(t).toContain('délai dépassé · le fournisseur a pu terminer et facturer');
    expect(t).toContain('Retrouve chaque appel sur la facture du fournisseur à la date indiquée et compare au maximum réservé.');
    const lignes = [...s.matchAll(/data-ligne-reconcilier="[^"]+"[\s\S]*?<\/li>/g)].map((m) => texte(m[0]));
    expect(lignes.length).toBe(2);
    expect(lignes[0]).toContain('studio:brief');
    expect(lignes[0]).toContain('0,4200 $ au maximum, compté au plafond');
    expect(lignes[0]).toMatch(/Quand \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
    expect(lignes[0]).toMatch(/Chercher cet appel sur la facture Anthropic du \d{2}\/\d{2}\/\d{4} · comparer à 0,4200 \$ comptés au plafond\./);
    expect(lignes[1]).toContain('studio:image');
    expect(t, 'une ligne ordinaire ou hors fenêtre est listée').not.toMatch(/jarvis:chat|vieux:appel/);
    // La section précède le détail des postes · c'est elle qui demande un geste.
    expect(html.indexOf('id="a-reconcilier"')).toBeLessThan(html.indexOf('Où part l’argent'));
    expect(s, 'tiret cadratin dans la section').not.toContain('—');
    expect(html).not.toMatch(/Trendtrack/i);
  });

  it('vide · le silence est dit, aucune liste', async () => {
    const s = section(renderToStaticMarkup(await DepensesPage()));
    expect(s).toContain('data-reconciliation="vide"');
    expect(texte(s)).toContain('Rien à rapprocher');
    expect(texte(s)).toContain('Aucune dépense à réconcilier.');
    expect(s).not.toContain('data-ligne-reconcilier');
  });

  it('erreur de lecture · dite en toutes lettres (alerte), sans liste', () => {
    const s = renderToStaticMarkup(<SectionReconciliation ecran={null} erreur="erreur de lecture en base" />);
    expect(s).toContain('data-reconciliation="erreur"');
    expect(s).toContain('role="alert"');
    expect(texte(s)).toContain('Lecture impossible');
    expect(texte(s)).toContain('Les lignes à réconcilier n’ont pas pu être lues · erreur de lecture en base.');
  });

  it('consulter n’écrit rien · lignes `ai_spend` identiques au champ près', async () => {
    await semer();
    const avant = await tout();
    renderToStaticMarkup(await DepensesPage());
    renderToStaticMarkup(await DepensesPage());
    expect(await tout(), 'la consultation a modifié ai_spend').toEqual(avant);
    expect(etat.lectures).toBe(2);
  });
});

describe('R4 · /admin/depenses · porte plateforme', () => {
  it('admin d’espace non fondateur · renvoyé vers /admin AVANT toute lecture', async () => {
    await semer();
    etat.session = sess('admin', 'admin-espace@exemple.invalid');
    await expect(DepensesPage()).rejects.toThrow('redirect /admin');
    expect(etat.lectures, 'un admin d’espace a déclenché la lecture des dépenses').toBe(0);
  });

  it('propriétaire d’un espace client non fondateur · même refus', async () => {
    etat.session = sess('owner', 'client@exemple.invalid');
    await expect(DepensesPage()).rejects.toThrow('redirect /admin');
    expect(etat.lectures).toBe(0);
  });

  it('membre · renvoyé au tableau de bord ; sans session · connexion', async () => {
    etat.session = sess('member', FONDATEUR);
    await expect(DepensesPage()).rejects.toThrow('redirect /dashboard');
    etat.session = null;
    await expect(DepensesPage()).rejects.toThrow('redirect /login');
    expect(etat.lectures).toBe(0);
  });
});
