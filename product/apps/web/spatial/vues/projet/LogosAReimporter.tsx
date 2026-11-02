import type { AnnonceLogosAReimporter } from '@tiktrends/core';
import { Ic, Lien } from '../../communs';

/**
 * Un logo de la charte lié au visuel est à réimporter · dit AVANT la
 * préparation payante (parcours image, étape Format & devis de l'assistant),
 * avec le chemin vers l'Identité de la marque. N'empêche aucun geste · le
 * devis relit la consigne et refuse ce qu'il ne pourrait pas envoyer.
 */
export function AnnonceLogos({ a }: { a: AnnonceLogosAReimporter | null | undefined }) {
  if (!a) return null;
  return (
    <div className="banner" role="status" data-logo-a-reimporter={a.logos.map((l) => l.assetId).join(' ')} style={{ margin: 0 }}>
      <Ic n="warn" />
      <span>{a.message}{a.lien && <> <Lien href={a.lien} data-lien="identite-marque">Ouvrir l’Identité de la marque</Lien></>}</span>
    </div>
  );
}
