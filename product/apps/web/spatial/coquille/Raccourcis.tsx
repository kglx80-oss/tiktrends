'use client';

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ClavierReact } from 'react';
import { annoncePreferenceRaccourcis, groupesAideRaccourcis, raccourcisActifs, raccourcisCookieString } from '@tiktrends/core';
import { Ic } from '../communs/base';
import { useSpatial } from './contexte';

/**
 * Lot 13 V5 · l'aide des raccourcis clavier et la préférence qui les coupe.
 *
 *  · `AideRaccourcis` · la fenêtre ouverte par « ? » (hors saisie) ou par le
 *    bouton « Raccourcis clavier » du rail · la liste vient de la MÊME table
 *    que l'écouteur de la coquille (`groupesAideRaccourcis`, noyau), groupée
 *    par portée. Fenêtre modale (`aria-modal`, le reste de la coquille est
 *    `inert`), focus posé dans la fenêtre à l'ouverture et gardé dedans (Tab,
 *    Maj Tab), Échap ferme (écouteur de la coquille) et rend le focus à ce qui
 *    l'a ouverte. Classes de la maquette (`.paywrap > .paybox.glass`, comme
 *    les autres fenêtres Spatial).
 *  · `ChoixRaccourcis` · l'interrupteur « Raccourcis à une touche »
 *    (WCAG 2.1.4) · cookie d'ergonomie `tt_raccourcis`, relu à CHAQUE frappe
 *    par la coquille (et par le « / » de Ce qui scale) · le changement vaut
 *    tout de suite, sans rechargement. Dans l'aide et dans « Mon profil ».
 *  · `BoutonAideRaccourcis` · ouvre l'aide depuis une vue (Support, Mon profil).
 */

/** L'évènement qui fait suivre un changement de préférence aux autres interrupteurs à l'écran. */
const EVENEMENT_PREFERENCE = 'tt-raccourcis';

const STYLE_TOUCHE = {
  display: 'inline-block', minWidth: 26, padding: '2px 8px', borderRadius: 7, border: '1px solid var(--edge)',
  font: 'inherit', fontSize: 12.5, lineHeight: '18px', textAlign: 'center',
} as const;

function lirePreference(): boolean {
  try { return raccourcisActifs(document.cookie); } catch { return true; }
}

export function ChoixRaccourcis({ initiale }: { initiale?: boolean } = {}) {
  const id = useId();
  const [actifs, setActifs] = useState<boolean>(() => initiale ?? (typeof document === 'undefined' ? true : lirePreference()));
  const [annonce, setAnnonce] = useState('');
  useEffect(() => {
    const suivre = () => setActifs(lirePreference());
    suivre();
    window.addEventListener(EVENEMENT_PREFERENCE, suivre);
    return () => window.removeEventListener(EVENEMENT_PREFERENCE, suivre);
  }, []);
  const basculer = () => {
    const v = !actifs;
    try { document.cookie = raccourcisCookieString(v); } catch { /* cookie indisponible · l'état suit quand même */ }
    setActifs(v);
    setAnnonce(annoncePreferenceRaccourcis(v));
    window.dispatchEvent(new Event(EVENEMENT_PREFERENCE));
  };
  return (
    <div data-zone="choix-raccourcis" style={{ display: 'grid', gap: 4 }}>
      <div className="member" style={{ minHeight: 44 }}>
        <div style={{ display: 'grid', gap: 2 }}>
          <strong id={`${id}-l`}>Raccourcis à une touche</strong>
          <small className="faint" id={`${id}-d`} style={{ fontSize: 12.5 }}>
            {actifs ? 'Actifs hors des champs de saisie · gardé sur ce navigateur' : 'Coupés · la recherche (Ctrl K ou ⌘ K) et Échap restent actifs'}
          </small>
        </div>
        <button className="sw2" type="button" role="switch" aria-checked={actifs} aria-labelledby={`${id}-l`} aria-describedby={`${id}-d`}
          data-preference-raccourcis="" onClick={basculer} style={{ marginLeft: 'auto' }} />
      </div>
      <span className="sr" role="status" aria-live="polite">{annonce}</span>
    </div>
  );
}

