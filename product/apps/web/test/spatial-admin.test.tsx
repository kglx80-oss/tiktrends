// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { parite } from './spatial/parite';

const actions = vi.hoisted(() => ({
  reply: vi.fn(async (_fd: FormData) => {}),
  statut: vi.fn(async (_fd: FormData) => {}),
  matrice: vi.fn(async (_fd: FormData) => {}),
  diagnostic: vi.fn(async () => ({ mode: 'test', checks: [{ label: 'a', level: 'ok', detail: '' }, { label: 'b', level: 'fail', detail: '' }] })),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin', useRouter: () => ({ push: () => {}, refresh: () => {} }), redirect: () => { throw new Error('redirect'); } }));
vi.mock('../app/actions/support', () => ({ replyTicketAction: actions.reply, setTicketStatusAction: actions.statut }));
vi.mock('../app/actions/equipe', () => ({ enregistrerStaffAction: async () => {}, retirerStaffAction: async () => {}, enregistrerMatriceAction: actions.matrice }));
vi.mock('../app/actions/stripe-diagnostic', () => ({ runStripeDiagnosticAction: actions.diagnostic }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { TourDeControle } from '../spatial/vues/admin/TourDeControle';
import { Churn } from '../spatial/vues/admin/Churn';
import { Revenus } from '../spatial/vues/admin/Revenus';
import { Forfaits } from '../spatial/vues/admin/Forfaits';
import { Comptes } from '../spatial/vues/admin/Comptes';
import { Sav } from '../spatial/vues/admin/Sav';
import { Couts } from '../spatial/vues/admin/Couts';
import { Modeles } from '../spatial/vues/admin/Modeles';
import { UsageTests } from '../spatial/vues/admin/UsageTests';
import { Paiements } from '../spatial/vues/admin/Paiements';
import { Droits } from '../spatial/vues/admin/Droits';
import { Prompts } from '../spatial/vues/admin/Prompts';
import { ComptesARisqueListe, ComptesListe, RevenusHero } from '../spatial/vues/admin/client';
import { PosteSav } from '../spatial/vues/admin/sav-client';
import { MatriceDroitsSpatiale } from '../spatial/vues/admin/droits-client';
import { VerifierStripe } from '../spatial/vues/admin/paiements-client';

/**
 * Tour de contrôle Spatial · parité de structure avec la maquette, écran par
 * écran. Les props reproduisent les NOMBRES d'éléments et les classes du
 * fragment (`docs/spatial/reference/<route>.html`) · les valeurs sont des
 * données de test, jamais servies en production (les pages lisent la base).
 */

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 1240, dotation: 2000, illimite: false },
  nonLues: 4, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const rendre = (n: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>);
const BANDEAU = { payants: 395, actualise: 'à l’instant' };
const douze = <T,>(f: (i: number) => T) => Array.from({ length: 12 }, (_, i) => f(i));

export const propsTourDeControle = (): React.ComponentProps<typeof TourDeControle> => ({
  bandeau: BANDEAU,
  kpis: [
    { lbl: 'MRR', v: '1', d: 'a', c: 'up' }, { lbl: 'Abonnés', v: '1', d: 'a', c: 'up' }, { lbl: 'Churn', v: '1', d: 'a', c: 'up' },
    { lbl: 'Marge', v: '1', d: 'a', c: 'up' }, { lbl: 'Coûts', v: '1', d: 'a', c: 'w' }, { lbl: 'Tickets', v: '1', d: 'a', c: 'dn' },
  ],
  churn: {
    titre: 'Churn', valeur: '3 %', variation: { texte: 'x', classe: 'up' }, detail: 'd',
    barres: douze((i) => ({ hauteur: 50, enCours: i === 11 })), objectif: 50,
    cotes: [{ libelle: 'A', valeur: '1', detail: 'x' }, { libelle: 'B', valeur: '2', detail: 'y' }],
  },
  mrr: { legende: 'ARR', mois: douze((i) => ({ libelle: 'm', hauteur: 40, titre: 't', enCours: i === 11 })) },
  alertes: [
    { ton: 'w', icone: 'warn', titre: 'a', detail: 'x', lien: { href: '/admin/depenses', libelle: 'Voir' } },
    { ton: 'r', icone: 'card', titre: 'b', detail: 'x', lien: { href: '/admin/paiement', libelle: 'Voir' } },
    { ton: 'r', icone: 'chat', titre: 'c', detail: 'x', lien: { href: '/admin/sav', libelle: 'Voir' } },
    { ton: 'c', icone: 'users', titre: 'd', detail: 'x', lien: { href: '/admin/signups', libelle: 'Voir' } },
  ],
  forfaits: ['Core', 'Plus', 'Business'].map((l) => ({ libelle: l, prix: '99 €', abonnes: '1', mrr: '99 €', marge: 70, margeTexte: '70 %' })),
  direct: (['g', '', 'w', 'g', 'r', 'w'] as const).map((c, i) => ({ initiales: 'AB', espace: `E${i}`, texte: 't', quand: 'q', pastille: { libelle: 'p', classe: c } })),
});

export const propsChurn = (): React.ComponentProps<typeof Churn> => ({
  bandeau: BANDEAU,
  kpis: [
    { lbl: 'A', v: '1', d: 'a', c: 'up', s: 's' }, { lbl: 'B', v: '1', d: 'a', c: 'dn', s: 's' }, { lbl: 'C', v: '1', d: 'a', c: 'up' },
    { lbl: 'D', v: '1', d: 'a', c: 'w', s: 's' }, { lbl: 'E', v: '1', d: 'a', c: 'up', s: 's' }, { lbl: 'F', v: '1', d: 'a', c: 'up' },
  ],
  mois: douze((i) => ({ libelle: 'm', hauteur: 50, titre: 't', enCours: i === 11 })),
  legendeMois: 'l',
  objectif: 50,
  filtres: ['tous', 'critique', 'core', 'plus', 'business', 'essai'].map((c) => ({ cle: c, libelle: c })),
  comptes: (['r', 'r', 'w', 'w', 'w', 'w'] as const).map((r, i) => ({
    id: `c${i}`, nom: `C${i}`, cles: ['core'], forfait: { libelle: i === 2 ? 'Essai' : 'Core', classe: i === 2 ? 'c' as const : '' as const },
    risque: { libelle: '2 signaux', classe: r }, prix: '99 € / mois', signal: 's', autres: 'a',
  })),
});

/**
 * Les blocs de la maquette SANS source réelle (raisons de départ, ancienneté au
 * départ, parcours de résiliation, actions de rétention, gestes par compte)
 * gardent leur conteneur · leur contenu fictif est ignoré des deux côtés.
 */
const VIDES_CHURN = ['.creas', '.funnel', '.view > section.sec:last-child > .atable', '.cacts'];

export const propsRevenus = (): React.ComponentProps<typeof Revenus> => ({
  bandeau: BANDEAU,
  hero: { titre: 'MRR', valeur: '1 €', variation: '▲', detail: 'd', serie: douze((i) => ({ libelle: 'm', valeur: i * 10, enCours: i === 11 })) },
  cotes: [{ lbl: 'ARPU', v: '1', d: 'a', c: 'up' }, { lbl: 'NRR', v: '1', d: 'a', c: 'up' }, { lbl: 'LTV', v: '1', s: 's' }, { lbl: 'CAC', v: '1', d: 'a', c: 'up' }],
  repartition: { legende: 'l', formules: ['Core', 'Plus', 'Business'].map((l, i) => ({ libelle: l, mrr: i + 1, mrrTexte: '1 €', part: '1 %' })), note: 'n' },
  rentabilite: ['Core', 'Plus', 'Business'].map((l) => ({ libelle: l, prix: '1', abonnes: '1', mrr: '1', coutIa: '1', frais: '1', marge: 70, margeTexte: '70 %', churn: 'x', ltv: 'x' })),
});
/** Mouvements du MRR et cohortes · sans historique, contenu fictif dans la maquette. */
const VIDES_REVENUS = ['.wfall', '.coh'];

export const propsForfaits = (): React.ComponentProps<typeof Forfaits> => ({
  bandeau: BANDEAU, reglage: '/console',
  forfaits: ['starter', 'core', 'plus', 'business'].map((c) => ({ cle: c, libelle: c, prix: '1', credits: '1', abonnes: '1', annuel: 'x', vendable: true, raisonVente: 'r' })),
  packs: ['500', '1 500', '5 000'].map((c) => ({ credits: c, prix: '1', ventes: '1', unitaire: '1' })),
  essai: ['Durée', 'Crédits', 'Carte', 'Conversion'].map((l) => ({ libelle: l, valeur: 'v' })),
});
/**
 * « Nouveau forfait » et les codes promo n'ont aucune action ni donnée réelle ·
 * l'en-tête de la première tuile et la tuile des codes sont ignorés.
 */
const VIDES_FORFAITS = ['.view > section.tile:not(.sec) > .sech', '.agrid2 > section:last-child'];

export const propsComptes = (): React.ComponentProps<typeof Comptes> => ({
  bandeau: BANDEAU,
  kpis: [{ lbl: 'A', v: '1', d: 'a', c: 'up' }, { lbl: 'B', v: '1', d: 'a' }, { lbl: 'C', v: '1', d: 'a', c: 'up' }, { lbl: 'D', v: '1', d: 'a', c: 'dn' }],
  alerte: { comptes: 'x', mrr: 'y' },
  parcours: ['Visiteurs', 'Inscrits', 'Onboarding', '1er projet', 'Payants'].map((l, i) => ({ libelle: l, n: '1', hauteur: 50, part: i ? '1 %' : null })),
  filtres: ['tous', 'core', 'plus', 'business', 'essai', 'risque'].map((c) => ({ cle: c, libelle: c })),
  comptes: Array.from({ length: 8 }, (_, i) => ({
    id: `c${i}`, nom: `C${i}`, cles: ['core'], forfait: { libelle: 'Core', classe: i === 7 ? 'c' as const : '' as const }, mrr: '1',
    credits: { part: 50, texte: '50 %', over: i === 3 }, sante: { libelle: 's', classe: i === 6 ? 'r' as const : i === 4 || i === 5 || i === 7 ? 'w' as const : 'g' as const },
    profil: 'p', inscrit: 'i',
  })),
  note: 'n',
});
/** « Se connecter en tant que » et « offrir des crédits » · gestes absents (aucune action réelle). */
const VIDES_COMPTES = ['.aacts'];

const ticket = (i: number, classe: '' | 'r' | 'w' | 'c') => ({
  id: `t${i}`, onglet: 'open' as const, pastille: { libelle: 'Bug', classe }, depuis: 'il y a 4 h', titre: 'T', ligne: 'L', espace: 'E', initiales: 'E', teinte: 0,
  numero: '#1', etat: { libelle: 'Sans réponse', classe: 'r' as const }, ouvertPar: 'A', ouvertLe: 'd',
  messages: [{ equipe: false, auteur: 'A', quand: 'q', corps: 'c' }], resolu: null, attente: { classe: 'r' as const, texte: 'x' },
  client: { forfait: 'Core', mrr: '99 €', sante: { libelle: 's', classe: 'g' as const }, credits: '64 %' }, bloque: null,
});
export const propsSav = (): React.ComponentProps<typeof Sav> => ({
  bandeau: BANDEAU,
  kpis: [{ lbl: 'A', v: '1', d: 'a', c: 'dn' }, { lbl: 'B', v: '1', d: 'a', c: 'up' }, { lbl: 'C', v: '1', d: 'a', c: 'up' }, { lbl: 'D', v: '1', d: 'a', c: 'up' }],
  onglets: [{ statut: 'open', libelle: 'Ouverts', n: 4 }, { statut: 'in_progress', libelle: 'En cours', n: 0 }, { statut: 'resolved', libelle: 'Résolus', n: 0 }],
  tickets: [ticket(1, 'r'), ticket(2, 'w'), ticket(3, ''), ticket(4, 'c')],
  reponsesTypes: [{ libelle: 'a', texte: 'a' }, { libelle: 'b', texte: 'b' }, { libelle: 'c', texte: 'c' }],
});
/**
 * SAV · la maquette simule l'assignation, la note interne, le diagnostic Jarvis,
 * les crédits offerts et la pièce jointe · ces conteneurs sont ignorés, et les
 * blocs RÉELS qu'ils contiennent (un message client, la carte du client) sont
 * gardés par une parité ciblée.
 */
const VIDES_SAV = ['.savdh > .kc', '.savconv', '.savctx', '.savr .seg', '.savr > .kc'];

export const propsCouts = (): React.ComponentProps<typeof Couts> => ({
  bandeau: BANDEAU,
  kpis: [{ lbl: 'A', v: '1', d: 'a', c: 'dn' }, { lbl: 'B', v: '1', d: 'a', c: 'up' }, { lbl: 'C', v: '1', d: 'a', c: 'up' }, { lbl: 'D', v: '1', d: 'a', c: 'up' }],
  fournisseurs: ['anthropic', 'fal', 'openai', 'google', 'x', 'y'].map((c) => ({ cle: c, montant: '1 $', appels: '1 appel', largeur: 50, part: '1 %' })),
  budget: { part: 75, titre: 't', detail: 'd', detailHref: '/admin/depenses?ui=v5' },
  legendeOperations: 'l',
  operations: Array.from({ length: 5 }, (_, i) => ({ libelle: `o${i}`, credits: '1', revenu: '1', cout: '1', marge: 70, margeTexte: '70 %', aRevoir: i === 4 })),
  note: 'n', aReconcilier: null,
});
/** Le plafond se règle sur le serveur · les boutons « Modifier le plafond » et « Alerte Slack » n'existent pas. */
const VIDES_COUTS = ['.agrid2 .kc'];

export const propsModeles = (): React.ComponentProps<typeof Modeles> => ({
  bandeau: BANDEAU, legende: 'l',
  modeles: Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, fournisseur: 'anthropic', nom: 'M', actif: i !== 4, poste: 'p', latence: '1 s', echecs: '1 %', cout: '1 $' })),
  cles: ['Anthropic', 'fal', 'Higgsfield', 'Google'].map((n) => ({ nom: n, etat: 'Définie', detail: 'd' })),
});
/** « Ajouter un modèle » et « Renouveler » une clé n'ont aucune action réelle · la grille est gardée par une parité ciblée. */
const VIDES_MODELES = ['.amods', '.view > section.sec .atr > span:last-child'];

export const propsUsage = (): React.ComponentProps<typeof UsageTests> => ({
  bandeau: BANDEAU, titre: 'Usage',
  usage: Array.from({ length: 7 }, (_, i) => ({ libelle: `u${i}`, largeur: 50, n: '1' })),
});
/** Déploiements progressifs et tests A/B · aucune source dans l'outil. */
const VIDES_USAGE = ['.aflags', '.view > section.sec'];

export const propsPaiements = (): React.ComponentProps<typeof Paiements> => ({
  bandeau: BANDEAU,
  cartes: (['stripe', 'whop'] as const).map((c) => ({ cle: c, nom: c, sous: 's', connecte: true, etat: 'Connecté', stats: [{ libelle: 'a', valeur: '1' }, { libelle: 'b', valeur: '1' }, { libelle: 'c', valeur: '1' }], note: 'n', ouvrir: 'https://x', verifier: true })),
  defauts: { legende: 'l', lignes: Array.from({ length: 3 }, (_, i) => ({ id: `d${i}`, nom: 'N', forfait: 'Core', prix: '1', motif: 'm', statut: 'En retard', lien: 'https://x' })) },
  webhooks: { etat: { libelle: 'ok', classe: 'g' }, lignes: Array.from({ length: 4 }, (_, i) => ({ id: `w${i}`, type: 'invoice.paid', quand: 'q' })) },
  rapprochement: { lignes: [{ libelle: 'Stripe', valeur: '1 / 1', etat: { libelle: 'OK', classe: 'g' } }], ecarts: [] },
});
/** Le 4e webhook de la maquette vient de Whop (non branché) · le rapprochement Whop et sa correction n'existent pas. */
const VIDES_PAIEMENTS = ['.agrid2.sec > section:first-child .atr:nth-child(4)', '.agrid2.sec > section:last-child'];

const NIVEAUX: ReadonlyArray<ReadonlyArray<0 | 1 | 2 | 3>> = [
  [3, 1, 0, 3, 0, 0], [3, 1, 0, 3, 0, 0], [3, 2, 0, 1, 0, 0], [3, 2, 2, 1, 0, 0], [3, 0, 2, 0, 0, 0], [3, 2, 3, 1, 0, 0],
  [3, 1, 0, 2, 0, 0], [3, 1, 0, 0, 0, 0], [3, 0, 0, 0, 0, 0], [3, 3, 1, 0, 3, 1], [3, 3, 1, 0, 2, 1],
];
export const propsDroits = (): React.ComponentProps<typeof Droits> => ({
  bandeau: BANDEAU, legende: 'l', verrouille: false,
  roles: ['A', 'B', 'C', 'D', 'E', 'F'],
  lignes: NIVEAUX.map((l, i) => ({ rubrique: `r${i}`, cases: l.map((n, j) => ({ role: `role${j}`, niveau: n, libelle: 'x', aria: 'a', apres: [] })) })),
  rolesInvitation: [{ cle: 'membre', libelle: 'Membre' }],
  equipe: ['w', '', '', ''].map((c, i) => ({ email: `m${i}@x.fr`, initiales: 'M', role: 'R', total: c === 'w', depuis: 'd' })),
  audit: Array.from({ length: 5 }, (_, i) => ({ id: `a${i}`, initiales: 'A', acteur: 'A', texte: 't', quand: 'q' })),
});

export const propsPrompts = (): React.ComponentProps<typeof Prompts> => ({
  bandeau: BANDEAU,
  kpis: [{ lbl: 'A', v: '1' }, { lbl: 'B', v: '1' }, { lbl: 'C', v: '1' }, { lbl: 'D', v: '1', d: 'a', c: 'w' }],
  familles: [
    { cle: 'styles', libelle: 'Styles', colonne: 'Style', entrees: Array.from({ length: 13 }, (_, i) => ({ id: `s${i}`, titre: 'S', version: 'v1', utilisations: '1', production: { part: 50, texte: 't', absente: i === 4 || i === 9 }, maj: 'm', editer: '/x' })) },
    { cle: 'regles', libelle: 'Règles', colonne: 'Règle', entrees: [] },
    { cle: 'skills', libelle: 'Skills', colonne: 'Skill', entrees: [] },
  ],
});

describe('Spatial · Tour de contrôle · parité de structure avec la maquette', () => {
  it('« Tour de contrôle » reproduit la maquette', () => {
    const p = parite(rendre(<TourDeControle {...propsTourDeControle()} />), 'admin');
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Churn & rétention » reproduit la maquette (blocs sans source ignorés)', () => {
    const p = parite(rendre(<Churn {...propsChurn()} />), 'a-churn', { ignorer: VIDES_CHURN });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Revenus & MRR » reproduit la maquette (mouvements et cohortes ignorés)', () => {
    const p = parite(rendre(<Revenus {...propsRevenus()} />), 'a-revenus', { ignorer: VIDES_REVENUS });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Forfaits & offres » reproduit la maquette (création et codes promo ignorés)', () => {
    const p = parite(rendre(<Forfaits {...propsForfaits()} />), 'a-abos', { ignorer: VIDES_FORFAITS });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Inscriptions & comptes » reproduit la maquette (gestes par compte ignorés)', () => {
    const p = parite(rendre(<Comptes {...propsComptes()} />), 'a-comptes', { ignorer: VIDES_COMPTES });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Tickets SAV » reproduit la maquette (gestes simulés ignorés, message et carte client gardés)', () => {
    const html = rendre(<Sav {...propsSav()} />);
    const p = parite(html, 'a-sav', { ignorer: VIDES_SAV });
    expect(p.rendu).toEqual(p.reference);
    const msg = parite(html, 'a-sav', { selecteur: '.savconv > .savmsg.c' });
    expect(msg.rendu).toEqual(msg.reference);
    const carte = parite(html, 'a-sav', { selecteur: '.savctx > .savcard' });
    expect(carte.rendu).toEqual(carte.reference);
  });

  it('« Coûts IA & marges » reproduit la maquette (réglages du plafond ignorés)', () => {
    const p = parite(rendre(<Couts {...propsCouts()} />), 'a-couts', { ignorer: VIDES_COUTS });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Modèles IA connectés » reproduit la maquette (ajout et renouvellement ignorés, carte gardée)', () => {
    const html = rendre(<Modeles {...propsModeles()} />);
    const p = parite(html, 'a-modeles', { ignorer: VIDES_MODELES });
    expect(p.rendu).toEqual(p.reference);
    for (const sel of ['.amods > article:nth-child(1)', '.amods > article:nth-child(5)']) {
      const c = parite(html, 'a-modeles', { selecteur: sel });
      expect(c.rendu).toEqual(c.reference);
    }
  });

  it('« Usage & tests » reproduit la maquette (déploiements et tests A/B ignorés)', () => {
    const p = parite(rendre(<UsageTests {...propsUsage()} />), 'a-usage', { ignorer: VIDES_USAGE });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Stripe & Whop » reproduit la maquette (webhook Whop et rapprochement Whop ignorés)', () => {
    const p = parite(rendre(<Paiements {...propsPaiements()} />), 'a-paiements', { ignorer: VIDES_PAIEMENTS });
    // La capture de ce fragment a saisi la cloche EN PLEINE animation (`ring2`, classe posée
    // puis retirée par la maquette) · un état transitoire, pas une structure.
    expect(p.rendu).toEqual(p.reference.map((l) => l.replace('button.bell.ring2', 'button.bell')));
  });

  it('« Rôles & droits » reproduit la maquette', () => {
    const p = parite(rendre(<Droits {...propsDroits()} />), 'a-droits');
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Bibliothèque IA » reproduit la maquette', () => {
    const p = parite(rendre(<Prompts {...propsPrompts()} />), 'a-prompts');
    expect(p.rendu).toEqual(p.reference);
  });
});

/* ───────────────────────── comportements (jsdom, actions simulées) ───────────────────────── */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let racine: Root | null = null;
let hote: HTMLDivElement | null = null;
const toasts: string[] = [];
async function monter(n: React.ReactNode) {
  hote = document.createElement('div'); document.body.appendChild(hote);
  racine = createRoot(hote);
  await act(async () => { racine!.render(<FournisseurSpatial value={{ ...CTX, toast: (m) => { toasts.push(m); } }}>{n}</FournisseurSpatial>); });
  return hote;
}
const cliquer = async (e: Element | null | undefined) => { await act(async () => { (e as HTMLElement).click(); }); };
const bouton = (h: HTMLElement, texte: string) => [...h.querySelectorAll('button')].find((b) => b.textContent?.includes(texte));
afterEach(() => { act(() => racine?.unmount()); hote?.remove(); racine = null; hote = null; toasts.length = 0; vi.clearAllMocks(); });

describe('Spatial · Tour de contrôle · comportements', () => {
  it('Comptes à risque · la puce « Critiques » ne garde que les comptes critiques', async () => {
    const p = propsChurn();
    const comptes = p.comptes.map((c, i) => ({ ...c, cles: i < 2 ? ['core', 'critique'] : ['plus'] }));
    const h = await monter(<ComptesARisqueListe filtres={p.filtres} comptes={comptes} />);
    expect(h.querySelectorAll('.atable > .atr')).toHaveLength(6);
    await cliquer(h.querySelector('[data-acf="critique"]'));
    expect(h.querySelectorAll('.atable > .atr')).toHaveLength(2);
    expect(h.querySelector('[data-acf="critique"]')!.getAttribute('aria-pressed')).toBe('true');
    await cliquer(h.querySelector('[data-acf="essai"]'));
    expect(h.textContent).toContain('Aucun compte dans ce filtre.');
  });

  it('Comptes · la recherche filtre par nom, sans casse', async () => {
    const p = propsComptes();
    const h = await monter(<ComptesListe filtres={p.filtres} comptes={p.comptes} colonnes="1fr" />);
    const champ = h.querySelector('#auq') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(champ, 'c3'); champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(h.querySelectorAll('#accrows > .atr')).toHaveLength(1);
    expect(h.querySelector('#accrows b')!.textContent).toBe('C3');
  });

  it('SAV · un ticket d’un autre espace ne se traite pas d’ici · la réponse est désactivée et dit pourquoi', async () => {
    const p = propsSav();
    const tickets = p.tickets.map((t) => ({ ...t, bloque: 'Réponse réservée à l’espace E.' }));
    const h = await monter(<PosteSav onglets={p.onglets} tickets={tickets} reponsesTypes={p.reponsesTypes} />);
    const zone = h.querySelector('#areply') as HTMLTextAreaElement;
    expect(zone.disabled).toBe(true);
    expect(zone.placeholder).toBe('Réponse réservée à l’espace E.');
    expect(bouton(h, 'Résoudre')).toBeUndefined();
    expect((bouton(h, 'Envoyer') as HTMLButtonElement).disabled).toBe(true);
    await cliquer(bouton(h, 'Envoyer'));
    expect(actions.reply).not.toHaveBeenCalled();
  });

  it('SAV · une réponse type remplit la réponse, « Envoyer » et « Résoudre » passent par les actions du support', async () => {
    const p = propsSav();
    const h = await monter(<PosteSav onglets={p.onglets} tickets={p.tickets} reponsesTypes={p.reponsesTypes} />);
    await cliquer([...h.querySelectorAll('.savr .chip')][1]);
    expect((h.querySelector('#areply') as HTMLTextAreaElement).value).toBe('b');
    await cliquer(bouton(h, 'Envoyer'));
    expect(actions.reply).toHaveBeenCalledTimes(1);
    const fd = actions.reply.mock.calls[0]![0];
    expect([fd.get('ticketId'), fd.get('body')]).toEqual(['t1', 'b']);
    await cliquer(bouton(h, 'Résoudre'));
    const st = actions.statut.mock.calls[0]![0];
    expect([st.get('ticketId'), st.get('status')]).toEqual(['t1', 'resolved']);
  });

  it('SAV · choisir un autre ticket change le détail', async () => {
    const p = propsSav();
    const tickets = p.tickets.map((t, i) => ({ ...t, titre: `Titre ${i}` }));
    const h = await monter(<PosteSav onglets={p.onglets} tickets={tickets} reponsesTypes={p.reponsesTypes} />);
    expect(h.querySelector('.savdh h2')!.textContent).toBe('Titre 0');
    await cliquer(h.querySelector('[data-atk="t3"]'));
    expect(h.querySelector('.savdh h2')!.textContent).toBe('Titre 2');
    expect(h.querySelector('.savi.on')!.getAttribute('data-atk')).toBe('t3');
  });

  it('Droits · un clic enregistre les rubriques du rôle APRÈS bascule, par l’action de l’équipe', async () => {
    const h = await monter(<MatriceDroitsSpatiale roles={['Manager']} lignes={[{ rubrique: 'Veille', cases: [{ role: 'manager', niveau: 2, libelle: 'Accès', aria: 'a', apres: ['dashboard', 'radar'] }] }]} verrouille={false} />);
    await cliquer(h.querySelector('.amc'));
    const fd = actions.matrice.mock.calls[0]![0];
    expect(fd.get('role')).toBe('manager');
    expect(fd.getAll('rubrique')).toEqual(['dashboard', 'radar']);
  });

  it('Droits · un compte non admissible voit la matrice verrouillée', async () => {
    const h = await monter(<MatriceDroitsSpatiale roles={['Manager']} lignes={[{ rubrique: 'Veille', cases: [{ role: 'manager', niveau: 0, libelle: 'Aucun', aria: 'a', apres: ['veille'] }] }]} verrouille />);
    expect((h.querySelector('.amc') as HTMLButtonElement).disabled).toBe(true);
    await cliquer(h.querySelector('.amc'));
    expect(actions.matrice).not.toHaveBeenCalled();
  });

  it('Revenus · « 6 mois » recadre les mois affichés', async () => {
    const h = await monter(<RevenusHero {...propsRevenus().hero} />);
    expect(h.querySelectorAll('.rvmo span')).toHaveLength(12);
    await cliquer(bouton(h, '6 mois'));
    expect(h.querySelectorAll('.rvmo span')).toHaveLength(6);
    expect(h.querySelector('.rvmo span:last-child')!.className).toBe('on');
  });

  it('Stripe · « Vérifier » lance le diagnostic réel et dit son résultat', async () => {
    const h = await monter(<VerifierStripe />);
    await cliquer(bouton(h, 'Vérifier'));
    expect(actions.diagnostic).toHaveBeenCalledTimes(1);
    expect(toasts).toEqual(['Stripe · 1 point bloquant']);
  });
});
