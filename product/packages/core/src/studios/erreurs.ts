/**
 * Studios · contrat d'erreur commun (cahier 06 §3).
 *
 * Pur · ni base, ni réseau, ni modèle. Chaque commande studio répond soit son
 * résultat, soit UNE forme d'erreur : code stable, message français qui dit quoi
 * faire, cibles autorisées, caractère récupérable et identifiant de trace.
 *
 * ── Non-divulgation ──────────────────────────────────────────────────────────
 *
 * Un objet hors de la portée de la session (autre espace, marque non autorisée,
 * identifiant inconnu) répond TOUJOURS `NOT_FOUND`, avec le même message, sans
 * cible : la réponse ne permet pas de savoir s'il existe. `FORBIDDEN` est
 * réservé au refus d'un GESTE sur une portée que la session voit déjà (un
 * lecteur qui tente de générer) · c'est la politique des gardes existants
 * (`video.ts`, `adsmap-guard.ts`), qui ne confirment jamais l'existence d'un
 * objet d'un autre espace.
 */

export const CODES_ERREUR_STUDIO = [
  'AUTH_REQUIRED',
  'FORBIDDEN',
  'NOT_FOUND',
  'VERSION_CONFLICT',
  'INVALID_SCHEMA',
  'UNSUPPORTED_CAPABILITY',
  'MISSING_REFERENCE',
  'INVARIANT_CONFLICT',
  'QUOTE_EXPIRED',
  'BUDGET_EXCEEDED',
  'RATE_LIMITED',
  'PROVIDER_UNCERTAIN',
  'PERSISTENCE_FAILED',
  'QUALITY_REVIEW_REQUIRED',
] as const;

export type CodeErreurStudio = (typeof CODES_ERREUR_STUDIO)[number];

/** Différence d'un champ entre la version de base et la version courante (409). */
export interface DifferenceVersion {
  chemin: string;
  base: unknown;
  courant: unknown;
}

export interface ErreurStudio {
  ok: false;
  code: CodeErreurStudio;
  /** Statut HTTP équivalent, pour une route qui relaierait l'erreur. */
  status: number;
  message: string;
  /** Identifiants que la session a le droit de voir · jamais ceux d'une autre portée. */
  targetIds: string[];
  recoverable: boolean;
  traceId: string;
  /** Pour VERSION_CONFLICT : la version courante et le diff, jamais d'écrasement. */
  conflit?: { versionCouranteId: string; differences: DifferenceVersion[] };
  /** Pour INVALID_SCHEMA : les chemins fautifs et la raison, sans valeur interne. */
  violations?: Array<{ chemin: string; raison: string }>;
}

interface DefinitionErreur { status: number; recoverable: boolean; message: string }

/**
 * Messages par défaut · chacun dit ce qui se passe PUIS quoi faire (règle des
 * refus du dépôt, `lib/guard-error.ts`). Aucun ne nomme une donnée interne.
 */
export const DEFINITIONS_ERREUR_STUDIO: Readonly<Record<CodeErreurStudio, DefinitionErreur>> = {
  AUTH_REQUIRED: { status: 401, recoverable: true, message: 'Ta session a expiré · reconnecte-toi pour continuer.' },
  FORBIDDEN: { status: 403, recoverable: false, message: 'Ton rôle ne permet pas ce geste · demande à un administrateur de l’espace.' },
  NOT_FOUND: { status: 404, recoverable: false, message: 'Projet introuvable · vérifie la marque active ou reviens à la liste des projets.' },
  VERSION_CONFLICT: { status: 409, recoverable: true, message: 'Ce projet a changé depuis ton ouverture · recharge-le, puis reporte tes modifications.' },
  INVALID_SCHEMA: { status: 422, recoverable: true, message: 'Le contenu envoyé n’est pas valide · corrige les champs signalés puis réessaie.' },
  UNSUPPORTED_CAPABILITY: { status: 422, recoverable: false, message: 'Cette opération n’est pas disponible pour ce projet · choisis un autre format ou une autre opération.' },
  MISSING_REFERENCE: { status: 422, recoverable: true, message: 'Une référence du projet manque ou n’est plus accessible · remplace-la puis réessaie.' },
  INVARIANT_CONFLICT: { status: 409, recoverable: true, message: 'La modification contredit une règle du projet · ajuste la demande ou la règle, puis réessaie.' },
  QUOTE_EXPIRED: { status: 409, recoverable: true, message: 'Le devis a expiré · demande un nouveau devis avant de lancer.' },
  BUDGET_EXCEEDED: { status: 402, recoverable: false, message: 'Le plafond de dépense est atteint · réduis la demande ou attends le prochain cycle.' },
  RATE_LIMITED: { status: 429, recoverable: true, message: 'Trop de demandes en même temps · réessaie dans un instant.' },
  PROVIDER_UNCERTAIN: { status: 502, recoverable: false, message: 'Le résultat du fournisseur est incertain · rien n’est relancé, une vérification est en cours.' },
  PERSISTENCE_FAILED: { status: 500, recoverable: true, message: 'L’enregistrement a échoué · réessaie, rien n’a été perdu ni facturé.' },
  QUALITY_REVIEW_REQUIRED: { status: 409, recoverable: true, message: 'Ce média demande une relecture · valide-le ou écarte-le avant de continuer.' },
};

export interface OptionsErreurStudio {
  traceId: string;
  targetIds?: string[];
  message?: string;
  conflit?: ErreurStudio['conflit'];
  violations?: ErreurStudio['violations'];
}

/**
 * Fabrique l'erreur. Pour `NOT_FOUND`, les cibles et le message sont FORCÉS aux
 * valeurs neutres : un appelant ne peut pas, par mégarde, renvoyer l'id ou le
 * titre d'un objet d'une autre portée.
 */
export function erreurStudio(code: CodeErreurStudio, o: OptionsErreurStudio): ErreurStudio {
  const d = DEFINITIONS_ERREUR_STUDIO[code];
  const neutre = code === 'NOT_FOUND' || code === 'AUTH_REQUIRED';
  const e: ErreurStudio = {
    ok: false,
    code,
    status: d.status,
    message: neutre ? d.message : (o.message ?? d.message),
    targetIds: neutre ? [] : [...(o.targetIds ?? [])],
    recoverable: d.recoverable,
    traceId: o.traceId,
  };
  if (code === 'VERSION_CONFLICT' && o.conflit) e.conflit = o.conflit;
  if (code === 'INVALID_SCHEMA' && o.violations) e.violations = o.violations;
  return e;
}

export function estErreurStudio(x: unknown): x is ErreurStudio {
  return typeof x === 'object' && x !== null && (x as { ok?: unknown }).ok === false
    && typeof (x as { code?: unknown }).code === 'string'
    && (CODES_ERREUR_STUDIO as readonly string[]).includes((x as { code: string }).code);
}
