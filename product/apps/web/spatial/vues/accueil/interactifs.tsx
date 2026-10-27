'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  PERIODES_REPORTING, cheminPorte, lienPeriodeReporting, lienQuestionJarvis,
  type CarteConfiguration, type PeriodeReporting,
} from '@tiktrends/core';
import { Anneau, Ic, Lien } from '../../communs';

/**
 * Les blocs INTERACTIFS de l'Accueil Spatial · balisage de la maquette
 * (`docs/spatial/reference/accueil.html`) à l'identique. Aucun n'appelle de
 * modèle, aucun ne dépense · ils naviguent (Jarvis, période) ou déplient.
 * Module client · il n'exporte que des composants (garde `spatial-fondation`).
 */

/** Navigue comme la coquille · client dans l'arbre Spatial, rechargement sinon. */
function useAller() {
  const router = useRouter();
  return (href: string) => {
    if (cheminPorte(href.split(/[?#]/)[0]!)) router.push(href, { scroll: false });
    else window.location.assign(href);
  };
}

/**
 * « Ta question à Jarvis… » · ouvre la VRAIE conversation (`/jarvis?q=…`),
 * question préremplie. Rien n'est envoyé ni généré ici · l'envoi (et son coût,
 * annoncé là-bas) reste un clic sur l'écran Jarvis. Sans JavaScript, le
 * formulaire fait la même chose (GET `/jarvis?q=`).
 */
export function BarreJarvis({ titre, sources, pastilles }: { titre: string; sources: readonly string[]; pastilles: ReadonlyArray<{ libelle: string; question: string }> }) {
  const aller = useAller();
  const champ = useRef<HTMLInputElement>(null);
  return (
    <div className="jhero jhome">
      <span className="orb">J</span>
      <h2>{titre}</h2>
      <form
        className="composer" id="jhome" autoComplete="off" action="/jarvis" method="get"
        onSubmit={(e) => {
          e.preventDefault();
          const v = champ.current?.value.trim() ?? '';
          if (v) aller(lienQuestionJarvis(v)); else champ.current?.focus();
        }}
      >
        <input id="jhin" name="q" ref={champ} placeholder="Ta question à Jarvis…" aria-label="Ta question à Jarvis" maxLength={4000} />
        <button className="btn pri sm" type="submit" aria-label="Préparer la question dans Jarvis"><Ic n="arrow" /></button>
      </form>
      <div className="cats">
        {sources.map((s) => <span className="pill c" key={s}>{s}</span>)}
        {pastilles.map((p) => (
          <button type="button" className="chip" key={p.libelle} data-ask={p.question} title="Ouvre Jarvis avec cette question, sans l’envoyer" onClick={() => aller(lienQuestionJarvis(p.question))}>{p.libelle}</button>
        ))}
      </div>
    </div>
  );
}

/** « Configure TikTrends » · les étapes RÉELLES du parcours, repliées sur les trois prochaines. */
export function CarteConfigurationAccueil({ carte, questionnaire, fiche }: { carte: CarteConfiguration; questionnaire: string; fiche: string | null }) {
  const [ouvert, setOuvert] = useState(false);
  const liste = ouvert ? carte.etapes : carte.prochaines;
  return (
    <section className="tile cfgc ">
      <div className="cfgh">
        <Anneau part={carte.part} taille={64} libelle={`${carte.fait}/${carte.total}`} classe="g" />
        <div style={{ flex: 1, minWidth: 220 }}>
          <span className="ob3k" style={{ marginBottom: 4 }}>Configuration · {carte.part} %</span>
          <h2>{carte.titre}</h2>
          <p>Jarvis n’invente rien : plus la configuration est complète, plus ses propositions sont justes.</p>
        </div>
        <div className="kc">
          <Lien className="btn sm" href={questionnaire}><Ic n="spark" />Questionnaire</Lien>
          {fiche && <Lien className="btn sm" href={fiche}>Fiche marque</Lien>}
        </div>
      </div>
      <div className="cfgl">
        {liste.map((e) => (
          <div className={`cfgi ${e.fait ? 'ok' : ''}`} key={e.cle}>
            <span className="cfgb">{e.fait && <Ic n="check" />}</span>
            <div><strong>{e.libelle}</strong>{!e.fait && e.detail && <small>{e.detail}</small>}</div>
            {e.action && <Lien className={`btn sm ${e.action.primaire ? 'pri' : ''}`} href={e.action.href}>{e.action.libelle}</Lien>}
          </div>
        ))}
      </div>
      <button type="button" className="cfgm" aria-expanded={ouvert} onClick={() => setOuvert((o) => !o)}>
        {ouvert ? 'Masquer les étapes terminées' : `Voir les ${carte.etapes.length} étapes${carte.etapes.length !== carte.total ? ` · ${carte.total} requises` : ''}`}
      </button>
    </section>
  );
}

/**
 * Le choix de période du reporting · 7 / 14 / 30 / 90 jours, ce mois-ci, ou une
 * plage personnalisée. Chaque choix recharge la page avec ses paramètres · les
 * chiffres sont relus côté serveur, jamais recalculés ici.
 */
export function ChoixPeriode({ periode, rapides }: { periode: PeriodeReporting; rapides: ReadonlyArray<{ libelle: string; du: string; au: string }> }) {
  const aller = useAller();
  const [pop, setPop] = useState(false);
  const [du, setDu] = useState(periode.debut);
  const [au, setAu] = useState(periode.fin);
  const [erreur, setErreur] = useState<string | null>(null);
  const appliquer = (a: string, b: string) => {
    if (!a || !b) { setErreur('Choisis les deux dates.'); return; }
    setPop(false); setErreur(null);
    aller(lienPeriodeReporting({ du: a, au: b }));
  };
  return (
    <div className="dperw">
      <div className="seg" role="group" aria-label="Période">
        {PERIODES_REPORTING.map((p) => (
          <button type="button" key={p.cle} data-dper={p.cle} aria-pressed={periode.cle === p.cle} onClick={() => aller(lienPeriodeReporting(p.cle))}>{p.libelle}</button>
        ))}
        <button type="button" data-dcustom="1" aria-pressed={periode.cle === 'perso'} aria-expanded={pop} onClick={() => setPop((o) => !o)}><Ic n="cal" />{periode.libellePerso}</button>
      </div>
      {pop && (
        <div className="dpop glass" role="dialog" aria-label="Période personnalisée">
          <div className="dpq">
            {rapides.map((r) => <button type="button" className="chip" key={r.libelle} onClick={() => appliquer(r.du, r.au)}>{r.libelle}</button>)}
          </div>
          <div className="dpf">
            <label><span>Du</span><input type="date" value={du} min={periode.min} max={periode.max} onChange={(e) => setDu(e.target.value)} /></label>
            <label><span>Au</span><input type="date" value={au} min={periode.min} max={periode.max} onChange={(e) => setAu(e.target.value)} /></label>
          </div>
          <p className="faint" style={{ fontSize: '11.5px', margin: 0 }}>{erreur ?? 'Jusqu’à 90 jours · comparé automatiquement à la période précédente de même durée.'}</p>
          <div className="pbtns">
            <button className="btn sm" type="button" onClick={() => { setPop(false); setErreur(null); }}>Annuler</button>
            <button className="btn sm pri" type="button" onClick={() => appliquer(du, au)}>Appliquer</button>
          </div>
        </div>
      )}
    </div>
  );
}
