'use client';

/**
 * Un bouton de soumission qui DEMANDE confirmation avant d'agir.
 *
 * ── Pourquoi ─────────────────────────────────────────────────────────────────
 *
 * Plusieurs suppressions (marque, persona, scénario, produit) sont des `<form
 * action={serverAction}>` où un simple clic déclenchait l'action serveur · sans
 * garde-fou. Supprimer une marque efface EN CASCADE ses personas, produits et
 * créas · un misclic = perte de données irréversible.
 *
 * Ce bouton client s'insère dans la même form : il ne change rien au flux
 * serveur, mais bloque la soumission (`preventDefault`) tant que l'utilisateur
 * n'a pas confirmé. Aucun état, aucune dépendance · juste une barrière.
 */
export function ConfirmButton({
  message,
  children,
  style,
}: {
  message: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="submit"
      style={style}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
