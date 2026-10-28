// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Spatial · vague 3 · Admin · les gestes de l'ancienne interface portés dans le
 * Tour de contrôle. Chaque garde lit un RÉSULTAT · le HTML rendu (jsdom ou
 * `renderToStaticMarkup`) ou l'appel effectif de l'action EXISTANTE avec sa
 * charge · jamais la seule présence d'un composant.
 */

const a = vi.hoisted(() => ({
  reconcilier: vi.fn(async (_e: unknown, _fd: FormData) => ({ statut: 'initial', message: '' })),
  staff: vi.fn(async (_fd: FormData) => {}), retirer: vi.fn(async (_fd: FormData) => {}),
  plan: vi.fn(async (_fd: FormData) => {}), grant: vi.fn(async (_fd: FormData) => {}), recharge: vi.fn(async (_fd: FormData) => {}),
  config: vi.fn(async (_fd: FormData) => {}), pack: vi.fn(async (_fd: FormData) => {}), revoke: vi.fn(async (_fd: FormData) => {}),
  diagnostic: vi.fn(async () => ({ mode: 'test', checks: [{ label: 'Clé Stripe', level: 'ok', detail: 'mode test' }, { label: 'Webhook', level: 'fail', detail: 'endpoint absent' }] })),
  importer: vi.fn(async () => ({ ok: true, crees: 3, dejaPresentes: 0 })),
  publier: vi.fn(async (_e: unknown) => ({ ok: true, releaseId: 'r2' })),
  revoquer: vi.fn(async (_e: unknown) => ({ ok: true, releaseId: 'r2', deja: false })),
  evaluer: vi.fn(async (_e: unknown) => ({ ok: false, message: 'Refusé · contrat divergent', constats: [{ code: 'CONTRAT', message: 'schéma différent' }], traceId: 'tr-1' })),
  creerConnaissance: vi.fn(async (_e: unknown) => ({ vue: undefined })),
  interrupteurs: vi.fn(async (_e: unknown) => ({ ok: true, message: 'Réglage enregistré.' })),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin', useRouter: () => ({ push: () => {}, refresh: () => {} }), redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); } }));
vi.mock('../app/actions/reconciliation-depense', () => ({ reconcilierDepenseAction: a.reconcilier }));
vi.mock('../app/actions/equipe', () => ({ enregistrerStaffAction: a.staff, retirerStaffAction: a.retirer, enregistrerMatriceAction: async () => {} }));
vi.mock('../app/actions/billing', () => ({ changePlanAction: a.plan }));
vi.mock('../app/actions/credits', () => ({ grantCreditsAction: a.grant, rechargeAllocationAction: a.recharge }));
vi.mock('../app/actions/platform', () => ({ updatePlanConfigAction: a.config }));
vi.mock('../app/actions/beta', () => ({ grantTestPackAction: a.pack, revokeTrialAction: a.revoke }));
vi.mock('../app/actions/stripe-diagnostic', () => ({ runStripeDiagnosticAction: a.diagnostic }));
vi.mock('../app/actions/support', () => ({ replyTicketAction: async () => {}, setTicketStatusAction: async () => {} }));
vi.mock('../app/actions/studios/prompts', () => ({
  importerPackAction: a.importer, validerImportsAction: async () => ({ ok: true }), validerVersionAction: async () => ({ ok: true }),
  evaluerReleaseAction: a.evaluer, retirerReleaseAction: async () => ({ ok: true }), creerReleaseAction: async () => ({ ok: true }),
  publierReleaseAction: a.publier, rollbackReleaseAction: async () => ({ ok: true }), revoquerReleaseAction: a.revoquer,
  enregistrerBrouillonAction: async () => ({ ok: true }), approuverBenchmarkAction: async () => ({ ok: true }), approuverRecetteManuelleAction: async () => ({ ok: true }),
}));
vi.mock('../lib/studios/benchmark/actions', () => ({ approuverBudgetBenchmarkAction: async () => ({ ok: true }), joindreFichesBenchmarkAction: async () => ({ ok: true }) }));
vi.mock('../app/actions/connaissances', () => ({
  creerConnaissanceAction: a.creerConnaissance, nouvelleVersionAction: async () => ({}), publierConnaissanceAction: async () => ({}), retirerConnaissanceAction: async () => ({}),
}));
vi.mock('../app/actions/studios/interrupteurs', () => ({ enregistrerInterrupteursEspaceAction: a.interrupteurs, enregistrerBudgetEssaiAction: async () => ({ ok: true, message: 'ok' }) }));

import {
  CAPACITES_STUDIOS, DEFINITIONS_CAPACITES, ECRANS_SPATIAUX, LARGEUR_MIN_TABLE_TELEPHONE, REFUS_PUBLICATION_PLATEFORME, cheminPorte,
} from '@tiktrends/core';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { TeteAdmin } from '../spatial/vues/admin/base';
import { OUTILS_ADMIN, SOUS_NAV_ADMIN } from '../spatial/vues/admin/sous-nav';
import { Paiements } from '../spatial/vues/admin/Paiements';
import { Comptes } from '../spatial/vues/admin/Comptes';
import { Forfaits } from '../spatial/vues/admin/Forfaits';
import { Couts } from '../spatial/vues/admin/Couts';
import { Droits } from '../spatial/vues/admin/Droits';
import { Prompts } from '../spatial/vues/admin/Prompts';
import { Registre } from '../spatial/vues/admin/Registre';
import { Console } from '../spatial/vues/admin/Console';
import { Incidents } from '../spatial/vues/admin/Incidents';
import { Interrupteurs } from '../spatial/vues/admin/Interrupteurs';
import { Connaissances } from '../spatial/vues/admin/Connaissances';
import { DiagnosticStripe } from '../spatial/vues/admin/paiements-client';
import { propsComptes, propsCouts, propsDroits, propsForfaits, propsPaiements, propsPrompts } from './spatial/props-admin';

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 1, dotation: 2, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const B = { payants: 3, actualise: 'à l’instant' };
const rendre = (n: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>);
const doc = (html: string) => { const t = document.createElement('template'); t.innerHTML = html; return t.content; };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let racine: Root | null = null;
let hote: HTMLDivElement | null = null;
async function monter(n: React.ReactNode) {
  hote = document.createElement('div'); document.body.appendChild(hote);
  racine = createRoot(hote);
  await act(async () => { racine!.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>); });
  return hote;
}
const cliquer = async (e: Element | null | undefined) => { expect(e, 'élément à cliquer').toBeTruthy(); await act(async () => { (e as HTMLElement).click(); }); };
const bouton = (h: ParentNode, texte: string) => [...h.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith(texte)) ?? null;
async function saisir(e: Element | null, v: string) {
  const el = e as HTMLInputElement | HTMLTextAreaElement;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const champ = (h: ParentNode, libelle: string) => [...h.querySelectorAll('label')].find((l) => l.textContent?.startsWith(libelle))?.querySelector('input, textarea, select') ?? null;
afterEach(() => { act(() => racine?.unmount()); hote?.remove(); racine = null; hote = null; vi.clearAllMocks(); });

/* ───────────────────────── Navigation ───────────────────────── */

describe('Spatial · Admin · vague 3 · sous-navigation et adresses', () => {
  it('la sous-navigation garde les douze entrées de la maquette puis les outils de la plateforme, chacun un écran porté', () => {
    const liens = [...doc(rendre(<TeteAdmin titre="t" sous="s" actif="/console" bandeau={B} />)).querySelectorAll('nav.subnav a')].map((x) => x.getAttribute('href'));
    expect(liens).toEqual([...SOUS_NAV_ADMIN, ...OUTILS_ADMIN].map((x) => x.href));
    for (const o of OUTILS_ADMIN) {
      expect(cheminPorte(o.href), o.href).toBe(true);
      expect(ECRANS_SPATIAUX.find((e) => e.chemin === o.href)?.section, o.href).toBe('admin');
    }
  });

  it('aucun écran Spatial de l’Admin ne renvoie plus vers l’ancienne interface (`?ui=v5`)', () => {
    const racines = ['spatial/vues/admin', 'app/(spatial)/sp/admin', 'app/(spatial)/sp/console'];
    const fichiers: string[] = [];
    const parcourir = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) parcourir(p); else if (/\.tsx?$/.test(n)) fichiers.push(p); } };
    for (const r of racines) parcourir(join(process.cwd(), r));
    expect(fichiers.length).toBeGreaterThan(20);
    expect(fichiers.filter((f) => readFileSync(f, 'utf8').includes('ui=v5'))).toEqual([]);
  });

  it('« Bibliothèque IA » · « Éditer » et « Créer » ouvrent le registre Spatial', () => {
    const p = propsPrompts();
    const html = rendre(<Prompts {...p} familles={p.familles.map((f) => ({ ...f, entrees: f.entrees.map((e) => ({ ...e, editer: '/admin/prompts/registre?onglet=prompts&cle=template%3Aa' })) }))} />);
    const liens = [...doc(html).querySelectorAll('a.btn')].map((x) => x.getAttribute('href'));
    expect(liens).toContain('/admin/prompts/registre');
    expect(liens).toContain('/admin/prompts/registre?onglet=prompts&cle=template%3Aa');
    expect(html).not.toContain('ui=v5');
  });
});

