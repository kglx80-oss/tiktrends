'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ANCRE_CONCLURE_LOT, cheminPorte, messageRaccourciFerme, raccourciFicheLot, raccourcisActifs, type GesteClavierLot } from '@tiktrends/core';
import { useSpatial } from '../../coquille/contexte';

/**
 * Lot 13 bis V5 · les raccourcis d'itération de la fiche d'un lot · C (aller à
 * « Conclure le lot ») et T (l'écran Itérer EXISTANT, la gagnante
 * présélectionnée). Les touches viennent de la TABLE (`RACCOURCIS`, portée
 * « fiche-lot ») par `raccourciFicheLot` · ce que chaque touche ouvre vient de
 * la règle du lot (`gestesClavierLot`), calculée par la page.
 *
 * Une NAVIGATION, rien d'autre · l'ancre de la conclusion (le focus y est posé,
 * la section est focalisable par programme) ou l'écran Itérer · aucune action
 * serveur appelée, aucun clic simulé. Fermé, le toast dit pourquoi. Jamais dans
 * un champ ni sous une fenêtre modale · coupé par `tt_raccourcis` (relu à
 * chaque frappe, comme la coquille). Ne dessine rien · l'aide « ? » liste ces
 * touches (même table).
 */

export interface PropsRaccourcisLot {
  conclure: GesteClavierLot;
  iterer: GesteClavierLot;
}

function lireCookies(): string {
  try { return document.cookie; } catch { return ''; }
}

export function RaccourcisLot(p: PropsRaccourcisLot) {
  const router = useRouter();
  const { toast } = useSpatial();
  // L'état courant, relu à chaque frappe sans réabonner l'écouteur.
  const etat = useRef({ p, toast, router });
  etat.current = { p, toast, router };

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      const r = raccourciFicheLot(
        { key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey, repetee: e.repeat, dejaTraitee: e.defaultPrevented },
        {
          actifs: raccourcisActifs(lireCookies()),
          modaleOuverte: !!document.querySelector('[aria-modal="true"]'),
          cible: t ? {
            tagName: t.tagName,
            editable: (t as HTMLElement).isContentEditable === true || !!t.closest('[contenteditable]:not([contenteditable="false"])'),
            role: t.getAttribute('role'),
            dansLecteur: !!t.closest('video, audio'),
          } : null,
        },
      );
      if (!r) return;
      e.preventDefault();
      const { p: g, toast: dire, router: nav } = etat.current;
      const geste = r.id === 'lot-conclure' ? g.conclure : g.iterer;
      if (!geste.href) { dire(messageRaccourciFerme(r, geste.raison ?? '')); return; }
      if (r.id === 'lot-conclure') {
        const section = document.getElementById(ANCRE_CONCLURE_LOT);
        if (!section) { dire(messageRaccourciFerme(r, 'la section n’est pas affichée sur cette fiche.')); return; }
        if (window.location.hash !== geste.href) window.location.hash = geste.href;
        section.scrollIntoView?.({ block: 'start' });
        section.focus({ preventScroll: true });
        return;
      }
      if (cheminPorte(geste.href)) nav.push(geste.href); else window.location.assign(geste.href);
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);
  return null;
}
