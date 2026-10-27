import type { ReactNode } from 'react';
import { Ic, Lien, SousNav } from '../../communs';

/**
 * Les briques SANS état de la rubrique Veille (serveur ou client) · balisage de
 * la maquette à l'identique (`docs/spatial/reference/veille.html` et suivants).
 */

/**
 * Les sous-sections de la Veille · ordre de la maquette. « Formats » et
 * « Tendances » sont portés par un autre chantier · les liens y pointent déjà
 * (`Lien` recharge la page tant que l'écran n'est pas porté).
 *
 * La pastille de Radar dit la VRAIE condition d'accès (l'offre qui l'ouvre),
 * seulement quand le Radar est fermé à cet espace · la maquette écrit « PRO »,
 * mais aucune offre ne s'appelle ainsi.
 */
export function sousNavVeille(pastilleRadar: string | null): ReadonlyArray<{ href: string; libelle: ReactNode }> {
  return [
    { href: '/veille', libelle: 'Pubs du moment' },
    { href: '/veille/concurrents', libelle: 'Concurrents' },
    { href: '/veille/formats', libelle: 'Formats' },
    { href: '/veille/tendances', libelle: 'Tendances' },
    { href: '/saved', libelle: 'Sauvegardes' },
    { href: '/veille/scale', libelle: 'Ce qui scale' },
    { href: '/radar', libelle: pastilleRadar ? <>Radar<span style={{ marginLeft: '6px', padding: '1px 6px', borderRadius: '6px', font: '700 9px/1.5 var(--sf)', letterSpacing: '.06em', background: 'linear-gradient(135deg,#ffd48a,#ff9f6e)', color: '#2a1a00', verticalAlign: '1px' }}>{pastilleRadar}</span></> : 'Radar' },
  ];
}

export function SousNavVeille({ actif, pastilleRadar }: { actif: string; pastilleRadar: string | null }) {
  return <SousNav items={sousNavVeille(pastilleRadar)} actif={actif} />;
}

/** L'état vide de la maquette (`div.dempty`) · une sortie réelle, ou aucune. */
export function EtatVide({ icone = 'search', titre, texte, action }: { icone?: string; titre: string; texte: ReactNode; action?: { href: string; libelle: string } | null }) {
  return (
    <div className="dempty">
      <span className="ico"><Ic n={icone} s={false} /></span>
      <h3>{titre}</h3>
      <p className="muted">{texte}</p>
      {action && <Lien className="btn" href={action.href}>{action.libelle}</Lien>}
    </div>
  );
}

/**
 * La vignette d'une créa (`div.ad` de la maquette) · la maquette y COMPOSE une
 * fausse pub (photo + bandeau de texte) ; ici, l'image RÉELLE de l'annonce,
 * sans texte ajouté par-dessus. Sans image, la vignette reste vide.
 */
export function Vignette({ image, classe = '' }: { image: string | null; classe?: string }) {
  return (
    <div className={`ad ${classe}`.trim()}>
      <div className="ph">{image && <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" />}</div>
    </div>
  );
}
