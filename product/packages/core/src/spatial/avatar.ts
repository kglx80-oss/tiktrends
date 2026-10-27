/**
 * Les initiales de l'avatar · la première LETTRE de chaque mot (« Kevin
 * Guilbaux » → « KG », « Kevin (banc) » → « KB »), jamais un signe de
 * ponctuation, jamais vides. Pur.
 */
export function initialesAvatar(nom: string, email: string): string {
  const lettre = (m: string) => m.match(/\p{L}/u)?.[0] ?? '';
  const mots = nom.trim().split(/\s+/).map(lettre).filter(Boolean);
  const i = mots.length >= 2 ? mots[0]! + mots[mots.length - 1]! : mots[0] ?? (email.match(/\p{L}/gu) ?? []).slice(0, 2).join('');
  return (i || '?').toUpperCase();
}
