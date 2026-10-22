'use client';

import { useEffect, useRef, useState } from 'react';
import { lireDepartAssistant, listerDepartsAssistant, type ChoixDepartAssistant, type DepartAssistant, type OrigineDepartAssistant } from '../../../app/actions/studios/departs-assistant';
import css from './AssistantProjet.module.css';

/** Panneau interne du wizard. Sélection = lecture ; le parent garde le geste de création. */
export function DepartDepuisSource({ origine, onChoisir, onFermer }: {
  origine: OrigineDepartAssistant;
  onChoisir: (depart: DepartAssistant) => void;
  onFermer: () => void;
}) {
  const panneau = useRef<HTMLElement>(null);
  const sequence = useRef(0);
  const [choix, setChoix] = useState<ChoixDepartAssistant[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  useEffect(() => {
    let ignore = false;
    sequence.current += 1;
    const precedent = document.activeElement as HTMLElement | null;
    panneau.current?.querySelector<HTMLElement>('button')?.focus();
    setChoix(null); setErreur(null); setOccupe(null);
    void listerDepartsAssistant(origine).then((r) => {
      if (ignore) return;
      if (r.ok) setChoix(r.choix); else setErreur(r.message);
    }).catch(() => { if (!ignore) setErreur('La liste n’a pas pu être lue. Fermez puis rouvrez ce panneau.'); });
    return () => { ignore = true; sequence.current += 1; precedent?.focus(); };
  }, [origine]);

  async function choisir(id: string) {
    if (occupe) return;
    const demande = sequence.current;
    setOccupe(id); setErreur(null);
    try {
      const r = await lireDepartAssistant(origine, id);
      if (demande !== sequence.current) return;
      if (r.ok) onChoisir(r.depart); else setErreur(r.message);
    } catch { if (demande === sequence.current) setErreur('Ce point de départ n’a pas pu être relu. Aucun projet n’a été créé.'); }
    finally { if (demande === sequence.current) setOccupe(null); }
  }
  const titre = origine === 'veille' ? 'Références depuis la Veille' : 'Itérer sur un test';
  return <>
    <div className={css.wzscrim} aria-hidden />
    <section ref={panneau} onKeyDown={(e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onFermer(); }
      if (e.key !== 'Tab') return;
      const boutons = [...(panneau.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])];
      const premier = boutons[0]; const dernier = boutons[boutons.length - 1];
      if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier?.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier?.focus(); }
    }} className={css.wzpanel} role="dialog" aria-modal="true" aria-label={titre}>
      <header className={css.wzpanelhead}><h3>{titre}</h3><button type="button" onClick={onFermer} aria-label="Fermer le panneau">×</button></header>
      <div className={css.wzpanelbody}>
        <p className={css.note}>{origine === 'veille' ? 'Sauvegardes accessibles de la marque active. La source reste attachée au projet ; aucun média concurrent n’est copié.' : 'Tests gagnants arbitrés avec apprentissages. Le verdict sera revérifié à la sélection.'}</p>
        {erreur && <p role="alert">{erreur}</p>}
        {choix === null && !erreur && <p role="status">Lecture…</p>}
        {choix?.length === 0 && <p role="status">{origine === 'veille' ? 'Aucune sauvegarde accessible pour cette marque.' : 'Aucun test éligible avec apprentissage pour cette marque.'}</p>}
        <div className={`${css.wtiles} ${css.section}`}>
          {choix?.map((c) => <button type="button" key={c.id} className={css.wtile} disabled={!!occupe} onClick={() => void choisir(c.id)} data-depart-id={c.id}>
            {c.apercu && <img src={c.apercu} alt="" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 10 }} />}
            <strong>{c.titre}</strong><small>{c.detail}</small>{occupe === c.id && <small>Vérification…</small>}
          </button>)}
        </div>
      </div>
      <footer><button type="button" onClick={onFermer}>Annuler</button></footer>
    </section>
  </>;
}