/** Ouvre l'aide depuis une vue · la coquille garde le bouton pour lui rendre le focus. */
export function BoutonAideRaccourcis({ libelle = 'Raccourcis clavier' }: { libelle?: string }) {
  const { basculer, panneau } = useSpatial();
  return (
    <button className="btn sm" type="button" data-ouvrir-raccourcis="" aria-haspopup="dialog" aria-expanded={panneau === 'raccourcis'}
      onClick={() => basculer('raccourcis')} style={{ minHeight: 44 }}>
      <Ic n="q" />{libelle}
    </button>
  );
}

const FOCALISABLES = 'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function AideRaccourcis({ onFermer, mac = false }: { onFermer: () => void; mac?: boolean }) {
  const boite = useRef<HTMLDivElement>(null);
  const groupes = useMemo(() => groupesAideRaccourcis(undefined, mac), [mac]);
  // Le focus entre dans la fenêtre à l'ouverture (titre annoncé par `aria-labelledby`).
  useEffect(() => { boite.current?.focus(); }, []);
  // Tab et Maj Tab tournent dans la fenêtre · le reste de la coquille est `inert`, ceci couvre les navigateurs sans `inert`.
  const garder = (e: ClavierReact<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const f = [...(boite.current?.querySelectorAll<HTMLElement>(FOCALISABLES) ?? [])];
    if (!f.length) { e.preventDefault(); return; }
    const premier = f[0]!; const dernier = f[f.length - 1]!;
    const ici = document.activeElement;
    if (e.shiftKey && (ici === premier || ici === boite.current)) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && ici === dernier) { e.preventDefault(); premier.focus(); }
  };
  return (
    <div className="paywrap" data-aide-raccourcis="" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }} style={{ overscrollBehavior: 'contain' }}>
      <div ref={boite} className="paybox glass" id="raccourcis" role="dialog" aria-modal="true" aria-labelledby="raccourcis-titre" tabIndex={-1} onKeyDown={garder}
        style={{ width: 'min(640px,100%)', maxHeight: 'min(86vh,820px)', overflowY: 'auto', outline: 'none' }}>
        <div className="sech" style={{ margin: 0 }}>
          <h2 id="raccourcis-titre">Raccourcis clavier</h2>
          <button className="btn sm" type="button" data-fermer-raccourcis="" onClick={onFermer} style={{ marginLeft: 'auto', minHeight: 44 }}><Ic n="x" />Fermer</button>
        </div>
        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Jamais pendant que tu écris dans un champ, ni sur un lecteur vidéo. « G » puis une lettre · tape les deux touches l’une après l’autre.
        </p>
        <ChoixRaccourcis />
        {groupes.map((g) => (
          <section key={g.portee} data-portee={g.portee} aria-labelledby={`raccourcis-${g.portee}`} style={{ display: 'grid', gap: 6 }}>
            <h3 id={`raccourcis-${g.portee}`} className="lbl" style={{ margin: '6px 0 0' }}>{g.libelle}</h3>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
              {g.lignes.map((l) => (
                <li key={l.id} data-raccourci={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: 32, flexWrap: 'wrap' }}>
                  <span style={{ flex: '1 1 200px' }}>{l.libelle}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} data-touches="">
                    {l.sequences.map((s, i) => (
                      <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {i > 0 && <span className="faint" style={{ fontSize: 12 }}>ou</span>}
                        {s.map((accord, j) => (
                          <span key={j} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            {j > 0 && <span className="faint" style={{ fontSize: 12 }}>puis</span>}
                            {accord.map((t, k) => <kbd key={k} style={STYLE_TOUCHE}>{t}</kbd>)}
                          </span>
                        ))}
                      </span>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