/* ───────────────────────── Tables au téléphone ───────────────────────── */

describe('Spatial · Admin · vague 3 · les tables larges défilent au téléphone', () => {
  const cas: Array<[string, string, number, string]> = [
    ['Paiements en défaut', rendre(<Paiements {...propsPaiements()} />), LARGEUR_MIN_TABLE_TELEPHONE.defauts, '#afail'],
    ['Comptes', rendre(<Comptes {...propsComptes()} />), LARGEUR_MIN_TABLE_TELEPHONE.comptes, '[data-table="comptes"]'],
    ['Forfaits publiés', rendre(<Forfaits {...propsForfaits()} />), LARGEUR_MIN_TABLE_TELEPHONE.forfaits, '[data-table="forfaits"]'],
  ];
  it.each(cas)('%s · la table défile et garde une largeur minimale mesurée, ses lignes leurs colonnes', (_n, html, min, sel) => {
    const t = doc(html).querySelector(`.atable${sel}`) as HTMLElement;
    expect(t, sel).toBeTruthy();
    expect(t.style.overflowX).toBe('auto');
    expect(t.style.gridTemplateColumns).toBe(`minmax(${min}px, 1fr)`);
    expect(min).toBeGreaterThanOrEqual(600);
    // Une ligne sans colonnes propres hériterait de la colonne unique (`inherit` de la feuille) · elle s'empilerait.
    const lignes = [...t.querySelectorAll('.atr')] as HTMLElement[];
    expect(lignes.length).toBeGreaterThan(1);
    for (const l of lignes) expect(l.style.gridTemplateColumns.split(/\s+/).length).toBeGreaterThan(3);
  });
});

