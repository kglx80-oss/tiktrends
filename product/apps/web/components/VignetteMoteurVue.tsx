import { vignetteMoteur } from '@tiktrends/core';

/**
 * La vignette d'un moteur, dessinée · un exemple qui incarne la force de la
 * famille. Partagée par les studios (Pubs IA, Image) pour que « choisir un
 * modèle » se présente pareil partout · packshot pour la fidélité produit,
 * typographie pour le texte net.
 *
 * `data-motif` porte le motif · un test lit qu'une grille montre bien DEUX
 * exemples différents (produit et texte), pas la même carte répétée. La donnée
 * (dégradé, motif, force) vient du noyau (`vignetteMoteur`) · ici on ne fait que
 * la dessiner.
 */
export function VignetteMoteurVue({ moteurKey, recommande = false, mesureLeDesigne = false }: {
  moteurKey: string;
  recommande?: boolean;
  /** La mesure locale désigne ce moteur · badge « ta mesure » (studio Pubs IA). */
  mesureLeDesigne?: boolean;
}) {
  const v = vignetteMoteur(moteurKey);
  const gradId = `grad-moteur-${v.famille}`;
  return (
    <span style={{ position: 'relative', display: 'block', width: '100%' }}>
      <svg viewBox="0 0 160 90" width="100%" height="auto" role="img" data-motif={v.motif} style={{ display: 'block' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={v.degrade[0]} />
            <stop offset="100%" stopColor={v.degrade[1]} />
          </linearGradient>
        </defs>
        <rect width="160" height="90" fill={`url(#${gradId})`} />
        {v.motif === 'texte' ? (
          <>
            {/* Typographie nette · un « Aa » franc, quelques lignes de base propres. */}
            <text x="16" y="58" fontSize="42" fontWeight="800" fill="#ffffff" fontFamily="Georgia, 'Times New Roman', serif">Aa</text>
            <rect x="78" y="34" width="66" height="5" rx="2.5" fill="rgba(255,255,255,.85)" />
            <rect x="78" y="46" width="52" height="5" rx="2.5" fill="rgba(255,255,255,.6)" />
            <rect x="78" y="58" width="60" height="5" rx="2.5" fill="rgba(255,255,255,.4)" />
          </>
        ) : (
          <>
            {/* Packshot · un flacon centré, bouchon et étiquette dans l'axe, ombre
                au sol · la fidélité produit, montrée. */}
            <ellipse cx="80" cy="77" rx="30" ry="5.5" fill="rgba(0,0,0,.28)" />
            <rect x="74" y="12" width="12" height="10" rx="3" fill="rgba(255,255,255,.85)" />
            <rect x="62" y="21" width="36" height="52" rx="11" fill="rgba(255,255,255,.94)" />
            <rect x="69" y="35" width="22" height="24" rx="4" fill="rgba(0,0,0,.12)" />
          </>
        )}
      </svg>
      {/* La force, posée sur l'exemple · un exemple NOMMÉ, comme dans l'inspiration. */}
      <span style={{
        position: 'absolute', left: 8, bottom: 8,
        padding: '3px 8px', borderRadius: 999,
        background: 'rgba(0,0,0,.42)', color: '#fff', fontSize: 10.5, fontWeight: 700,
        backdropFilter: 'blur(2px)',
      }}>{v.force}</span>
      {recommande && (
        <span style={{
          position: 'absolute', right: 8, top: 8,
          padding: '3px 8px', borderRadius: 999,
          background: 'var(--grad-accent, #e6007e)', color: 'var(--on-accent, #fff)', fontSize: 10, fontWeight: 800, letterSpacing: '.02em',
        }}>recommandé</span>
      )}
      {mesureLeDesigne && !recommande && (
        <span style={{
          position: 'absolute', right: 8, top: 8,
          padding: '3px 8px', borderRadius: 999,
          background: 'rgba(126,232,191,.9)', color: '#08301f', fontSize: 10, fontWeight: 800,
        }}>ta mesure</span>
      )}
    </span>
  );
}
