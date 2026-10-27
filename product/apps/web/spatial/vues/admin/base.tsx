import type { ReactNode } from 'react';
import { EnTete, Ic, Lien, SousNav } from '../../communs';
import { SOUS_NAV_ADMIN } from './sous-nav';

/**
 * Les briques du Tour de contrôle (sans état · serveur ou client). Balisage de
 * la maquette (`docs/spatial/reference/a-*.html`) à l'identique · le CSS de la
 * maquette fait le reste.
 */

/** Le bandeau `.astrip` · chiffres RÉELS lus par la page. */
export interface BandeauAdmin { payants: number; actualise: string }

export const texteBandeau = (b: BandeauAdmin) =>
  `Données de toute la plateforme · ${b.payants.toLocaleString('fr-FR')} compte${b.payants > 1 ? 's' : ''} payant${b.payants > 1 ? 's' : ''} · actualisé ${b.actualise}`;

/** En-tête + bandeau Admin+ + sous-navigation · la tête commune des douze écrans. */
export function TeteAdmin({ titre, sous, actif, bandeau }: { titre: string; sous: string; actif: string; bandeau: BandeauAdmin }) {
  return (
    <>
      <EnTete titre={titre} sous={`Tour de contrôle · ${sous}`} />
      <div className="astrip"><Ic n="shield" /><b>Admin+</b><span>{texteBandeau(bandeau)}</span><Lien href="/dashboard" className="astrip-b"><Ic n="back" />Retour à l’outil</Lien></div>
      <SousNav items={SOUS_NAV_ADMIN} actif={actif} />
    </>
  );
}

export type ClasseAkd = '' | 'up' | 'dn' | 'w';

/** Un indicateur (`div.tile.akpi`). */
export interface KpiAdmin { lbl: string; v: ReactNode; d?: ReactNode; c?: ClasseAkd; s?: ReactNode }

export function Kpi({ lbl, v, d, c = '', s }: KpiAdmin) {
  return (
    <div className="tile akpi"><span className="lbl">{lbl}</span><b>{v}</b>{d != null && <span className={`akd ${c}`}>{d}</span>}{s != null && <small>{s}</small>}</div>
  );
}

export function Kpis({ items }: { items: readonly KpiAdmin[] }) {
  return <div className="akpis">{items.map((k) => <Kpi key={k.lbl} {...k} />)}</div>;
}

export type ClassePill = '' | 'g' | 'w' | 'r' | 'c';
export const Pill = ({ c = '', children }: { c?: ClassePill; children: ReactNode }) => <span className={`pill ${c}`}>{children}</span>;

/** La barre de marge (`i.amar > b`), largeur en pourcents bornée à 0-100. */
export function Barre({ part, over = false, style }: { part: number; over?: boolean; style?: React.CSSProperties }) {
  return <i className={over ? 'amar over' : 'amar'} style={style}><b style={{ width: `${Math.max(0, Math.min(100, part))}%` }} /></i>;
}

/** L'état vide d'une tuile · une phrase qui dit pourquoi il n'y a rien. */
export const Vide = ({ children }: { children: ReactNode }) => <p className="faint" style={{ fontSize: '12.5px', margin: '6px 0 0', gridColumn: '1 / -1' }}>{children}</p>;
