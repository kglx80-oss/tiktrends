import { domaineConcurrent, initialesConcurrent, tinteConcurrent } from '@tiktrends/core';

/**
 * L'avatar identitaire d'une marque ou d'un site · reconnaissable d'un coup d'œil.
 *
 * La favicon du site quand une adresse est connue (posée en fond CSS sur un
 * dégradé teinté · si elle ne charge pas, 404 ou blocage, le dégradé reste, sans
 * icône cassée et sans JS), sinon les initiales sur ce même dégradé, dont la
 * couleur est PROPRE à la marque · deux marques ne se ressemblent jamais. C'est
 * ce qui remplace la pastille d'accent uniforme, la même pour toutes.
 *
 * `nom` porte la teinte et les initiales · `site` (une URL ou un domaine) porte
 * la favicon. Les deux se séparent : la liste des marques a un nom ET une URL
 * distincts. Pur affichage · la logique (domaine, teinte, initiales) vient du
 * noyau, exercée en test.
 */
export function AvatarSite({ nom, site, taille = 44, rayon = 12 }: {
  nom: string;
  /** L'adresse du site · une URL ou un domaine · d'où l'on tire la favicon. */
  site?: string | null;
  taille?: number;
  rayon?: number;
}) {
  const domaine = site ? domaineConcurrent(site) : null;
  const tinte = tinteConcurrent(nom);
  const fond = `linear-gradient(135deg, ${tinte.de}, ${tinte.vers})`;
  const fondStyle: React.CSSProperties = domaine
    ? {
        backgroundImage: `url("https://www.google.com/s2/favicons?domain=${encodeURIComponent(domaine)}&sz=64"), ${fond}`,
        backgroundSize: `${Math.round(taille * 0.5)}px ${Math.round(taille * 0.5)}px, cover`,
        backgroundPosition: 'center, center',
        backgroundRepeat: 'no-repeat, no-repeat',
      }
    : { background: fond };
  return (
    <span style={{
      width: taille, height: taille, flexShrink: 0, borderRadius: rayon,
      border: '1px solid var(--line-2)', color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: Math.round(taille * 0.34), letterSpacing: '.02em',
      ...fondStyle,
    }}>
      {!domaine && initialesConcurrent(nom)}
    </span>
  );
}
