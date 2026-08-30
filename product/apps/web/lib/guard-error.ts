/**
 * Les refus, dits d'une seule façon.
 *
 * ── Ce que l'audit a trouvé ──────────────────────────────────────────────────
 *
 * La traduction des échecs TECHNIQUES (`user-error.ts`) est solide et testée.
 * Le désordre était ailleurs · dans les refus MÉTIER, écrits à la main action
 * par action :
 *
 *  - « Session expirée. » ×35 et « Session expirée, reconnecte-toi. » ×8 · même
 *    situation, deux formulations.
 *  - « Aucune marque active. » ×13 et « Sélectionne une marque active. » ×6 ·
 *    l'une constate, l'autre indique quoi faire. La première ne sert à rien.
 *  - « Accès refusé. » ×5, « Action réservée aux administrateurs. » ×7,
 *    « Réservé aux administrateurs. » ×2 · trois phrases pour un cas, dont une
 *    qui ne dit même pas pourquoi.
 *  - « Création impossible. », « Rattachement impossible. » · ce qui a échoué,
 *    et rien d'autre.
 *
 * ── La règle, la même que pour les états vides ───────────────────────────────
 *
 * **Dire ce qui a échoué sans dire quoi faire est une impasse.** On annonce un
 * mur à quelqu'un et on le laisse chercher la porte. Chaque refus porte donc sa
 * suite · même quand elle est « préviens-nous », qui est une action.
 *
 * ── Pourquoi une carte fermée et pas des chaînes libres ──────────────────────
 *
 * Trois chaînes brutes fuyaient déjà vers l'écran — `'session'`, `'name'`,
 * `'forbidden'` — parce que rien n'empêchait d'écrire n'importe quoi dans un
 * champ `error`. Un type énuméré rend ces trois-là inexprimables.
 *
 * Pur · aucun import serveur, testable de bout en bout.
 */

export type GuardReason =
  | 'session'      // plus de session valide
  | 'no_brand'     // aucune marque active sélectionnée
  | 'role'         // rôle insuffisant
  | 'plan'         // offre insuffisante
  | 'db'           // base injoignable
  | 'ai_off'       // modèle non configuré côté serveur
  | 'not_found';   // l'objet visé n'existe pas dans cet espace

export interface GuardContext {
  /** L'objet cherché, au singulier · « le lot », « cette ad ». */
  subject?: string;
  /** Rôle exigé · rend le refus vérifiable plutôt qu'arbitraire. */
  needRole?: 'admin' | 'owner';
  /** Nom de l'offre exigée · « Plus », « Core ». */
  needPlan?: string;
  /** Ce qu'on essayait de faire · précise le refus sans le rallonger. */
  action?: string;
}

/**
 * Le message affichable.
 *
 * Chaque branche suit la même forme : ce qui bloque, puis la sortie. Jamais
 * l'une sans l'autre.
 */
export function guardError(reason: GuardReason, ctx: GuardContext = {}): string {
  switch (reason) {
    case 'session':
      return 'Ta session a expiré · reconnecte-toi, tu retrouveras cet écran tel que tu l’as laissé.';

    case 'no_brand':
      // On dit quoi faire, pas ce qui manque · « aucune marque active » laisse
      // chercher où on en sélectionne une.
      return 'Sélectionne une marque active pour continuer · tout ici travaille marque par marque.';

    case 'role': {
      const quoi = ctx.action ? `${ctx.action} demande` : 'Cette action demande';
      const role = ctx.needRole === 'owner' ? 'le propriétaire de l’espace' : 'un rôle administrateur';
      return `${quoi} ${role} · demande à un administrateur de ton espace, ou fais-toi passer admin depuis Membres.`;
    }

    case 'plan': {
      const offre = ctx.needPlan ?? 'une offre supérieure';
      return `Cette fonctionnalité est disponible à partir de l’offre ${offre} · tu peux comparer les formules depuis Abonnement.`;
    }

    case 'db':
      // Rien que l'utilisateur puisse corriger · le dire évite qu'il cherche
      // une erreur de sa part, et « préviens-nous » reste une action.
      return 'La base de données ne répond pas. Ce n’est pas lié à ton compte · réessaie dans un instant, et préviens-nous si ça dure.';

    case 'ai_off':
      return 'L’IA n’est pas configurée sur ce serveur. Ce n’est pas lié à ton compte · préviens-nous, c’est un réglage de notre côté.';

    case 'not_found': {
      const quoi = ctx.subject ?? 'Cet élément';
      const maj = quoi.charAt(0).toUpperCase() + quoi.slice(1);
      // Le plus souvent ce n'est pas une disparition mais un changement de
      // marque active · le dire évite de chercher un objet supprimé qui existe.
      return `${maj} est introuvable dans cet espace · il a peut-être été supprimé, ou tu as changé de marque active depuis.`;
    }
  }
}

/* -------------------------------------------------------------------------- */

/** Raccourcis · ils rendent les points d'appel plus courts que la phrase écrite à la main. */
export const GUARD = {
  session: () => guardError('session'),
  noBrand: () => guardError('no_brand'),
  db: () => guardError('db'),
  aiOff: () => guardError('ai_off'),
  role: (ctx?: GuardContext) => guardError('role', ctx),
  plan: (needPlan: string) => guardError('plan', { needPlan }),
  notFound: (subject: string) => guardError('not_found', { subject }),
} as const;
