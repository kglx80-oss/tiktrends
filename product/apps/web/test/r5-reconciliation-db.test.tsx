import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * R5 · le geste de réconciliation, sur une VRAIE base (pglite, migrations du
 * dépôt dont 0056), par la VRAIE action serveur et la VRAIE page. On lit les
 * RÉSULTATS : lignes en base, somme retenue par le plafond, décision d'une
 * réservation réelle (`guardFixedCost`), HTML rendu.
 *
 *  · le plafond SUIT le montant facturé : une réservation refusée avant la
 *    réconciliation passe après ; le compteur affiché change ; la ligne
 *    `ai_spend` ne change pas (montant réservé et cause gardés) ;
 *  · idempotence : la même soumission rejouée ⇒ UNE réconciliation ;
 *  · refus : admin d'espace non fondateur (aucune lecture ni écriture en
 *    base), sans preuve ni motif, devise non gérée, ligne déjà réconciliée
 *    sous une autre clé, ligne qui n'est pas à réconcilier ;
 *  · écran : la ligne sort de « À réconcilier » et entre dans « Réconciliées »
 *    (réservé, facturé, preuve, motif, auteur, date) ; le formulaire est rendu
 *    sur chaque ligne à réconcilier, libellés persistants.
 */

const etat = vi.hoisted(() => ({ session: null as unknown, compter: false, acces: [] as string[] }));
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const brut = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  // Espion d'accès · toute lecture ou écriture passée par le client est comptée, sans en changer le résultat.
  const ACCES = new Set(['select', 'insert', 'update', 'delete', 'transaction', 'execute', 'query']);
  const db = new Proxy(brut, {
    get(t, p, r) {
      const v = Reflect.get(t, p, r);
      if (typeof p === 'string' && ACCES.has(p) && typeof v === 'function') {
        return (...a: unknown[]) => { if (etat.compter) etat.acces.push(p); return (v as (...x: unknown[]) => unknown).apply(t, a); };
      }
      return v;
    },
  });
  return { ...actual, db };
});
vi.mock('../lib/auth', () => ({ getSession: async () => etat.session }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`redirect ${u}`); } }));
vi.mock('next/cache', () => ({ revalidatePath: () => {} }));

import { randomUUID } from 'node:crypto';
import { db, schema, eq } from '@tiktrends/db';
import { reconcilierDepenseAction, type EtatReconciliationForm } from '../app/actions/reconciliation-depense';
import DepensesPage from '../app/(app)/admin/depenses/page';
import { spendStatus, guardFixedCost, SpendBlockedError } from '../lib/spend-guard';

const FONDATEUR = 'fondateur-r5@exemple.invalid';
const ADMIN_ESPACE = 'admin-espace-r5@exemple.invalid';
const ids = { fondateur: randomUUID(), admin: randomUUID(), ws: randomUUID() };
const env = { f: process.env.FOUNDER_EMAILS, cap: process.env.AI_SPEND_CAP_USD };
const sess = (role: string, email: string, id: string) => ({ user: { id, email, name: 'K' }, workspaceId: ids.ws, workspaceName: 'Espace', role, plan: 'business', equipe: null });

const texte = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
const bloc = (html: string, id: string) => (new RegExp(`<section[^>]*id="${id}"[\\s\\S]*?</section>`).exec(html) ?? [''])[0];
const il = (h: number) => new Date(Date.now() - h * 3_600_000);
const INITIAL: EtatReconciliationForm = { statut: 'initial', message: '' };

function formulaire(o: Partial<Record<'ligne' | 'montant' | 'devise' | 'preuve' | 'motif' | 'cle', string>>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ devise: 'USD', preuve: 'in_1QxYz · ligne 4', motif: 'Facture d’octobre, requête retrouvée', cle: `cle-${randomUUID()}`, ...o })) if (v !== undefined) fd.set(k, v);
  return fd;
}
/** Soumet comme le navigateur · rend l'état du formulaire, ou l'adresse du renvoi après succès. */
async function soumettre(fd: FormData): Promise<EtatReconciliationForm | { redirect: string }> {
  try { return await reconcilierDepenseAction(INITIAL, fd); } catch (e) {
    const m = /^redirect (.+)$/.exec((e as Error).message);
    if (m) return { redirect: m[1]! };
    throw e;
  }
}
const reconciliations = () => db.select().from(schema.aiSpendReconciliations);
const ligne = async (id: string) => (await db.select().from(schema.aiSpend).where(eq(schema.aiSpend.id, id)))[0]!;

