'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  cheminPorte, gardeRemplace, hypotheseInspirationParDefaut, hypotheseParDefaut, noteDemandeIteration, variableInitiale, APRES_CREATION_ITERATION, ETAPES_ITERATION_SPATIALE, EXEMPLE_VALEUR_VARIABLE,
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
 *
 * Depuis une pub de la Veille (`inspiration`, VB F26) · la pub concurrente est
 * la SOURCE (étape 1, une seule carte), l'étape 2 se lit « je garde / je
 * remplace » · même règle des variables, adaptée à une source sans verdict
 * (`variablesInspiration`) · l'ad naît en brouillon de la marque active.
 */

/** Une pub de la Veille prise comme source d'inspiration · lue dans les sauvegardes, jamais écrite. */
export interface InspirationIterer {
  platform: 'meta' | 'tiktok' | 'google';
  externalId: string;
  annonceur: string;
  texte: string | null;
  vignette: string | null;
  /** `variablesInspiration` · la règle des variables admises, source sans verdict. */
  variables: ChoixVariablesIteration;
}

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
  /** Une pub de la Veille en source (`?veille=&pub=`) · absente, l'écran part du plan d'itération. */
  inspiration?: InspirationIterer | null;
  /**
   * Lot 5 bis · ouvert depuis une réponse de Jarvis · ce que le serveur a pu
   * présélectionner (pub, variable admise), et la phrase qui le dit · `null`
   * rien de sûr. Une variable n'est cochée que sur CETTE pub · aucune sinon
   * (jamais le défaut du plan à la place d'un pré-choix absent).
   */
  jarvis?: { note: string; adId: string | null; variable: TestedVariable | null } | null;
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

  const insp = p.inspiration ?? null;
  const c = insp ? null : p.choix.find((x) => x.adId === choisi && x.selectionnable) ?? null;
  const vars = insp ? insp.variables : c ? p.variables?.[c.adId] ?? null : null;
  /** Ce dont on part · une gagnante de la marque, ou la pub de la Veille. */
  const source = insp ? { titre: `la pub de ${insp.annonceur}`, ancre: '[data-inspiration]' } : c ? { titre: c.titre, ancre: `[data-itad="${c.adId}"]` } : null;
  const aller = (href: string) => { if (cheminPorte(href)) router.push(href); else window.location.assign(href); };
  // L'hypothèse suit la variable et la valeur tant qu'on ne l'a pas réécrite.
  const hyp = hypothese ?? (variable ? (insp ? hypotheseInspirationParDefaut({ annonceur: insp.annonceur, variable, valeur }) : c ? hypotheseParDefaut({ titre: c.titre, variable, valeur }) : '') : '');
  const gr = insp ? gardeRemplace(insp.variables, variable) : null;
  const noteDemande = noteDemandeIteration(p.choix, p.demande);
  const rang = RANG[etape];

  function continuer() {
    if (!source || !vars || vars.ferme) return;
    const j = p.jarvis ?? null;
    const i = j
      // Depuis Jarvis · sa variable, sur SA pub, rejouée par la règle de l'écran · aucun pré-choix sinon.
      ? (() => { const r = j.variable && c?.adId === j.adId ? variableInitiale(vars, j.variable) : null; return { variable: r && !r.note ? r.variable : null, note: c?.adId === j.adId ? j.note : null }; })()
      : variableInitiale(vars, p.variableDemandee ?? null);
    setVariable(i.variable); setNote(i.note); setValeur(''); setHypothese(null); setErreur(null);
    setEtape('variable');
    focaliserApres('[data-itvar][aria-checked="true"]', '[data-itvar]');
  }
  function choisirVariable(o: OptionVariable) {
    if (!o.admise || occupe) return;
    setVariable(o.variable); setErreur(null);
  }
  async function creer() {
    if (occupe || !source || !variable) return;
    setOccupe(true); setErreur(null);
    const r = await creerIterationChoisieAction(insp
      ? { inspiration: { platform: insp.platform, externalId: insp.externalId }, variable, valeur, hypothese: hyp }
      : { parentAdId: c!.adId, variable, valeur, hypothese: hyp })
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
      {etape === 'pub' && insp && (
        <>
          <div className="ithead"><h2>À partir de quelle pub ?</h2><p className="muted">Une pub de la Veille · tu gardes sa structure et tu remplaces une seule variable. Elle n’est pas une pub de ta marque · rien n’est écrit sur elle.</p></div>
          <div className="itads">
            <button type="button" className="itad on" data-inspiration={`${insp.platform}:${insp.externalId}`} aria-pressed="true">
              <span className="itadv"><Creative c={{ src: insp.vignette }} /></span>
              <span className="itadb">
                <span className="pill">Veille</span>
                <strong>{insp.annonceur}</strong>
                {insp.texte && <small>{insp.texte}</small>}
                <small>Source d’inspiration · sans verdict dans ta marque</small>
              </span>
            </button>
          </div>
          {vars?.ferme && <p className="faint" id={raisonVar} data-raison-ferme="variable" style={{ fontSize: '12.5px', marginTop: 12 }}>{vars.ferme}</p>}
        </>
      )}
      {etape === 'pub' && !insp && (p.vide ? (
        <TuileVide titre={p.vide.titre} texte={p.vide.texte}
          action={p.vide.lien ? <Lien className="btn sm" href={p.vide.lien.href} style={{ marginTop: 12 }}>{p.vide.lien.libelle}</Lien> : undefined} />
      ) : (
        <>
          <div className="ithead"><h2>Quelle pub veux-tu améliorer ?</h2><p className="muted">{p.resume}</p>{noteDemande && <p className="faint" role="status" data-note-demande="">{noteDemande}</p>}{p.jarvis && <p className="faint" role="status" data-note-jarvis="">{p.jarvis.note}</p>}</div>
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

      {etape === 'variable' && source && vars && (
        <>
          <div className="ithead"><h2>{insp ? 'Qu’est-ce que je remplace ?' : 'Qu’est-ce qu’on change ?'}</h2><p className="muted">Une seule variable à la fois · tout le reste de <b>{source.titre}</b> {insp ? 'est gardé' : 'reste tel quel'}. Une variable fermée dit pourquoi.</p></div>
          {note && <p className="ittip" role="status" data-note-variable="">{note}</p>}
          {gr && (
            <p className="muted" data-garde-remplace="" style={{ fontSize: '12.5px' }}>
              <b>Je garde</b> · {gr.garde.length ? gr.garde.join(', ').toLowerCase() : 'rien'} · <b>Je remplace</b> · {gr.remplace ? gr.remplace.toLowerCase() : 'à choisir'}
            </p>
          )}
          <div className="itlevs" role="radiogroup" aria-label="Variable à changer">
            {vars.options.map((o) => (
              <button key={o.variable} type="button" role="radio" className={`itlev ${o.variable === variable ? 'on' : ''}`.trim()} data-itvar={o.variable}
                aria-checked={o.variable === variable} aria-disabled={!o.admise || undefined} aria-describedby={`${id}-${o.variable}`}
                style={o.admise ? undefined : FERME} onClick={() => choisirVariable(o)}>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {o.etape && <span className="pill">{o.etape}</span>}
                  {o.conseillee && <span className="pill g">Conseillée</span>}
                  {!o.admise && <span className="pill">Fermée</span>}
                  {insp && o.admise && (o.variable === variable ? <span className="pill g" data-je="remplace">Je remplace</span> : <span className="pill" data-je="garde">Je garde</span>)}
                </span>
                <strong>{o.libelle}</strong>
                <small id={`${id}-${o.variable}`} className="muted">{o.admise ? (insp ? (o.variable === variable ? 'Je remplace celle de la pub par la mienne.' : 'Je garde celle de la pub.') : o.conseillee ? 'La variable que le plan propose pour cette gagnante.' : 'Admise · le reste de la pub reste gardé.') : o.raison}</small>
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
              <p className="faint" style={{ fontSize: '11.5px' }}>Créer l’itération est gratuit · elle naît en brouillon dans Résultats{insp ? ', dans ta marque active, avec la pub de la Veille comme source' : ''}, avec cette variable, sa valeur et ton hypothèse. Le devis de génération vient ensuite, calculé par le serveur dans le projet.</p>
            </div>
          )}
        </>
      )}

      {etape === 'creee' && creee && (
        <div className="ithead">
          <h2>Itération {creee.code} créée</h2>
          <p className="muted" data-iteration-creee="">{insp
            ? <>Elle garde la structure de la pub de {insp.annonceur} et remplace {VARIABLE_LABEL[creee.variable]} · « {creee.valeur} », avec ton hypothèse, en brouillon dans Résultats.</>
            : <>Elle change {VARIABLE_LABEL[creee.variable]} · « {creee.valeur} », avec ton hypothèse, en brouillon dans Résultats.</>}</p>
          <p className="faint" data-devis="serveur">{APRES_CREATION_ITERATION}</p>
        </div>
      )}

      {etape === 'pub' && insp && (
        <Ornement>
          <span className="info">Je garde la structure de <b>la pub de {insp.annonceur}</b> · je remplace une seule variable</span>
          <button className={`btn${insp.variables.ferme ? '' : ' pri'}`} type="button" data-geste="continuer" aria-disabled={insp.variables.ferme ? true : undefined}
            aria-describedby={insp.variables.ferme ? raisonVar : undefined} style={insp.variables.ferme ? FERME : undefined} onClick={continuer}>Choisir ce que je remplace</button>
        </Ornement>
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
      {etape === 'variable' && source && (
        <Ornement>
          <span className="info">{variable ? <>{insp ? 'Je remplace' : 'On change'} <b>{VARIABLE_LABEL[variable]}</b> de <b>{source.titre}</b> · le reste est gardé</> : 'Choisis une variable'}</span>
          <button className="btn" type="button" disabled={occupe} onClick={() => { setEtape('pub'); setErreur(null); focaliserApres(source.ancre); }}>Retour</button>
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
