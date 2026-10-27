/**
 * Les logos d'application de la maquette (`appLogo`) · Google Drive et Dropbox,
 * tracés tels quels (couleurs de marque des éditeurs, pas de l'interface).
 */
export function LogoApp({ app, taille, interieur }: { app: 'gdrive' | 'dropbox'; taille: number; interieur: number }) {
  return (
    <span className="applogo" style={{ width: taille, height: taille }}>
      <span style={{ width: interieur, height: interieur, display: 'block' }}>
        {app === 'gdrive' ? (
          <svg viewBox="0 0 87.3 78" aria-hidden="true">
            <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da" />
            <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47" />
            <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335" />
            <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d" />
            <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc" />
            <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00" />
          </svg>
        ) : (
          <svg viewBox="0 0 43 40" aria-hidden="true">
            <path fill="#0061FF" d="M12.6 0 0 8.1l8.7 7 12.7-7.9L12.6 0zM0 22.1l12.6 8.1 8.8-7.2-12.7-7.9L0 22.1zm21.4.9 8.8 7.2 12.6-8.1-8.7-7-12.7 7.9zm21.4-14.9L30.2 0l-8.8 7.2 12.7 7.9 8.7-7zM21.5 24.6l-8.9 7.2-3.8-2.5v2.8l12.7 7.6 12.7-7.6v-2.8l-3.8 2.5-8.9-7.2z" />
          </svg>
        )}
      </span>
    </span>
  );
}

/** Icône et teinte d'un type de fichier (maquette `DK`) · décor du type, pas une donnée. */
export const ICONE_TYPE: Record<string, { icone: string; libelle: string; couleur: string }> = {
  image: { icone: 'img', libelle: 'IMG', couleur: '#60a5fa' },
  video: { icone: 'img', libelle: 'VIDÉO', couleur: '#f472b6' },
  audio: { icone: 'spark', libelle: 'AUDIO', couleur: '#34d399' },
  pdf: { icone: 'text', libelle: 'PDF', couleur: '#ff6b6b' },
  svg: { icone: 'tag', libelle: 'SVG', couleur: '#fbbf24' },
  autre: { icone: 'text', libelle: 'FICHIER', couleur: '#94a3b8' },
};