beforeAll(async () => {
  process.env.FOUNDER_EMAILS = FONDATEUR;
  process.env.AI_SPEND_CAP_USD = '1';
  await db.insert(schema.users).values([{ id: ids.fondateur, email: FONDATEUR }, { id: ids.admin, email: ADMIN_ESPACE }]);
});
afterAll(() => {
  for (const [k, v] of [['FOUNDER_EMAILS', env.f], ['AI_SPEND_CAP_USD', env.cap]] as const) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
});
beforeEach(() => { etat.session = sess('owner', FONDATEUR, ids.fondateur); etat.compter = false; etat.acces = []; });

/** Une ligne « à réconcilier » neuve (les réconciliations sont en ajout seul : on n'efface rien entre les tests). */
async function aReconcilier(usd: number, action = 'studio:brief', h = 2): Promise<string> {
  const [l] = await db.insert(schema.aiSpend).values({ provider: 'anthropic', model: 'claude-sonnet-5', action, estimatedUsd: usd, actualUsd: usd, reconcileReason: 'coupure', createdAt: il(h) }).returning();
  return l!.id;
}

describe('R5 · le plafond suit le montant facturé', () => {
  it('réservation refusée au maximum réservé, acceptée après réconciliation ; la ligne ai_spend ne change pas', async () => {
    const id = await aReconcilier(0.95);
    const avant = await ligne(id);
    expect((await spendStatus()).spentUsd).toBeCloseTo(0.95, 9);
    await expect(guardFixedCost('fal_image', { workspaceId: ids.ws, action: 'r5:essai' }), 'la réserve incertaine ne compte pas au plafond').rejects.toBeInstanceOf(SpendBlockedError);

    const r = await soumettre(formulaire({ ligne: id, montant: '0,4' }));
    expect(r).toMatchObject({ redirect: expect.stringMatching(/^\/admin\/depenses\?reconciliee=[0-9a-f-]{36}#reconciliees$/) });

    expect((await spendStatus()).spentUsd, 'le plafond retient encore le réservé après réconciliation').toBeCloseTo(0.4, 9);
    const reserve = await guardFixedCost('fal_image', { workspaceId: ids.ws, action: 'r5:essai' });
    expect(reserve, 'le restant n’a pas suivi le facturé').toEqual(expect.any(String));
    expect((await spendStatus()).spentUsd).toBeCloseTo(0.48, 9);
    expect(await ligne(id), 'la ligne ai_spend a été réécrite').toEqual(avant);
    const [rec] = (await reconciliations()).filter((x) => x.aiSpendId === id);
    expect(rec).toMatchObject({ reservedMicros: 950_000, billedMicros: 400_000, currency: 'USD', providerRef: 'in_1QxYz · ligne 4', reason: 'Facture d’octobre, requête retrouvée', authorId: ids.fondateur });
  });

  it('facturé SUPÉRIEUR au réservé · accepté et compté tel quel', async () => {
    const base = (await spendStatus()).spentUsd;
    const id = await aReconcilier(0.1, 'studio:image');
    expect(await soumettre(formulaire({ ligne: id, montant: '0.25' }))).toMatchObject({ redirect: expect.any(String) });
    expect((await spendStatus()).spentUsd - base, 'un facturé supérieur au réservé n’est pas compté').toBeCloseTo(0.25, 9);
  });
});

describe('R5 · idempotence', () => {
  it('double soumission (même clé) ⇒ une seule réconciliation, la seconde le dit', async () => {
    const id = await aReconcilier(0.2);
    const fd = formulaire({ ligne: id, montant: '0,15', cle: 'cle-double-r5-0001' });
    const a = await soumettre(fd);
    const b = await soumettre(formulaire({ ligne: id, montant: '0,99', cle: 'cle-double-r5-0001' }));
    const recs = (await reconciliations()).filter((x) => x.aiSpendId === id);
    expect(recs, 'double soumission ⇒ doublon').toHaveLength(1);
    expect(recs[0]!.billedMicros, 'la seconde soumission a changé le montant').toBe(150_000);
    expect((a as { redirect: string }).redirect).toBe(`/admin/depenses?reconciliee=${recs[0]!.id}#reconciliees`);
    expect((b as { redirect: string }).redirect).toBe(`/admin/depenses?reconciliee=${recs[0]!.id}&deja=1#reconciliees`);
  });

  it('une autre clé sur une ligne déjà réconciliée ⇒ refus, rien de plus', async () => {
    const id = await aReconcilier(0.2);
    await soumettre(formulaire({ ligne: id, montant: '0,1' }));
    const r = await soumettre(formulaire({ ligne: id, montant: '0,05' }));
    expect(r).toMatchObject({ statut: 'refus', message: expect.stringContaining('Cette ligne a déjà été réconciliée le ') });
    expect((await reconciliations()).filter((x) => x.aiSpendId === id)).toHaveLength(1);
  });
});

describe('R5 · refus', () => {
  it('admin d’espace non fondateur ⇒ refus, AUCUNE lecture ni écriture en base', async () => {
    const id = await aReconcilier(0.2);
    const n = (await reconciliations()).length;
    etat.session = sess('admin', ADMIN_ESPACE, ids.admin);
    etat.compter = true;
    const r = await soumettre(formulaire({ ligne: id, montant: '0,1' }));
    etat.compter = false;
    expect(r).toEqual({ statut: 'refus', message: 'Réservé au fondateur (plateforme) · aucune ligne n’a été lue ni modifiée.' });
    expect(etat.acces, 'un admin d’espace a touché la base').toEqual([]);
    expect((await reconciliations()).length).toBe(n);
    // Membre et sans session · même refus, rien en base.
    for (const s of [sess('member', FONDATEUR, ids.fondateur), null]) {
      etat.session = s;
      etat.compter = true;
      expect(await soumettre(formulaire({ ligne: id, montant: '0,1' }))).toMatchObject({ statut: 'refus' });
      etat.compter = false;
    }
    expect(etat.acces).toEqual([]);
  });

  it('sans preuve ni motif ⇒ refus nommé, rien en base', async () => {
    const id = await aReconcilier(0.2);
    etat.compter = true;
    const r = await soumettre(formulaire({ ligne: id, montant: '0,1', preuve: '', motif: ' ' }));
    etat.compter = false;
    expect(r).toMatchObject({ statut: 'refus', erreurs: [{ champ: 'preuve' }, { champ: 'motif' }] });
    expect(etat.acces).toEqual([]);
    expect((await reconciliations()).filter((x) => x.aiSpendId === id)).toHaveLength(0);
  });

  it('devise non gérée ⇒ refus, aucune conversion, rien en base', async () => {
    const id = await aReconcilier(0.2);
    const r = await soumettre(formulaire({ ligne: id, montant: '0,1', devise: 'EUR' }));
    expect(r).toMatchObject({ statut: 'refus', erreurs: [{ champ: 'devise', message: expect.stringContaining('aucune conversion n’est appliquée') }] });
    expect((await reconciliations()).filter((x) => x.aiSpendId === id)).toHaveLength(0);
  });

  it('ligne réglée (pas à réconcilier) ⇒ refus ; ligne inconnue ⇒ refus', async () => {
    const [l] = await db.insert(schema.aiSpend).values({ provider: 'anthropic', model: 'm', action: 'jarvis:chat', estimatedUsd: 0.2, actualUsd: 0.05, inputTokens: 10, outputTokens: 2 }).returning();
    expect(await soumettre(formulaire({ ligne: l!.id, montant: '0,01' }))).toMatchObject({ statut: 'refus', message: expect.stringContaining('n’est pas à réconcilier') });
    expect(await soumettre(formulaire({ ligne: randomUUID(), montant: '0,01' }))).toMatchObject({ statut: 'refus', message: expect.stringContaining('introuvable') });
  });
});

describe('R5 · écran · « À réconcilier » puis « Réconciliées », historique conservé', () => {
  it('la ligne quitte « À réconcilier », entre dans « Réconciliées » avec réservé, facturé, preuve, motif, auteur, date', async () => {
    const id = await aReconcilier(0.333, 'r5:visible', 1);
    let html = renderToStaticMarkup(await DepensesPage());
    let a = bloc(html, 'a-reconcilier');
    expect(a, 'la ligne à réconcilier n’est pas listée').toContain(`data-ligne-reconcilier="${id}"`);
    const geste = (new RegExp(`<details[^>]*data-geste-reconcilier="${id}"[\\s\\S]*?</details>`).exec(a) ?? [''])[0];
    expect(geste, 'aucun geste de réconciliation sur la ligne').not.toBe('');
    const t = texte(geste);
    for (const l of ['Réconcilier avec la facture', 'Montant facturé', 'Devise de la facture', 'Identifiant de la preuve fournisseur', 'Motif', 'Vérifier avant d’enregistrer']) expect(t).toContain(l);
    expect(geste).toMatch(/<label for="rec-[^"]+-montant"/);
    expect(geste).toMatch(/name="cle" value="[0-9a-f-]{36}"/);
    expect(geste).toContain('value="USD"');

    const r = await soumettre(formulaire({ ligne: id, montant: '0,3', preuve: 'inv_2026_10 · l. 17', motif: 'Appel retrouvé sur la facture' }));
    const recId = /reconciliee=([0-9a-f-]{36})/.exec((r as { redirect: string }).redirect)![1]!;
    html = renderToStaticMarkup(await DepensesPage({ searchParams: Promise.resolve({ reconciliee: recId }) }));
    a = bloc(html, 'a-reconcilier');
    expect(a, 'la ligne réconciliée est encore « à réconcilier »').not.toContain(`data-ligne-reconcilier="${id}"`);
    const h = bloc(html, 'reconciliees');
    expect(h).toContain('data-reconciliees="rempli"');
    const carte = texte((new RegExp(`<li[^>]*data-ligne-reconciliee="${recId}"[\\s\\S]*?</li>`).exec(h) ?? [''])[0]);
    expect(carte, 'la réconciliation n’est pas dans l’historique').toContain('r5:visible');
    expect(carte).toContain('0,3330 $ → 0,3000 $ (USD)');
    expect(carte).toContain('Réservé 0,3330 $, gardé sur la ligne');
    expect(carte).toContain('Facturé 0,3000 $ (USD), retenu au plafond');
    expect(carte).toContain('Écart 0,0330 $ libérés');
    expect(carte).toContain('Preuve inv_2026_10 · l. 17');
    expect(carte).toContain('Motif Appel retrouvé sur la facture');
    expect(carte).toMatch(new RegExp(`Par ${FONDATEUR.replace(/[.]/g, '\\.')}, le \\d{2}/\\d{2}/\\d{4} \\d{2}:\\d{2}`));
    expect(carte).toContain('à l’instant');
    expect(texte(h)).toContain('Réconciliation enregistrée · r5:visible, réservé 0,3330 $ → facturé 0,3000 $ (USD).');
    // L'historique est conservé · la ligne garde sa cause, la réconciliation ne se modifie pas.
    expect((await ligne(id)).reconcileReason).toBe('coupure');
    await expect(db.update(schema.aiSpendReconciliations).set({ billedMicros: 0 }).where(eq(schema.aiSpendReconciliations.id, recId))).rejects.toThrow(/STUDIO_IMMUABLE/);
    expect(html).not.toMatch(/Trendtrack/i);
    expect(bloc(html, 'reconciliees'), 'tiret cadratin').not.toContain('—');
  });

  it('historique vide · dit ; lecture impossible · dite, la page tient', async () => {
    const { SectionReconciliees } = await import('../app/(app)/admin/depenses/SectionReconciliees');
    const vide = renderToStaticMarkup(<SectionReconciliees ecran={{ etat: 'vide', resume: 'Aucune dépense réconciliée pour l’instant.', lignes: [] }} />);
    expect(vide).toContain('data-reconciliees="vide"');
    expect(texte(vide)).toContain('Aucune dépense réconciliée pour l’instant.');
    const err = renderToStaticMarkup(<SectionReconciliees ecran={null} erreur="erreur de lecture en base" />);
    expect(err).toContain('role="alert"');
    expect(texte(err)).toContain('L’historique n’a pas pu être lu · erreur de lecture en base.');
  });

  it('porte · un admin d’espace non fondateur est renvoyé AVANT toute lecture', async () => {
    etat.session = sess('admin', ADMIN_ESPACE, ids.admin);
    etat.compter = true;
    await expect(DepensesPage()).rejects.toThrow('redirect /admin');
    etat.compter = false;
    expect(etat.acces).toEqual([]);
  });
});
