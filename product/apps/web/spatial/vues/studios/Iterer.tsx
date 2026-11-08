'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  cheminPorte, hypotheseParDefaut, noteDemandeIteration, variableInitiale, APRES_CREATION_ITERATION, ETAPES_ITERATION_SPATIALE, EXEMPLE_VALEUR_VARIABLE,
  LIBELLE_CHOIX_VARIABLE, VARIABLE_LABEL, VALEUR_MAX, type ChoixIterationSpatial, type ChoixVariablesIteration, type OptionVariable, type TestedVariable,
} from '@tiktrends/core';
import { creerIterationChoisieAction, type ReponseIterationChoisie } from '../../../app/actions/adsmap-iterer-variable';
import { EnTete, Lien, Vue } from '../../communs';
import { FERME, focaliserApres, pendantAction } from '../projet/focus';
import { Creative, TuileVide } from './briques';
import { Ornement } from './Ornement';

/**
 * « Nouvelle itération » · `docs/spatial/reference/iterer.html` (étape 1),
 * balisage à l'identique. Les pubs sont le PLAN D'ITÉRATION réel (règle
 * `choixIterationSpatial`, noyau).
 *
 * Étape 2 « Ce qu'on change » · on CHOISIT la variable parmi celles que la
 * règle du noyau admet pour cette gagnante (`variablesIteration`) · une seule à
 * la fois, chaque variable fermée dit pourquoi, celle du plan est cochée par
 * défaut. « Créer l'itération » appelle `creerIterationChoisieAction` (gardes
 * rejouées côté serveur, gratuit) · l'ad naît en brouillon avec CETTE variable,
 * sa valeur et l'hypothèse. « Préparer le projet » mène ensuite à la reprise
 * RÉELLE du brief, puis au projet, où le devis serveur précède toute
 * génération. Aucune variante, aucun crédit, aucun appel à un modèle ici.
 */

export interface PropsIterer {
  sous: string;
  resume: string;
  choix: ReadonlyArray<ChoixIterationSpatial>;
  initial: string | null;
  /** Sans pub à proposer (offre, marque, plan vide) · ce que l'écran dit, et où aller. */
  vide: { titre: string; texte: string; lien: { href: string; libelle: string } | null } | null;
  /** Les variables admises de chaque pub sélectionnable (`variablesDuPlan`) · absent, l'étape 2 n'est pas offerte. */
  variables?: Readonly<Record<string, ChoixVariablesIteration>>;
  /** La variable demandée par l'adresse (`?variable=`, prompt conseillé). */
  variableDemandee?: TestedVariable | null;
  /** La pub demandée par l'adresse (`?iter=`) · dite quand elle ne peut pas être reprise. */
  demande?: string | null;
}

type Etape = 'pub' | 'variable' | 'creee';
type Creee = Extract<ReponseIterationChoisie, { ok: true }>;

const RANG: Record<Etape, number> = { pub: 0, variable: 1, creee: 2 };

