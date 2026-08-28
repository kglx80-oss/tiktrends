/**
 * Traduction des échecs techniques en messages actionnables.
 *
 * Les actions renvoyaient jusqu'ici le message brut de l'API (« 429 », « fetch
 * failed », « overloaded_error »). C'est illisible pour un client, ça n'indique
 * jamais quoi faire, et en démonstration ça fait amateur. Ici on ramène chaque
 * famille d'échec à une phrase qui dit CE QUI s'est passé et CE QU'IL FAUT FAIRE.
 *
 * Volontairement pur (aucun import serveur) pour rester testable et utilisable
 * partout · l'enregistrement de la trace vit dans `lib/error-log`.
 */

export interface UserErrorOptions {
  /** Ce qu'on essayait de faire, au singulier : « la génération », « l'analyse ». */
  subject?: string;
  /** Message à utiliser si rien de connu ne correspond. */
  fallback?: string;
}

const raw = (e: unknown): string => {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message ?? '');
  return String(e ?? '');
};

/** Premier code HTTP plausible trouvé dans le message (les SDK les collent au texte). */
function statusIn(msg: string): number | null {
  const m = msg.match(/\b(4\d{2}|5\d{2})\b/);
  return m ? Number(m[1]) : null;
}

/**
 * Message affichable pour un utilisateur. `subject` sert d'accroche : on obtient
 * « L'analyse a mis trop de temps… » plutôt qu'une phrase impersonnelle.
 */
export function userError(e: unknown, opts: UserErrorOptions = {}): string {
  const msg = raw(e);
  const low = msg.toLowerCase();
  const sujet = opts.subject ?? "l'opération";
  const Sujet = sujet.charAt(0).toUpperCase() + sujet.slice(1);

  // Plafond de dépense · le message porte déjà les chiffres, on le rend tel
  // quel. Le traduire ferait perdre le montant restant, qui est l'information.
  if (/plafond de dépense/i.test(msg)) return msg;

  // Délai dépassé (AbortSignal.timeout, SDK, proxy).
  if (/timeout|timedout|aborted|abort ?error|etimedout|deadline/.test(low)) {
    return `${Sujet} a mis trop de temps et a été interrompue. Réessaie · si ça se reproduit, réduis la quantité demandée.`;
  }

  // Injoignable : DNS, connexion refusée, coupure réseau.
  if (/fetch failed|econnrefused|enotfound|econnreset|eai_again|network|socket hang up|dns/.test(low)) {
    return `Le service n'a pas répondu. C'est temporaire dans la plupart des cas · réessaie dans un instant.`;
  }

  // Quota / débit.
  if (/rate.?limit|429|too many requests|overloaded/.test(low)) {
    return `Le service est saturé pour le moment. Attends une minute puis relance · rien n'a été débité.`;
  }

  // Crédit ou quota épuisé CHEZ LE FOURNISSEUR (pas les crédits du client).
  if (/insufficient|credit balance|quota|billing|payment required|402/.test(low)) {
    return `Le service de génération a atteint sa limite côté serveur. Préviens-nous · nous rétablissons ça rapidement.`;
  }

  // Clé absente, invalide ou révoquée.
  if (/unauthorized|invalid.?api.?key|authentication|forbidden|401|403/.test(low)) {
    return `L'accès au service a été refusé (clé serveur à renouveler). Préviens-nous · ce n'est pas lié à ton compte.`;
  }

  // Image de départ illisible : le cas de loin le plus fréquent côté Studio.
  if (/image_load_error|failed to load the image|invalid image|unsupported image/.test(low)) {
    return `L'image de départ n'a pas pu être chargée. Elle doit être un fichier image direct (jpg, png, webp) et accessible publiquement · pas une page produit. Astuce : clic droit sur l'image → « Copier l'adresse de l'image ».`;
  }

  // Adresse refusée par notre garde réseau.
  if (/adresse refusée|site inaccessible/.test(low)) {
    return `Ce site n'a pas pu être consulté. Vérifie l'adresse (elle doit être publique et en https).`;
  }

  // Contenu refusé par le modèle · motif explicite uniquement (« refus » seul
  // était trop large et attrapait des messages sans rapport).
  if (/content.?polic|safety|moderation|nsfw|blocked|prohibited/.test(low)) {
    return `La demande a été refusée par le modèle (contenu jugé sensible). Reformule le brief en restant descriptif.`;
  }

  const status = statusIn(low);
  if (status && status >= 500) {
    return `Le service de génération est momentanément indisponible. Réessaie dans quelques minutes.`;
  }
  if (status === 422 || status === 400) {
    return `La demande a été refusée par le service. Ajuste le brief ou l'image de départ, puis relance.`;
  }

  return opts.fallback ?? `${Sujet} n'a pas abouti. Réessaie · si le problème persiste, écris-nous depuis le Support.`;
}

/** Message technique d'origine (utile pour le journal · jamais affiché tel quel). */
export function rawMessage(e: unknown): string {
  return raw(e);
}

/**
 * Famille normalisée d'un échec · sert à regrouper le journal ADMIN+ pour voir
 * d'un coup d'œil si c'est le réseau, un quota ou une clé qui déraille.
 */
export type ErrorFamily = 'delai' | 'reseau' | 'saturation' | 'quota' | 'acces' | 'image' | 'adresse' | 'contenu' | 'service' | 'requete' | 'autre';

export function errorFamily(e: unknown): ErrorFamily {
  const low = raw(e).toLowerCase();
  if (/timeout|timedout|aborted|abort ?error|etimedout|deadline/.test(low)) return 'delai';
  if (/fetch failed|econnrefused|enotfound|econnreset|eai_again|network|socket hang up|dns/.test(low)) return 'reseau';
  if (/rate.?limit|429|too many requests|overloaded/.test(low)) return 'saturation';
  if (/insufficient|credit balance|quota|billing|payment required|402/.test(low)) return 'quota';
  if (/unauthorized|invalid.?api.?key|authentication|forbidden|401|403/.test(low)) return 'acces';
  if (/image_load_error|failed to load the image|invalid image|unsupported image/.test(low)) return 'image';
  if (/adresse refusée|site inaccessible/.test(low)) return 'adresse';
  if (/content.?polic|safety|moderation|nsfw|blocked|prohibited/.test(low)) return 'contenu';
  const status = statusIn(low);
  if (status && status >= 500) return 'service';
  if (status === 422 || status === 400) return 'requete';
  return 'autre';
}

/** Libellés lisibles des familles (menu et regroupements ADMIN+). */
export const FAMILY_LABEL: Record<ErrorFamily, string> = {
  delai: 'Délai dépassé', reseau: 'Service injoignable', saturation: 'Service saturé',
  quota: 'Quota fournisseur', acces: 'Clé / accès refusé', image: 'Image de départ',
  adresse: 'Adresse refusée', contenu: 'Contenu refusé', service: 'Panne fournisseur',
  requete: 'Requête refusée', autre: 'Autre',
};
