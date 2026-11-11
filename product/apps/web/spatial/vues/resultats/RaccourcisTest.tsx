'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { RACCOURCIS, cheminPorte, messageRaccourciFerme, raccourciFicheTest, raccourcisActifs, type GesteClavierLot, type Raccourci } from '@tiktrends/core';
import { useSpatial } from '../../coquille/contexte';
import { GesteClavier } from '../../communs/touches';

/**
 * Lot 13 ter V5 · les raccourcis de la fiche d'un TEST · T (l'écran Itérer
 * EXISTANT, ce test présélectionné) et L (la fiche de son lot). Les touches
 * viennent de la TABLE (`RACCOURCIS`, portée « fiche-test ») par
 * `raccourciFicheTest` · ce que chaque touche ouvre vient de la règle du test
 * (`gestesClavierTest`), calculée par la page.
 *
 * Une NAVIGATION, rien d'autre · aucune action serveur appelée, aucun clic
 * simulé (« Créer l'itération », qui écrit, reste un clic dans « La suite »).
 * Fermé, le toast et le texte à côté du bouton disent pourquoi. Jamais dans un
 * champ (l'arbitrage, l'itération ont des champs) ni sous une fenêtre modale ·
 * coupé par `tt_raccourcis` (relu à chaque frappe). Les deux gestes se voient,
 * chacun avec sa touche lue dans la table · le clic fait ce que fait la touche.
 */

export interface PropsRaccourcisTest {
  iterer: GesteClavierLot;
  lot: GesteClavierLot & { numero: number | null };
}

function lireCookies(): string {
  try { return document.cookie; } catch { return ''; }
}

const entree = (id: string) => RACCOURCIS.find((r) => r.id === id)!;

export function RaccourcisTest(p: PropsRaccourcisTest) {
  const router = useRouter();
  const { toast } = useSpatial();
  const etat = useRef({ p, toast, router });
  etat.current = { p, toast, router };

  /** Ce que fait le geste · la touche ET le clic. */
  const agir = useRef((r: Raccourci) => {
    const { p: g, toast: dire, router: nav } = etat.current;
    const geste = r.id === 'test-iterer' ? g.iterer : g.lot;
    if (!geste.href) { dire(messageRaccourciFerme(r, geste.raison ?? '')); return; }
    if (cheminPorte(geste.href)) nav.push(geste.href); else window.location.assign(geste.href);
  });

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      const r = raccourciFicheTest(
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
      agir.current(r);
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);

  return (
    <section className="tile" aria-label="Itérer depuis ce test" data-raccourcis-test="" style={{ marginTop: 16, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <GesteClavier raccourci="test-iterer" libelle="Itérer depuis ce test" icone="loop" geste={p.iterer} onActiver={() => agir.current(entree('test-iterer'))} />
      <GesteClavier raccourci="test-lot" libelle={p.lot.numero !== null ? `Voir son lot · #${p.lot.numero}` : 'Voir son lot'} icone="arrow" geste={p.lot} onActiver={() => agir.current(entree('test-lot'))} />
    </section>
  );
}