export function Iterer(p: PropsIterer) {
  const router = useRouter();
  const id = useId();
  const [choisi, setChoisi] = useState<string | null>(p.initial);
  const [etape, setEtape] = useState<Etape>('pub');
  const [variable, setVariable] = useState<TestedVariable | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [valeur, setValeur] = useState('');
  const [hypothese, setHypothese] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [creee, setCreee] = useState<Creee | null>(null);

  const c = p.choix.find((x) => x.adId === choisi && x.selectionnable) ?? null;
  const vars = c ? p.variables?.[c.adId] ?? null : null;
  const aller = (href: string) => { if (cheminPorte(href)) router.push(href); else window.location.assign(href); };
  // L'hypothèse suit la variable et la valeur tant qu'on ne l'a pas réécrite.
  const hyp = hypothese ?? (c && variable ? hypotheseParDefaut({ titre: c.titre, variable, valeur }) : '');
  const noteDemande = noteDemandeIteration(p.choix, p.demande);
  const rang = RANG[etape];

  function continuer() {
    if (!c || !vars || vars.ferme) return;
    const i = variableInitiale(vars, p.variableDemandee ?? null);
    setVariable(i.variable); setNote(i.note); setValeur(''); setHypothese(null); setErreur(null);
    setEtape('variable');
    focaliserApres('[data-itvar][aria-checked="true"]', '[data-itvar]');
  }
  function choisirVariable(o: OptionVariable) {
    if (!o.admise || occupe) return;
    setVariable(o.variable); setErreur(null);
  }
  async function creer() {
    if (occupe || !c || !variable) return;
    setOccupe(true); setErreur(null);
    const r = await creerIterationChoisieAction({ parentAdId: c.adId, variable, valeur, hypothese: hyp })
      .catch((): ReponseIterationChoisie => ({ ok: false, error: 'La création a échoué · réessaie.' }));
    setOccupe(false);
    if (!r.ok) { setErreur(r.error); return; }
    setCreee(r); setEtape('creee');
    focaliserApres('[data-geste="preparer-iteration"]');
  }

  const raisonVar = `${id}-ferme`;
  return (
    <Vue>
      <EnTete titre="Nouvelle itération" sous={p.sous} />
      <ol className="itsteps" aria-label="Étapes">
        {ETAPES_ITERATION_SPATIALE.map((t, i) => (
          <li key={t}><button type="button" className={i === rang ? 'on' : i < rang ? 'done' : ''} disabled aria-current={i === rang ? 'step' : undefined}><b>{i + 1}</b><span>{t}</span></button></li>
        ))}
      </ol>
      {etape === 'pub' && (p.vide ? (
        <TuileVide titre={p.vide.titre} texte={p.vide.texte}
          action={p.vide.lien ? <Lien className="btn sm" href={p.vide.lien.href} style={{ marginTop: 12 }}>{p.vide.lien.libelle}</Lien> : undefined} />
      ) : (
        <>
          <div className="ithead"><h2>Quelle pub veux-tu améliorer ?</h2><p className="muted">{p.resume}</p>{noteDemande && <p className="faint" role="status" data-note-demande="">{noteDemande}</p>}</div>
          <div className="itads">
            {p.choix.map((x) => (
              <button key={x.adId} type="button" className={`itad ${x.adId === choisi ? 'on' : ''}`.trim()} data-itad={x.adId} aria-pressed={x.adId === choisi}
                disabled={!x.selectionnable} onClick={() => setChoisi(x.adId)}>
                <span className="itadv"><Creative c={{ src: x.vignette }} /></span>
                <span className="itadb">
                  {x.pastilles.map((t) => <span key={t.libelle} className={`pill ${t.classe}`.trim()}>{t.libelle}</span>)}
                  <strong>{x.titre}</strong>
                  {x.chiffres.length > 0 && <span className="itnums">{x.chiffres.map((n) => <span key={n.libelle}>{n.libelle} <b>{n.valeur}</b></span>)}</span>}
                  <small>{x.raison}</small>
                </span>
              </button>
            ))}
          </div>
          {vars?.ferme && <p className="faint" id={raisonVar} data-raison-ferme="variable" style={{ fontSize: '12.5px', marginTop: 12 }}>{vars.ferme}</p>}
        </>
      ))}

      {etape === 'variable' && c && vars && (
        <>
          <div className="ithead"><h2>Qu’est-ce qu’on change ?</h2><p className="muted">Une seule variable à la fois · tout le reste de <b>{c.titre}</b> reste tel quel. Une variable fermée dit pourquoi.</p></div>
          {note && <p className="ittip" role="status" data-note-variable="">{note}</p>}
          <div className="itlevs" role="radiogroup" aria-label="Variable à changer">
            {vars.options.map((o) => (
              <button key={o.variable} type="button" role="radio" className={`itlev ${o.variable === variable ? 'on' : ''}`.trim()} data-itvar={o.variable}
                aria-checked={o.variable === variable} aria-disabled={!o.admise || undefined} aria-describedby={`${id}-${o.variable}`}
                style={o.admise ? undefined : FERME} onClick={() => choisirVariable(o)}>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {o.etape && <span className="pill">{o.etape}</span>}
                  {o.conseillee && <span className="pill g">Conseillée</span>}
                  {!o.admise && <span className="pill">Fermée</span>}
                </span>
                <strong>{o.libelle}</strong>
                <small id={`${id}-${o.variable}`} className="muted">{o.admise ? (o.conseillee ? 'La variable que le plan propose pour cette gagnante.' : 'Admise · le reste de la pub reste gardé.') : o.raison}</small>
              </button>
            ))}
          </div>
          {variable && (
            <div style={{ display: 'grid', gap: 12, marginTop: 18, maxWidth: 820 }}>
              <label className="field">Nouvelle valeur · {LIBELLE_CHOIX_VARIABLE[variable].toLowerCase()}
                <input data-champ="valeur" value={valeur} maxLength={VALEUR_MAX} placeholder={EXEMPLE_VALEUR_VARIABLE[variable]} onChange={(e) => setValeur(e.target.value)} />
              </label>
              <div className="blform">
                <label htmlFor={`${id}-hyp`} style={{ fontSize: '11.5px', fontWeight: 600 }}>Hypothèse · ce que l’itération parie</label>
                <textarea id={`${id}-hyp`} data-champ="hypothese" value={hyp} maxLength={900} onChange={(e) => setHypothese(e.target.value)} />
              </div>
              {erreur && <p className="faint" role="alert" data-erreur="">{erreur}</p>}
              <p className="faint" style={{ fontSize: '11.5px' }}>Créer l’itération est gratuit · elle naît en brouillon dans Résultats, avec cette variable, sa valeur et ton hypothèse. Le devis de génération vient ensuite, calculé par le serveur dans le projet.</p>
            </div>
          )}
        </>
      )}

      {etape === 'creee' && creee && (
        <div className="ithead">
          <h2>Itération {creee.code} créée</h2>
          <p className="muted" data-iteration-creee="">Elle change {VARIABLE_LABEL[creee.variable]} · « {creee.valeur} », avec ton hypothèse, en brouillon dans Résultats.</p>
          <p className="faint" data-devis="serveur">{APRES_CREATION_ITERATION}</p>
        </div>
      )}

      {etape === 'pub' && c?.lien && (
        <Ornement>
          <span className="info">On change <b>{c.change.variable.toLowerCase()}</b> de <b>{c.titre}</b>{c.change.garde ? <> · on garde {c.change.garde.toLowerCase()}</> : null}</span>
          {vars && (
            <button className={`btn${vars.ferme ? '' : ' pri'}`} type="button" data-geste="continuer" aria-disabled={vars.ferme ? true : undefined}
              aria-describedby={vars.ferme ? raisonVar : undefined} style={vars.ferme ? FERME : undefined} onClick={continuer}>Choisir la variable</button>
          )}
          <button className={`btn${vars && !vars.ferme ? '' : ' pri'}`} type="button" onClick={() => aller(c.lien!)}>Préparer le projet</button>
        </Ornement>
      )}
      {etape === 'variable' && c && (
        <Ornement>
          <span className="info">{variable ? <>On change <b>{VARIABLE_LABEL[variable]}</b> de <b>{c.titre}</b> · le reste est gardé</> : 'Choisis une variable'}</span>
          <button className="btn" type="button" disabled={occupe} onClick={() => { setEtape('pub'); setErreur(null); focaliserApres(`[data-itad="${c.adId}"]`); }}>Retour</button>
          <button className="btn pri" type="button" data-geste="creer-iteration" {...pendantAction({ presse: occupe, occupe, ferme: !variable })} onClick={() => void creer()}>
            {occupe ? 'Création…' : 'Créer l’itération · gratuit'}
          </button>
        </Ornement>
      )}
      {etape === 'creee' && creee && (
        <Ornement>
          <span className="info">Itération {creee.code} · le devis vient dans le projet</span>
          <button className="btn pri" type="button" data-geste="preparer-iteration" onClick={() => aller(creee.preparer)}>Préparer le projet</button>
        </Ornement>
      )}
    </Vue>
  );
}