/* ───────────────────────── Coûts · réconciliation et appels ───────────────────────── */

const LIGNE = { id: '11111111-1111-4111-8111-111111111111', quand: '27 oct. · 10:12', fournisseur: 'anthropic', modele: 'claude', action: 'Relecture de pub', cause: 'Délai dépassé', reserve: '0,2500 $', reserveMicros: 250_000, aFaire: 'Comparer à la facture.', cle: '22222222-2222-4222-8222-222222222222' };
const propsCoutsV3 = (): React.ComponentProps<typeof Couts> => ({
  ...propsCouts(), budget: { part: 10, titre: 't', detail: 'd', detailHref: '#appels' },
  aReconcilier: { erreur: null, resume: '1 ligne à rapprocher', consigne: 'Retrouve l’appel sur la facture.', parFournisseur: [], lignes: [LIGNE] },
  reconciliees: { erreur: null, resume: '1 réconciliée', recente: 'r1', deja: false, lignes: [{ id: 'r1', action: 'Génération', appel: '26 oct.', fournisseur: 'fal', modele: null, reserve: '0,1000 $', facture: '0,0800 $', ecart: '0,0200 $ libérés', depasse: false, preuve: 'INV-1', motif: 'facture', auteur: 'Kevin', le: '27/10' }] },
  parPoste: [{ poste: 'jarvis', montant: '1,00 $', appels: '3 appels', part: 100 }],
  appels: [{ id: 'x', quand: '27 oct.', fournisseur: 'anthropic', modele: 'claude', poste: 'jarvis', jetons: '10 → 2', cout: '0,010 $' }],
});

