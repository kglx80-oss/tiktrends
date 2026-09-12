'use client';

import {
  contredit, dureeAttendue, imageTimeoutMs, vignetteMoteur,
  type ImageModelSpec, type ConseilMoteur, type VignetteMoteur,
} from '@tiktrends/core';

/**
 * Le choix du moteur d'image · en grille de cartes, pas en liste de lignes.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 *
 * Une source d'inspiration a fixé le niveau : chaque modèle se présente avec un
 * exemple visuel, un nom, une description. Faute d'image d'exemple embarquable
 * (aucun réseau, aucune dépense depuis ici), l'exemple est un motif dessiné qui
 * INCARNE la force de la famille · packshot pour la fidélité produit, typographie
 * pour le texte net. La donnée de la vignette vient du noyau (`vignetteMoteur`),
 * ce fichier ne fait que la dessiner.
 *
 * ── Ce qu'il montre, et ce qu'il ne décide pas ────────────────────────────────
 *
 * Il montre, par carte : la vignette, le nom, le prix en crédits, la note du
 * catalogue, la durée attendue, et — quand la mesure de la marque a parlé — la
 * ligne mesurée et le fait que ce moteur tient le mieux la copie sur la marque. Il ne
 * décide rien : le moteur recommandé (selon le mode) et le conseil mesuré sont
 * calculés en amont, dans le noyau. Rendu et lu en test.
 */
export function SelecteurMoteur({ models, valeur, onChoisir, recommande, conseil, mesureActive }: {
  models: readonly ImageModelSpec[];
  /** La clé du moteur actuellement choisi. */
  valeur: string;
  onChoisir: (key: string) => void;
  /** Le moteur recommandé SELON LE MODE · marqué « recommandé ». */
  recommande: string;
  /** Les mesures locales de la marque · lignes par moteur et moteur désigné. */
  conseil: ConseilMoteur;
  /** Le mode fait-il jouer la mesure (mode entière) · pilote le bandeau. */
  mesureActive: boolean;
}) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {/* Quand la mesure désigne un autre moteur que le catalogue, on l'a RETENU
          par défaut et on le DIT · un défaut adossé à une mesure locale suit ce
          qu'on a prouvé. On laisse choisir quand même. */}
      {mesureActive && contredit(conseil, recommande) && (
        <p style={{ margin: '0 0 2px', padding: '8px 11px', borderRadius: 10, border: '1px solid rgba(126,232,191,.3)', background: 'var(--paper)', fontSize: 11.5, color: 'var(--ink-2)', lineHeight: 1.45 }}>
          <b style={{ color: '#7ee8bf' }}>On a retenu le moteur que ta mesure désigne, pas notre recommandation par défaut.</b>{' '}
          {conseil.resume}
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 10 }}>
        {models.map((m) => {
          const on = valeur === m.key;
          const v = vignetteMoteur(m.key);
          const estRecommande = recommande === m.key;
          const mesureLeDesigne = conseil.recommande === m.key;
          const ligne = conseil.lignes[m.key];
          return (
            <button
              key={m.key}
              type="button"
              aria-pressed={on}
              onClick={() => onChoisir(m.key)}
              style={{
                display: 'grid', gap: 0, padding: 0, textAlign: 'left', overflow: 'hidden',
                borderRadius: 14, cursor: 'pointer',
                border: `1.5px solid ${on ? 'var(--accent-strong)' : 'var(--line-2)'}`,
                background: on ? 'rgba(230,0,126,.05)' : 'var(--paper)',
                boxShadow: on ? '0 0 0 3px rgba(230,0,126,.12)' : 'none',
              }}
            >
              <VignetteVue v={v} recommande={estRecommande} mesureLeDesigne={mesureLeDesigne} />
              <span style={{ display: 'grid', gap: 3, padding: '9px 11px 11px' }}>
                <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--ink)' }}>{m.label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>{m.credits} cr. par pub</span>
                </span>
                <span style={{ fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.4 }}>
                  {m.note} · {dureeAttendue(1, imageTimeoutMs(m))} par image
                </span>
                {mesureLeDesigne && (
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: '#7ee8bf', lineHeight: 1.4 }}>
                    · tient le mieux ta copie ici
                  </span>
                )}
                {ligne && (
                  <span style={{
                    fontSize: 11.5, lineHeight: 1.4,
                    color: ligne.verdict === 'meilleur' ? '#7ee8bf' : ligne.verdict === 'pire' ? '#ff9db0' : 'var(--ink-2)',
                  }}>
                    {ligne.texte}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * La vignette dessinée · un exemple qui incarne la force de la famille.
 *
 * `data-motif` porte le motif · un test lit qu'une grille montre bien DEUX
 * exemples différents (produit et texte), pas la même carte répétée.
 */
function VignetteVue({ v, recommande, mesureLeDesigne }: {
  v: VignetteMoteur;
  recommande: boolean;
  mesureLeDesigne: boolean;
}) {
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
