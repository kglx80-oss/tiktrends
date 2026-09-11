/**
 * Époque de session · le seul levier qui révoque un jeton déjà émis.
 *
 * ── Ce que ça ferme ──────────────────────────────────────────────────────────
 *
 * Le cookie de session est un JWT signé, valable 30 jours. Sans époque, rien ne
 * l'invalide avant terme : un logout ne fait que supprimer le cookie côté client,
 * et un reset de mot de passe ne coupe pas les sessions déjà ouvertes. Un cookie
 * volé restait donc valide un mois APRÈS que la victime a repris son compte.
 *
 * Le compte porte un entier `sessionEpoch`. Le jeton fige l'époque à sa création.
 * `getSession` rejette tout jeton dont l'époque diffère de celle du compte.
 * Incrémenter l'époque (reset, changement de mot de passe, « déconnecter
 * partout ») invalide d'un coup TOUS les jetons émis avant.
 *
 * La décision vit ici, pure et testable · `auth.ts` (server-only, base + cookies)
 * ne fait que la câbler. Le doute — jeton sans époque, valeur non entière — est
 * tranché une seule fois, du côté sûr : on retombe sur 0.
 */

/** Époque figée dans le jeton · 0 par défaut (jeton ancien, champ absent, valeur douteuse). */
export function epochDuJeton(payload: unknown): number {
  const brut = (payload as { ep?: unknown } | null)?.ep;
  const n = Number(brut ?? 0);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/** Le jeton est-il encore de l'époque courante du compte ? Sinon, il est révoqué. */
export function sessionEpochValide(epochJeton: number, epochCompte: number): boolean {
  return epochJeton === epochCompte;
}
