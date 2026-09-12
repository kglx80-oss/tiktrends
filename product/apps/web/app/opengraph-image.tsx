import { ImageResponse } from 'next/og';

/**
 * Image de partage (Open Graph / Twitter) générée · DA TikTrends, aucun asset
 * externe. Next l'applique automatiquement en og:image et twitter:image.
 */
export const alt = 'TikTrends · La créative devient une science';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: 84,
          background: '#120810',
          color: '#f6eef4',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: -220,
            left: 280,
            width: 760,
            height: 760,
            borderRadius: 760,
            background: 'radial-gradient(circle, rgba(254,44,85,0.55), rgba(254,44,85,0) 70%)',
            display: 'flex',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 44 }}>
          <div style={{ width: 46, height: 46, borderRadius: 13, background: 'linear-gradient(135deg,#fe2c55,#ff2d8f)', display: 'flex' }} />
          <div style={{ fontSize: 36, fontWeight: 700 }}>TikTrends</div>
        </div>
        <div style={{ display: 'flex', fontSize: 78, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, maxWidth: 940 }}>
          La créative devient une science
        </div>
        <div style={{ display: 'flex', fontSize: 31, color: '#cbbcc7', marginTop: 30, maxWidth: 860 }}>
          Génère, teste et fais gagner tes publicités statiques et vidéo. La donnée tranche.
        </div>
      </div>
    ),
    { ...size },
  );
}
