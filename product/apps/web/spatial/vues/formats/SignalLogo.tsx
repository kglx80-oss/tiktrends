import type { SignalLogoAReimporter } from '@tiktrends/core';
import { Ic, Lien } from '../../communs';

/**
 * Le logo par défaut de la marque active est à réimporter · les miniatures en
 * montrent l'INITIALE, et ce signal le dit, avec sa raison et le chemin vers
 * l'Identité pour qui peut la gérer (noyau `vignetteMarqueAffichee`, même
 * signal que l'accueil et la coquille). Rien d'autre n'est bloqué.
 */
export function SignalLogo({ s }: { s: SignalLogoAReimporter | null | undefined }) {
  if (!s) return null;
  return (
    <span data-signal-logo style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {s.lien
        ? <Lien href={s.lien} className="pill r" data-lien="identite-marque"><Ic n="warn" />{s.libelle}</Lien>
        : <span className="pill r"><Ic n="warn" />{s.libelle}</span>}
      <span className="faint">{s.raison} {s.aide}</span>
    </span>
  );
}
