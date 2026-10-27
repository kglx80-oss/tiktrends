import { EnTete, Ic, Lien, Vue } from '../../communs';
import { EtatVide, SousNavVeille, Vignette } from './base';

/**
 * « Ce qui scale » · `docs/spatial/reference/scale.html`. Les créas que les
 * marques gardent en ligne le plus longtemps (jours de diffusion RÉELS de la
 * source), classées par le noyau (`classerParDuree`).
 */
export interface LigneScale { cle: string; rang: number; image: string | null; accroche: string; detail: string; part: number; jours: string; cloner: string }

export function CeQuiScale({ sous, lignes, pastilleRadar, vide }: { sous: string; lignes: ReadonlyArray<LigneScale>; pastilleRadar: string | null; vide: { titre: string; texte: string; action: { href: string; libelle: string } | null } | null }) {
  return (
    <Vue>
      <EnTete titre="Ce qui scale" sous={sous} />
      <SousNavVeille actif="/veille/scale" pastilleRadar={pastilleRadar} />
      {lignes.length > 0 ? (
        <div className="scaleL">
          {lignes.map((l) => (
            <div className="srow" key={l.cle}>
              <span className="faint num">{l.rang}</span>
              <Vignette image={l.image} />
              <div style={{ minWidth: 0 }}>
                <strong style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.accroche}</strong>
                <span className="faint" style={{ fontSize: '11.5px' }}>{l.detail}</span>
              </div>
              <div className="dbar"><i><b style={{ width: `${l.part}%` }} /></i><span>{l.jours}</span></div>
              <Lien className="btn sm" href={l.cloner}><Ic n="copy" />Cloner</Lien>
            </div>
          ))}
        </div>
      ) : vide && <EtatVide titre={vide.titre} texte={vide.texte} action={vide.action} />}
    </Vue>
  );
}
