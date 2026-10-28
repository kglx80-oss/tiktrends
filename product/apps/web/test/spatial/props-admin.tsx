import type { TourDeControle } from '../../spatial/vues/admin/TourDeControle';
import type { Churn } from '../../spatial/vues/admin/Churn';
import type { Revenus } from '../../spatial/vues/admin/Revenus';
import type { Forfaits } from '../../spatial/vues/admin/Forfaits';
import type { Comptes } from '../../spatial/vues/admin/Comptes';
import type { Sav } from '../../spatial/vues/admin/Sav';
import type { Couts } from '../../spatial/vues/admin/Couts';
import type { Modeles } from '../../spatial/vues/admin/Modeles';
import type { UsageTests } from '../../spatial/vues/admin/UsageTests';
import type { Paiements } from '../../spatial/vues/admin/Paiements';
import type { Droits } from '../../spatial/vues/admin/Droits';
import type { Prompts } from '../../spatial/vues/admin/Prompts';

/**
 * Les jeux de props de PARITÉ du Tour de contrôle · ils reproduisent les
 * NOMBRES d'éléments et les classes des fragments de la maquette
 * (`docs/spatial/reference/a-*.html`). Données de test, jamais servies.
 * Partagés par `spatial-admin.test.tsx` et `spatial-admin-v3.test.tsx`.
 */

export const BANDEAU = { payants: 395, actualise: 'à l’instant' };
export const douze = <T,>(f: (i: number) => T) => Array.from({ length: 12 }, (_, i) => f(i));

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
export const VIDES_CHURN = ['.creas', '.funnel', '.view > section.sec:last-child > .atable', '.cacts'];

export const propsRevenus = (): React.ComponentProps<typeof Revenus> => ({
  bandeau: BANDEAU,
  hero: { titre: 'MRR', valeur: '1 €', variation: '▲', detail: 'd', serie: douze((i) => ({ libelle: 'm', valeur: i * 10, enCours: i === 11 })) },
  cotes: [{ lbl: 'ARPU', v: '1', d: 'a', c: 'up' }, { lbl: 'NRR', v: '1', d: 'a', c: 'up' }, { lbl: 'LTV', v: '1', s: 's' }, { lbl: 'CAC', v: '1', d: 'a', c: 'up' }],
  repartition: { legende: 'l', formules: ['Core', 'Plus', 'Business'].map((l, i) => ({ libelle: l, mrr: i + 1, mrrTexte: '1 €', part: '1 %' })), note: 'n' },
  rentabilite: ['Core', 'Plus', 'Business'].map((l) => ({ libelle: l, prix: '1', abonnes: '1', mrr: '1', coutIa: '1', frais: '1', marge: 70, margeTexte: '70 %', churn: 'x', ltv: 'x' })),
});
/** Mouvements du MRR et cohortes · sans historique, contenu fictif dans la maquette. */
export const VIDES_REVENUS = ['.wfall', '.coh'];

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
export const VIDES_FORFAITS = ['.view > section.tile:not(.sec) > .sech', '.agrid2 > section:last-child'];

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
export const VIDES_COMPTES = ['.aacts'];

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
export const VIDES_SAV = ['.savdh > .kc', '.savconv', '.savctx', '.savr .seg', '.savr > .kc'];

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
export const VIDES_COUTS = ['.agrid2 .kc'];

export const propsModeles = (): React.ComponentProps<typeof Modeles> => ({
  bandeau: BANDEAU, legende: 'l',
  modeles: Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, fournisseur: 'anthropic', nom: 'M', actif: i !== 4, poste: 'p', latence: '1 s', echecs: '1 %', cout: '1 $' })),
  cles: ['Anthropic', 'fal', 'Higgsfield', 'Google'].map((n) => ({ nom: n, etat: 'Définie', detail: 'd' })),
});
/** « Ajouter un modèle » et « Renouveler » une clé n'ont aucune action réelle · la grille est gardée par une parité ciblée. */
export const VIDES_MODELES = ['.amods', '.view > section.sec .atr > span:last-child'];

export const propsUsage = (): React.ComponentProps<typeof UsageTests> => ({
  bandeau: BANDEAU, titre: 'Usage',
  usage: Array.from({ length: 7 }, (_, i) => ({ libelle: `u${i}`, largeur: 50, n: '1' })),
});
/** Déploiements progressifs et tests A/B · aucune source dans l'outil. */
export const VIDES_USAGE = ['.aflags', '.view > section.sec'];

export const propsPaiements = (): React.ComponentProps<typeof Paiements> => ({
  bandeau: BANDEAU,
  cartes: (['stripe', 'whop'] as const).map((c) => ({ cle: c, nom: c, sous: 's', connecte: true, etat: 'Connecté', stats: [{ libelle: 'a', valeur: '1' }, { libelle: 'b', valeur: '1' }, { libelle: 'c', valeur: '1' }], note: 'n', ouvrir: 'https://x', verifier: true })),
  defauts: { legende: 'l', lignes: Array.from({ length: 3 }, (_, i) => ({ id: `d${i}`, nom: 'N', forfait: 'Core', prix: '1', motif: 'm', statut: 'En retard', lien: 'https://x' })) },
  webhooks: { etat: { libelle: 'ok', classe: 'g' }, lignes: Array.from({ length: 4 }, (_, i) => ({ id: `w${i}`, type: 'invoice.paid', quand: 'q' })) },
  rapprochement: { lignes: [{ libelle: 'Stripe', valeur: '1 / 1', etat: { libelle: 'OK', classe: 'g' } }], ecarts: [] },
});
/** Le 4e webhook de la maquette vient de Whop (non branché) · le rapprochement Whop et sa correction n'existent pas. */
export const VIDES_PAIEMENTS = ['.agrid2.sec > section:first-child .atr:nth-child(4)', '.agrid2.sec > section:last-child'];

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


