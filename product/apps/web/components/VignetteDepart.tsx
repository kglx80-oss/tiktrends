export type AssetKind = 'product' | 'ad' | 'asset';
const KIND_LABEL: Record<AssetKind, string> = { ad: 'PUB', asset: 'ASSET', product: 'PRODUIT' };

/**
 * Une vignette du sélecteur d'« image de départ à animer » (Vidéo IA).
 *
 * Le défaut, vu à l'écran : un asset dont l'URL ne CHARGE plus (lien CloudFront
 * expiré, objet supprimé) affichait l'icône « image cassée » du navigateur · et
 * restait cliquable, donc on pouvait lancer une animation sur une image
 * fantôme. Ici l'échec de chargement fait basculer la vignette en repli
 * « aperçu indispo », non sélectionnable. L'état d'échec est tenu par le parent
 * (comme la sélection) · le composant reste pur, donc lisible en test dans ses
 * deux états sans avoir à simuler un chargement.
 */
export function VignetteDepart({ url, label, kind, selected, disabled, cassee, onError, onPick }: {
  url: string;
  label: string;
  kind: AssetKind;
  selected: boolean;
  disabled?: boolean;
  /** L'image n'a pas pu être chargée · la vignette montre son repli. */
  cassee: boolean;
  onError: () => void;
  onPick: (url: string) => void;
}) {
  const indispo = !!disabled || cassee;
  return (
    <button type="button" disabled={indispo} onClick={() => onPick(url)}
      title={cassee ? `${label} · aperçu indisponible` : label}
      style={{
        padding: 0, borderRadius: 10, flexShrink: 0, cursor: indispo ? 'default' : 'pointer',
        background: 'transparent', position: 'relative', opacity: cassee ? 0.55 : 1,
        border: `2px solid ${selected ? 'var(--accent-strong)' : 'var(--line-2)'}`,
      }}>
      {cassee ? (
        <span style={{
          width: 72, height: 92, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center', padding: 6, background: 'var(--paper)', color: 'var(--muted)', fontSize: 9, lineHeight: 1.3,
        }}>aperçu indispo</span>
      ) : (
        <img src={url} alt="" onError={onError} style={{ width: 72, height: 92, objectFit: 'cover', borderRadius: 8, display: 'block' }} />
      )}
      <span style={{ position: 'absolute', bottom: 4, left: 4, fontSize: 8.5, fontWeight: 800, padding: '2px 5px', borderRadius: 6, color: '#fff', background: 'rgba(0,0,0,.6)' }}>{KIND_LABEL[kind]}</span>
    </button>
  );
}
