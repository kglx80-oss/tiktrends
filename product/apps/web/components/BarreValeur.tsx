/**
 * Une barre proportionnée · rend un chiffre nu lisible d'un coup d'œil.
 *
 * `part` est déjà borné à [0, 1] par le noyau (`partDeMax`) · ici, du rendu pur :
 * une piste, un remplissage dont la largeur reflète la part. Réutilisable partout
 * où l'on veut « voir » un rapport plutôt que le lire (dépense, taux, avancement).
 */
export function BarreValeur({ part, couleur = 'var(--grad-accent)', hauteur = 6, piste = 'var(--line-2)' }: {
  part: number;
  couleur?: string;
  hauteur?: number;
  piste?: string;
}) {
  const borne = Math.max(0, Math.min(1, part));
  const pct = Math.round(borne * 100);
  // Filet minimal · une part non nulle mais minuscule (1 % de dépense) doit
  // rester VISIBLE, sinon la barre ment en la rendant à zéro. La valeur
  // d'accessibilité, elle, garde le vrai pourcentage.
  const largeur = borne > 0 ? Math.max(3, pct) : 0;
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
      style={{ height: hauteur, borderRadius: 999, background: piste, overflow: 'hidden' }}>
      <div style={{ width: `${largeur}%`, height: '100%', background: couleur, borderRadius: 999 }} />
    </div>
  );
}
