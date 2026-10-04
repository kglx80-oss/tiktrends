'use client';

import { createContext, useCallback, useContext, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ONGLETS_SAUVEGARDES, defOnglet, ongletVoisin, cibleSelonPointeur, compteurApresRetraits, type OngletSauvegardes } from '@tiktrends/core';
import { useIsMobile } from './useIsMobile';
import { Icon } from './Icon';

/**
 * Sauvegardes · une page, trois espaces clairs · Créations (l'usage principal),
 * Marques suivies, Nouveautés. Avant, les créas gardées arrivaient après des
 * blocs de découverte et d'analyse · on remet l'usage principal au premier plan,
 * un espace à la fois, et la découverte passe en secondaire dans « Nouveautés ».
 *
 * L'onglet actif s'écrit dans l'URL (`?onglet=`) · rouvrir la page ou revenir
 * d'un détail retombe sur le même espace, sans perdre sa place.
 */

export type Compteurs = Partial<Record<OngletSauvegardes, number>>;

/**
 * Lot 16 · les retraits faits DANS un onglet (concurrent retiré, nouveautés
 * marquées vues) se reportent tout de suite sur son compteur · le compteur vient
 * du rendu serveur, qui n'arrivait pas 4 fois sur 12 (`router.refresh()` calé,
 * mesuré). Un panneau signale combien d'éléments il a retirés que le serveur
 * montre ENCORE · le compteur les soustrait (`compteurApresRetraits`, noyau).
 */
const RetraitsOnglet = createContext<(cle: OngletSauvegardes, retiresEncoreServis: number) => void>(() => {});
export const useRetraitsOnglet = () => useContext(RetraitsOnglet);

/**
 * La barre d'onglets · sans routeur, pour être rendue et vérifiée en test.
 * Motif ARIA « tabs » · un seul arrêt Tab (l'onglet actif), ← → Début Fin
 * passent d'un onglet à l'autre (`ongletVoisin`) · 44 px au doigt, densité
 * gardée à la souris (`cibleSelonPointeur`).
 */
export function BarreOnglets({ actif, onChange, compteurs }: {
  actif: OngletSauvegardes; onChange: (cle: OngletSauvegardes) => void; compteurs: Compteurs;
}) {
  const tactile = useIsMobile('(pointer: coarse), (max-width: 768px)');
  const cles = ONGLETS_SAUVEGARDES.map((o) => o.cle);
  const surTouche = (e: KeyboardEvent<HTMLDivElement>) => {
    const suivant = ongletVoisin(cles, actif, e.key);
    if (!suivant) return;
    e.preventDefault();
    onChange(suivant);
    document.getElementById(`onglet-${suivant}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="Espaces des sauvegardes" onKeyDown={surTouche} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
      {ONGLETS_SAUVEGARDES.map((o) => {
        const on = o.cle === actif;
        const n = compteurs[o.cle];
        return (
          <button key={o.cle} type="button" role="tab" id={`onglet-${o.cle}`} aria-controls={`panneau-${o.cle}`} aria-selected={on}
            tabIndex={on ? 0 : -1} onClick={() => onChange(o.cle)} style={{ ...ongletBtn(on), minHeight: Math.max(40, cibleSelonPointeur(tactile)) }}>
            <span aria-hidden style={{ display: 'inline-flex' }}><Icon name={o.icone} size={15} /></span>
            <span>{o.label}</span>
            {typeof n === 'number' && (
              <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: on ? 'rgba(255,255,255,.22)' : 'var(--paper)', color: on ? 'var(--on-accent)' : 'var(--muted)' }}>{n}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SavedTabs({ initial, compteurs, creations, marques, nouveautes, explorer }: {
  initial: OngletSauvegardes;
  compteurs: Compteurs;
  creations: ReactNode;
  marques: ReactNode;
  nouveautes: ReactNode;
  /** Découverte et analyse de catégorie · secondaire, sous les Nouveautés. */
  explorer?: ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const pathname = usePathname();
  const [actif, setActif] = useState<OngletSauvegardes>(initial);
  const [retraits, setRetraits] = useState<Partial<Record<OngletSauvegardes, number>>>({});
  const signalerRetraits = useCallback((cle: OngletSauvegardes, n: number) => {
    setRetraits((r) => ((r[cle] ?? 0) === n ? r : { ...r, [cle]: n }));
  }, []);
  const affiches: Compteurs = Object.fromEntries(
    Object.entries(compteurs).map(([cle, n]) => [cle, typeof n === 'number' ? compteurApresRetraits(n, retraits[cle as OngletSauvegardes] ?? 0) : n]),
  );

  const change = (cle: OngletSauvegardes) => {
    setActif(cle);
    // On écrit l'onglet dans l'URL sans refaire défiler la page · le retour d'un
    // détail rouvre alors le même espace.
    const p = new URLSearchParams(params?.toString() ?? '');
    p.set('onglet', cle);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const def = defOnglet(actif);
  return (
    <RetraitsOnglet.Provider value={signalerRetraits}>
      <BarreOnglets actif={actif} onChange={change} compteurs={affiches} />
      <p style={{ margin: '0 0 20px', fontSize: 12.5, color: 'var(--muted)' }}>{def.description}</p>
      <div role="tabpanel" id={`panneau-${actif}`} aria-labelledby={`onglet-${actif}`}>
        {actif === 'creations' && creations}
        {actif === 'marques' && marques}
        {actif === 'nouveautes' && (
          <>
            {nouveautes}
            {explorer && (
              <section style={{ marginTop: 34, paddingTop: 24, borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>Explorer ta catégorie</h2>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>secondaire · pour nourrir tes prochaines créas</span>
                </div>
                {explorer}
              </section>
            )}
          </>
        )}
      </div>
    </RetraitsOnglet.Provider>
  );
}

function ongletBtn(on: boolean): CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 40, padding: '8px 15px', borderRadius: 999,
    fontSize: 13, fontWeight: on ? 800 : 700, cursor: 'pointer', whiteSpace: 'nowrap',
    border: '1px solid ' + (on ? 'transparent' : 'var(--line-2)'),
    background: on ? 'var(--grad-accent)' : 'var(--surface)',
    color: on ? 'var(--on-accent)' : 'var(--ink-2)',
  };
}