describe('Spatial · Admin · vague 3 · Coûts IA · réconciliation et détail des appels', () => {
  it('le détail des appels, la dépense par poste et l’historique sont dans l’écran · « Détail des appels » est une ancre', () => {
    const d = doc(rendre(<Couts {...propsCoutsV3()} />));
    expect(d.querySelector('#appels')!.textContent).toContain('0,010 $');
    expect(d.querySelector('[data-reconciliation-recente="r1"]')!.textContent).toContain('Réconciliation enregistrée · Génération, réservé 0,1000 $ → facturé 0,0800 $.');
    expect([...d.querySelectorAll('a.btn')].find((x) => x.textContent === 'Détail des appels')!.getAttribute('href')).toBe('#appels');
    expect(d.textContent).toContain('Où part l’argent');
  });

  it('une lecture impossible se dit, sans geste', () => {
    const p = propsCoutsV3();
    const d = doc(rendre(<Couts {...p} aReconcilier={{ ...p.aReconcilier!, erreur: 'erreur de lecture en base', lignes: [] }} />));
    expect(d.querySelector('[data-reconciliation="erreur"]')!.textContent).toContain('n’ont pas pu être lues · erreur de lecture en base');
    expect(d.querySelector('[data-geste-reconcilier]')).toBeNull();
  });

  it('« Réconcilier » · la saisie est vérifiée par la règle du noyau, puis la confirmation envoie l’action existante avec ligne, clé et saisie', async () => {
    const h = await monter(<Couts {...propsCoutsV3()} />);
    await cliquer(h.querySelector(`[data-geste-reconcilier="${LIGNE.id}"]`));
    const dlg = h.querySelector('[role="dialog"]')!;
    expect(dlg).toBeTruthy();
    await cliquer(bouton(dlg, 'Vérifier'));
    expect(h.querySelector('[data-confirmation-reconciliation]')).toBeNull();
    expect(a.reconcilier).not.toHaveBeenCalled();
    await saisir(champ(dlg, 'Montant facturé'), '0,3');
    await saisir(champ(dlg, 'Identifiant de la preuve'), 'INV-77');
    await saisir(champ(dlg, 'Motif'), 'Facture Anthropic d’octobre');
    await cliquer(bouton(dlg, 'Vérifier'));
    const conf = h.querySelector('[data-confirmation-reconciliation]')!;
    expect(conf.textContent).toContain('0,2500');
    expect(conf.querySelector('[data-avertissement-depassement]')).toBeTruthy();
    await cliquer(bouton(conf, 'Confirmer la réconciliation'));
    expect(a.reconcilier).toHaveBeenCalledTimes(1);
    const fd = a.reconcilier.mock.calls[0]![1] as FormData;
    expect(Object.fromEntries(fd.entries())).toMatchObject({ ligne: LIGNE.id, cle: LIGNE.cle, montant: '0,3', devise: 'USD', preuve: 'INV-77', motif: 'Facture Anthropic d’octobre' });
  });
});

/* ───────────────────────── Équipe · formules · Stripe ───────────────────────── */

describe('Spatial · Admin · vague 3 · équipe interne, leviers de formule, diagnostic Stripe', () => {
  const droits = () => {
    const p = propsDroits();
    return { ...p, gestion: true, rolesInvitation: [{ cle: 'membre', libelle: 'Membre' }, { cle: 'lecture', libelle: 'Lecture' }], equipe: [{ ...p.equipe[0]!, email: 'moi@x.fr', cleRole: 'admin', moi: true }, { ...p.equipe[1]!, email: 'autre@x.fr', cleRole: 'membre', moi: false }] };
  };

  it('Gérer un membre · changer son rôle passe par `enregistrerStaffAction` avec son e-mail', async () => {
    const h = await monter(<Droits {...droits()} />);
    await cliquer(h.querySelector('[aria-label="Gérer autre@x.fr"]'));
    const f = h.querySelector('form[data-geste="changer-role"]') as HTMLFormElement;
    (f.querySelector('select') as HTMLSelectElement).value = 'lecture';
    await cliquer(bouton(f, 'Changer le rôle'));
    expect(a.staff).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries((a.staff.mock.calls[0]![0] as FormData).entries())).toEqual({ email: 'autre@x.fr', role: 'lecture' });
  });

  it('Retirer un membre se confirme, puis passe par `retirerStaffAction` · son propre compte ne se retire pas d’ici', async () => {
    const h = await monter(<Droits {...droits()} />);
    await cliquer(h.querySelector('[aria-label="Gérer autre@x.fr"]'));
    expect(h.querySelector('form[data-geste="retirer"]')).toBeNull();
    await cliquer(bouton(h, 'Retirer de l’équipe'));
    await cliquer(bouton(h.querySelector('form[data-geste="retirer"]')!, 'Confirmer le retrait'));
    expect(Object.fromEntries((a.retirer.mock.calls[0]![0] as FormData).entries())).toEqual({ email: 'autre@x.fr' });
    act(() => racine?.unmount());
    const h2 = await monter(<Droits {...droits()} />);
    await cliquer(h2.querySelector('[aria-label="Gérer moi@x.fr"]'));
    expect(bouton(h2, 'Retirer de l’équipe')).toBeNull();
    expect(h2.textContent).toContain('tu ne peux ni te retirer ni te rétrograder toi-même');
  });

  it('sans `gestion` (compte non admissible), aucun geste par membre', () => {
    expect(doc(rendre(<Droits {...droits()} gestion={false} />)).querySelector('[aria-label^="Gérer"]')).toBeNull();
  });

  it('les leviers de formule passent par les trois actions existantes, retour à `/admin/plans`, et ne proposent que les formules données', async () => {
    const leviers = { espace: 'GLX', formule: 'Plus', formuleActuelle: 'plus', prixFormule: '149 €', solde: 'Illimité', allocation: 'a', abonnement: { libelle: 'Aucun', detail: 'pilotage manuel' }, formules: [{ cle: 'starter', libelle: 'Starter' }, { cle: 'plus', libelle: 'Plus' }], message: { ok: true, texte: 'Crédits ajustés.' } };
    const h = await monter(<Forfaits {...propsForfaits()} leviers={leviers} />);
    expect(h.querySelector('#leviers [role="status"]')!.textContent).toBe('Crédits ajustés.');
    expect([...h.querySelectorAll('[data-levier="formule"] option')].map((o) => (o as HTMLOptionElement).value)).toEqual(['starter', 'plus']);
    await cliquer(bouton(h.querySelector('[data-levier="formule"]')!, 'Appliquer'));
    await saisir(h.querySelector('[data-levier="credits"] input[name="amount"]'), '500');
    await cliquer(bouton(h.querySelector('[data-levier="credits"]')!, 'Ajuster les crédits'));
    await cliquer(bouton(h.querySelector('[data-levier="recharge"]')!, 'Recharger'));
    expect(Object.fromEntries((a.plan.mock.calls[0]![0] as FormData).entries())).toEqual({ back: 'admin', plan: 'plus' });
    expect(Object.fromEntries((a.grant.mock.calls[0]![0] as FormData).entries())).toMatchObject({ back: 'admin', amount: '500' });
    expect(Object.fromEntries((a.recharge.mock.calls[0]![0] as FormData).entries())).toEqual({ back: 'admin' });
  });

  it('le diagnostic Stripe complet dit chaque contrôle avec son verdict en mot', async () => {
    const h = await monter(<DiagnosticStripe />);
    await cliquer(bouton(h, 'Lancer la vérification'));
    expect(a.diagnostic).toHaveBeenCalledTimes(1);
    const lignes = [...h.querySelectorAll('[data-controle]')].map((l) => l.textContent);
    expect(lignes).toEqual(['ConformeClé Stripemode test', 'BloquantWebhookendpoint absent']);
    expect(h.textContent).toContain('1 point bloquant');
  });

  it('« Stripe & Whop » · le contrôle de la chaîne (test manuel à la carte) suit quand la page le demande', () => {
    const d = doc(rendre(<Paiements {...propsPaiements()} controle />));
    expect(d.querySelectorAll('#diagnostic ol > li')).toHaveLength(7);
  });
});

/* ───────────────────────── Registre IA ───────────────────────── */

const release = (id: string, statut: string, pointee: boolean) => ({ id, statut, empreinte: `${id}-0123456789abcdef`, packHash: 'p', creeLe: '2026-10-20 10:00', motif: 'm', pointee, tests: true, benchmark: false, recetteManuelle: false, versions: 33, conversation: '1.0.0', revocation: null });
const releases = (peut = true): React.ComponentProps<typeof Registre> => ({
  bandeau: B, onglet: 'releases',
  contenu: { onglet: 'releases', pointee: 'r1', environnement: 'production', selection: [], peutPublier: peut, peutRevenir: peut, peutEvaluer: peut, peutCreer: peut, releases: [release('r1', 'active', true), release('r2', 'staged', false)] },
});

describe('Spatial · Admin · vague 3 · Registre IA (ancien « IA et Studios »)', () => {
  it('les sept onglets mènent au registre Spatial · l’actif est marqué', () => {
    const liens = [...doc(rendre(<Registre {...releases()} />)).querySelectorAll('.aitabs nav a')];
    expect(liens.map((x) => x.getAttribute('href'))).toEqual(['prompts', 'releases', 'recettes', 'evaluations', 'routage', 'executions', 'connaissances'].map((o) => `/admin/prompts/registre?onglet=${o}`));
    expect(liens.filter((x) => x.getAttribute('aria-current') === 'page').map((x) => x.textContent)).toEqual(['Releases']);
  });

  it('publier une release se confirme, puis appelle l’action existante avec la release, le pointeur attendu et la confirmation', async () => {
    const h = await monter(<Registre {...releases()} />);
    const carte = h.querySelector('[data-release="r2"]')!;
    await cliquer(bouton(carte, 'Publier la release'));
    expect(a.publier).not.toHaveBeenCalled();
    await cliquer(bouton(h.querySelector('[role="dialog"]')!, 'Publier la release'));
    expect(a.publier).toHaveBeenCalledWith({ releaseId: 'r2', attendue: 'r1', confirme: true });
    expect(h.querySelector('[data-release="r2"] [role="status"]')!.textContent).toContain('Release publiée');
  });

  it('révoquer exige un motif · sans lui, le geste reste fermé', async () => {
    const h = await monter(<Registre {...releases()} />);
    await cliquer(bouton(h.querySelector('[data-release="r2"]')!, 'Révoquer'));
    const dlg = h.querySelector('[role="dialog"]')!;
    expect((bouton(dlg, 'Révoquer') as HTMLButtonElement).disabled).toBe(true);
    await saisir(champ(dlg, 'Motif'), 'Fuite de consigne');
    await cliquer(bouton(dlg, 'Révoquer'));
    expect(a.revoquer).toHaveBeenCalledWith({ releaseId: 'r2', motif: 'Fuite de consigne', confirme: true });
  });

  it('un refus du serveur s’affiche avec ses constats et l’identifiant support', async () => {
    const h = await monter(<Registre {...releases()} />);
    await cliquer(bouton(h.querySelector('[data-release="r2"]')!, 'Évaluer'));
    const alerte = h.querySelector('[data-release="r2"] [role="alert"]')!;
    expect(alerte.textContent).toContain('Refusé · contrat divergent');
    expect(alerte.textContent).toContain('CONTRAT · schéma différent');
    expect(alerte.textContent).toContain('tr-1');
  });

  it('une commande qui n’aboutit pas (hors ligne) rend un refus lisible, l’écran reste', async () => {
    a.importer.mockRejectedValueOnce(new Error('réseau'));
    const h = await monter(<Registre bandeau={B} onglet="prompts" contenu={{ onglet: 'prompts', cles: [], detail: null, peutEditer: true, plan: { aCreer: 3, deja: 0 }, brouillonsImportes: 0 }} />);
    await cliquer(h.querySelector('[data-commande="importer"]'));
    expect(h.querySelector('[role="alert"]')!.textContent).toContain('Hors ligne');
  });

  it('sans permission, aucun geste de release n’est rendu', () => {
    const d = doc(rendre(<Registre {...releases(false)} />));
    expect(d.querySelector('[data-geste], [data-commande]')).toBeNull();
    expect(d.textContent).not.toContain('Nouvelle release');
  });
});

/* ───────────────────────── Connaissances · interrupteurs · console · incidents ───────────────────────── */

const VUE_VIDE = { items: [], apercu: { taille: 0, plafond: 6000, inclus: [], exclues: [], conflits: [] } } as never;

describe('Spatial · Admin · vague 3 · Connaissances, Interrupteurs, Console, Incidents', () => {
  it('Connaissances · publier en portée plateforme sans la case est refusé ici, avec la phrase du noyau · avec la case, l’action part', async () => {
    const h = await monter(<Connaissances bandeau={B} vue={VUE_VIDE} erreur={null} espaces={[]} marques={[]} />);
    await saisir(champ(h, 'Titre'), 'Itérer une gagnante');
    await saisir(champ(h, 'Texte'), 'Une variable à la fois.');
    await cliquer(bouton(h, 'Publier'));
    expect(a.creerConnaissance).not.toHaveBeenCalled();
    expect(h.querySelector('[data-avant-publication="plateforme"] [role="alert"]')!.textContent).toBe(REFUS_PUBLICATION_PLATEFORME);
    await cliquer(h.querySelector('input[name="confirmer-plateforme"]'));
    await cliquer(bouton(h, 'Publier'));
    expect(a.creerConnaissance).toHaveBeenCalledTimes(1);
    expect(a.creerConnaissance.mock.calls[0]![0]).toMatchObject({ titre: 'Itérer une gagnante', texte: 'Une variable à la fois.', publier: true, confirmerPlateforme: true, portee: { niveau: 'plateforme' } });
  });

  it('Connaissances · une lecture impossible se dit', () => {
    expect(doc(rendre(<Connaissances bandeau={B} vue={null} erreur="Réservé à l’équipe plateforme." espaces={[]} marques={[]} />)).querySelector('[data-etat="erreur"]')!.textContent).toBe('Réservé à l’équipe plateforme.');
  });

  const decisions = Object.fromEntries(CAPACITES_STUDIOS.map((c) => [c, { active: false, source: 'defaut' }])) as never;
  const espace = { id: 'w1', nom: 'GLX', plan: 'plus', regle: false, pilote: false, reglages: { actives: [], coupees: [] } as never, decisions };
  it('Interrupteurs · le réglage d’un espace attend la confirmation, puis envoie actives et coupées', async () => {
    const reglable = CAPACITES_STUDIOS.find((c) => DEFINITIONS_CAPACITES[c].portee === 'espace')!;
    const h = await monter(<Interrupteurs bandeau={B} recherche="" peutEcrire budget={null} vue={{ env: [], global: decisions, total: 1, espaces: [espace] }} detail={espace} />);
    const f = h.querySelector('form[data-formulaire="interrupteurs"]')!;
    expect((bouton(f, 'Enregistrer le réglage') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { const s = f.querySelector(`select[name="${reglable}"]`) as HTMLSelectElement; s.value = 'active'; s.dispatchEvent(new Event('change', { bubbles: true })); });
    await saisir(champ(f, 'Motif'), 'pilote recette');
    await cliquer(f.querySelector('input[type="checkbox"]'));
    await cliquer(bouton(f, 'Enregistrer le réglage'));
    expect(a.interrupteurs).toHaveBeenCalledWith({ workspaceId: 'w1', actives: [reglable], coupees: [], motif: 'pilote recette', confirme: true });
    expect(f.querySelector('[role="status"]')!.textContent).toContain('Fait · Réglage enregistré.');
  });

  it('Interrupteurs · en lecture seule, aucun formulaire', () => {
    const d = doc(rendre(<Interrupteurs bandeau={B} recherche="" peutEcrire={false} budget={null} vue={{ env: [], global: decisions, total: 1, espaces: [espace] }} detail={espace} />));
    expect(d.querySelector('form[data-formulaire]')).toBeNull();
    expect(d.textContent).toContain('Lecture seule · le réglage d’un espace');
  });

  const consoleProps = (): React.ComponentProps<typeof Console> => ({
    bandeau: B, message: null,
    deploiement: { etat: { libelle: 'Migrations en attente', c: 'r' }, resume: 'r', cases: [{ k: 'Commit du build', v: 'abc' }] },
    plateforme: { kpis: [], repartition: [], espaces: [], tarifs: [{ cle: 'core', libelle: 'Core', prix: 49, credits: 2000 }] },
    essais: { espaces: [{ id: 'w1', nom: 'GLX' }, { id: 'w2', nom: 'Neo' }], creditsDefaut: 300, joursDefaut: 14, lignes: [
      { id: 'w1', nom: 'GLX', type: 'beta', formule: 'Plus', credits: '300', essai: { texte: '3 j restants', c: 'w' }, coupable: true },
      { id: 'w2', nom: 'Neo', type: '·', formule: 'Core', credits: '0', essai: { texte: 'Aucun', c: '' }, coupable: false },
    ] },
    espace: { nom: 'GLX', kpis: [], roles: [], membres: [], tickets: [] },
  });
  it('Console · tarifs, crédits de test et coupure passent par leurs actions existantes · « Couper » seulement sur un essai en cours', async () => {
    const h = await monter(<Console {...consoleProps()} />);
    await cliquer(bouton(h.querySelector('[data-console="tarifs"]')!, 'Enregistrer les tarifs'));
    expect(Object.fromEntries((a.config.mock.calls[0]![0] as FormData).entries())).toEqual({ price_core: '49', credits_core: '2000' });
    await cliquer(bouton(h.querySelector('[data-console="accorder"]')!, 'Accorder'));
    expect(Object.fromEntries((a.pack.mock.calls[0]![0] as FormData).entries())).toEqual({ workspaceId: 'w1', credits: '300', days: '14', kind: 'beta' });
    const couper = [...h.querySelectorAll('[aria-label^="Couper"]')];
    expect(couper.map((b) => b.getAttribute('aria-label'))).toEqual(['Couper l’essai de GLX']);
    await cliquer(couper[0]);
    expect(Object.fromEntries((a.revoke.mock.calls[0]![0] as FormData).entries())).toEqual({ workspaceId: 'w1' });
    expect(h.querySelector('[data-console="deploiement"] .pill.r')!.textContent).toBe('Migrations en attente');
  });

  it('Incidents · la période choisie est marquée · sans échec, l’état vide le dit', () => {
    const d = doc(rendre(<Incidents bandeau={B} jours={30} total={0} limite={80} causes={[]} zones={[]} lignes={[]} />));
    expect([...d.querySelectorAll('nav[aria-label="Période"] a')].map((x) => [x.getAttribute('href'), x.getAttribute('aria-current')])).toEqual([['/admin/incidents?j=1', null], ['/admin/incidents?j=7', null], ['/admin/incidents?j=30', 'page']]);
    expect(d.querySelector('[data-etat="vide"]')!.textContent).toContain('Aucun incident sur 30 jours.');
  });
});
