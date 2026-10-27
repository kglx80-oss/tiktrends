'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  BORNES_IDENTITE, CATEGORIES_ATTRIBUT, ECHEC_RESEAU_STUDIO, LIBELLES_CATEGORIE, LIBELLES_VUE, VUES_IDENTITE,
  etatEchecStudio, formatSecondes, libelleAttributIdentite, messageHorsLigneStudio,
  type CategorieAttribut, type ErreurStudio, type ModeParole, type VueIdentite,
} from '@tiktrends/core';
import type { IdentiteVue, VueIdentites } from '../../../lib/studios/identites/commandes';
import { choisirModeParole, enregistrerIdentite, lierIdentite, resoudreContradiction } from '../../../app/actions/studios/identites';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Vue } from '../../communs';
import { EnTeteAtelier } from './Atelier';
import { Message } from './briques';

/**
 * Atelier « Identités et voix » d'un projet (`/studio/projets/[id]/identites`),
 * porté de l'écran V5 (`EcranIdentites`) sur les MÊMES actions :
 *
 *  · contradictions d'abord · tant qu'un plan contredit sa fiche, le devis de
 *    ce plan est REFUSÉ par le serveur ; deux résolutions explicites, aucune
 *    appliquée sans clic ;
 *  · fiches · attributs immuables (élément + couleur du lexique), version,
 *    plans liés ; enregistrer crée une version (conflit dit, rien d'écrasé) ;
 *  · voix · modes de parole par plan, synthèse et parole synchronisée dites
 *    indisponibles quand elles le sont, durées LUES dans les prises existantes.
 * Aucun geste de cet écran ne coûte · aucun appel modèle, aucun devis.
 */

export interface PropsIdentites {
  vue: VueIdentites;
  voixActive: boolean;
  atelier: ReadonlyArray<{ segment: string; href: string | null }>;
}

type Ligne = { id?: string; categorie: CategorieAttribut; element: string; couleur: string; detail: string };
type Edition = { identityId: string | null; nom: string; description: string; vues: VueIdentite[]; attributs: Ligne[] };

const vide = (): Edition => ({ identityId: null, nom: '', description: '', vues: ['front'], attributs: [{ categorie: 'tenue', element: '', couleur: '', detail: '' }] });
const depuis = (i: IdentiteVue): Edition => ({
  identityId: i.identityId, nom: i.nom, description: i.description, vues: i.vues,
  attributs: i.attributs.map((a) => ({ id: a.id, categorie: a.categorie, element: a.element, couleur: a.couleur ?? '', detail: a.detail })),
});
const LIBELLE_MODE: Readonly<Record<ModeParole, string>> = { voiceover: 'Voix off', lipsync: 'Parole synchronisée (lipsync)', none: 'Sans voix' };

function messageErreur(r: ErreurStudio): string {
  if (r.code === 'VERSION_CONFLICT') return 'Le projet a changé depuis l’ouverture de cette page · rien n’a été écrasé. Recharge pour repartir de la version courante.';
  if (r.violations?.length) return r.violations.map((v) => v.raison).join(' · ');
  return r.message;
}

export function Identites({ vue, voixActive, atelier }: PropsIdentites) {
  const router = useRouter();
  const { toast } = useSpatial();
  const [enCours, setEnCours] = useState<string | null>(null);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string; conflit?: boolean; code?: string } | null>(null);
  const [edition, setEdition] = useState<Edition | null>(null);
  const [liaisons, setLiaisons] = useState<Record<string, string[]>>(() => Object.fromEntries(vue.identites.map((i) => [i.identityId, i.plans])));
  const peut = vue.peutProposer && enCours === null;
  // « Voix » coupée pour l'espace · les modes de parole se lisent, ne se changent pas.
  const peutVoix = peut && voixActive;
  const base = vue.version.id;
  const v = vue.voix;
  const nomIdentite = (iid: string) => vue.identites.find((i) => i.identityId === iid)?.nom ?? iid;
  const rang = (sid: string) => vue.plans.find((p) => p.shotId === sid)?.rang ?? sid;
  const echec = retour && !retour.ok ? etatEchecStudio(retour.code) : null;

  async function geste(cle: string, action: () => Promise<{ ok: true; version: { n: number }; inchange: boolean } | ErreurStudio>, ok: string) {
    setEnCours(cle); setRetour(null);
    try {
      const r = await action();
      if (!r.ok) { setRetour({ ok: false, texte: messageErreur(r), conflit: r.code === 'VERSION_CONFLICT', code: r.code }); return false; }
      const texte = r.inchange ? 'Aucun changement à enregistrer.' : `${ok} · version ${r.version.n}.`;
      setRetour({ ok: true, texte }); toast(texte); router.refresh();
      return true;
    } catch {
      setRetour({ ok: false, texte: messageHorsLigneStudio('enregistrement'), code: ECHEC_RESEAU_STUDIO });
      return false;
    } finally { setEnCours(null); }
  }

  const majAttribut = (n: number, c: Partial<Ligne>) => edition && setEdition({ ...edition, attributs: edition.attributs.map((x, k) => (k === n ? { ...x, ...c } : x)) });

  return (
    <Vue>
      <EnTeteAtelier titre="Identités et voix" projet={{ id: vue.projet.id, title: vue.projet.title, marque: vue.projet.marque, versionN: vue.version.n }} atelier={atelier}
        actif={`/studio/projets/${vue.projet.id}/identites`} aide="Personnages récurrents, plans liés, contradictions et modes de parole · aucun geste de cet écran ne coûte." />
      {retour && (
        <div className="sec" data-retour={retour.ok ? 'ok' : 'refus'}>
          <Message ton={retour.ok ? 'ok' : 'err'}>{retour.ok ? '' : `${echec!.mot} · `}{retour.texte}</Message>
          {retour.conflit && <button className="btn sm" type="button" onClick={() => window.location.reload()} style={{ marginTop: 8 }}>Recharger la version courante</button>}
        </div>
      )}

      <section className="tile sec" data-zone="contradictions" style={{ display: 'grid', gap: 10 }}>
        <div className="sech" style={{ margin: 0 }}><h2>Contradictions avec les fiches</h2></div>
        {vue.contradictions.length === 0 ? (
          <p className="muted" style={{ fontSize: '12.5px' }} data-etat="sans-contradiction">Aucune contradiction · chaque plan lié dit la même chose que sa fiche. Les devis de ces plans peuvent être demandés.</p>
        ) : (
          <>
            <div className="banner" role="alert" data-etat="devis-bloque" style={{ margin: 0 }}>
              <Ic n="warn" /><span><b>Devis bloqué</b> · {vue.contradictions.length === 1 ? 'un plan contredit sa fiche' : `${vue.contradictions.length} passages contredisent leur fiche`}. Le devis de ces plans est refusé tant que tu n’as pas choisi une résolution. Rien n’est facturé.</span>
            </div>
            {vue.contradictions.map((k) => (
              <div className="prow" key={k.id} data-contradiction={k.id} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div className="t">
                  <strong style={{ fontSize: '12.5px' }}>{k.message}</strong>
                  <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>Plan {rang(k.shotId)} · fiche de {k.nomIdentite} · {k.nature === 'absence' ? 'élément absent du plan' : 'couleur différente'}</small>
                  {k.resolutions.map((r) => r.type === 'identite' && (
                    <small key={r.type} className="faint" style={{ display: 'block', fontSize: '11.5px' }}>
                      Changer la fiche touche {r.plansTouches.length} plan{r.plansTouches.length > 1 ? 's' : ''} ({r.plansTouches.map((s) => `plan ${rang(s)}`).join(', ')}) · leurs images seront à refaire.
                      {r.contradictionsApres > 0 ? ` Ensuite, ${r.contradictionsApres} contradiction${r.contradictionsApres > 1 ? 's resteraient' : ' resterait'}.` : ' Plus aucune contradiction ensuite.'}
                    </small>
                  ))}
                  {k.resolutions.length === 1 && <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>Fiche d’une ancienne forme · seule la correction du plan est proposée. Recrée la fiche pour pouvoir la changer.</small>}
                </div>
                <div className="kc">
                  {k.resolutions.map((r) => (
                    <button key={r.type} type="button" className={`btn sm ${r.type === 'plan' ? 'pri' : ''}`.trim()} data-resolution={r.type} disabled={!peut}
                      onClick={() => void geste(`res-${k.id}-${r.type}`, () => resoudreContradiction({ projectId: vue.projet.id, baseVersionId: base, contradictionId: k.id, choix: r.type }), 'Résolution appliquée')}>
                      {enCours === `res-${k.id}-${r.type}` ? 'Enregistrement…' : r.libelle}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </section>

      <section className="tile sec" data-zone="fiches" style={{ display: 'grid', gap: 10 }}>
        <div className="sech" style={{ margin: 0 }}><h2>Fiches d’identité</h2>
          {vue.peutProposer && !edition && <button className="btn sm" type="button" data-geste="nouvelle-fiche" style={{ marginLeft: 'auto' }} onClick={() => setEdition(vide())}><Ic n="plus" />Nouvelle fiche</button>}
        </div>
        <small className="faint" style={{ fontSize: '11.5px' }}>Les attributs d’une fiche sont immuables pour les plans · un plan qui dit autre chose est bloqué avant devis. Changer la fiche crée une nouvelle version, et les plans liés deviennent à refaire.</small>
        {vue.identites.length === 0 && !edition && <p className="muted" style={{ fontSize: '12.5px' }} data-etat="sans-fiche">Aucun personnage récurrent dans ce projet.</p>}
        {vue.identites.map((i) => (
          <div className="prow" key={i.identityId} data-identite={i.identityId} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="t" style={{ display: 'grid', gap: 6 }}>
              <strong style={{ fontSize: 13 }}>{i.nom} <span className={`pill ${i.structuree ? 'g' : 'w'}`}>{i.structuree ? `Fiche version ${i.version}` : 'Ancienne forme · lecture seule'}</span></strong>
              {i.description && <small className="faint" style={{ fontSize: '11.5px' }}>{i.description}</small>}
              <div className="kc">{i.attributs.map((a) => <span key={a.id} className="pill">{libelleAttributIdentite(a)}{a.detail ? ` · ${a.detail}` : ''}</span>)}</div>
              <div>
                <div className="lbl">Plans liés</div>
                {vue.plans.length === 0 ? <small className="faint" style={{ fontSize: '11.5px' }}>Aucun plan · le storyboard crée les plans.</small> : (
                  <div className="kc">
                    {vue.plans.map((p) => {
                      const coche = (liaisons[i.identityId] ?? []).includes(p.shotId);
                      return (
                        <button key={p.shotId} type="button" className="chip" aria-pressed={coche} disabled={!vue.peutProposer} data-plan-lie={p.shotId}
                          onClick={() => setLiaisons((l) => ({ ...l, [i.identityId]: coche ? (l[i.identityId] ?? []).filter((s) => s !== p.shotId) : [...(l[i.identityId] ?? []), p.shotId] }))}>Plan {p.rang}</button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            {vue.peutProposer && (
              <div className="kc">
                <button className="btn sm" type="button" disabled={!peut}
                  onClick={() => void geste(`lier-${i.identityId}`, () => lierIdentite({ projectId: vue.projet.id, baseVersionId: base, identityId: i.identityId, shotIds: liaisons[i.identityId] ?? [] }), `Liaison de ${i.nom} enregistrée`)}>Enregistrer les plans liés</button>
                {i.structuree && !edition && <button className="btn sm" type="button" onClick={() => setEdition(depuis(i))}><Ic n="brush" />Modifier la fiche</button>}
              </div>
            )}
          </div>
        ))}
        {edition && (
          <form className="sugg" data-zone="edition-fiche" style={{ display: 'grid', gap: 10 }}
            onSubmit={async (ev) => {
              ev.preventDefault();
              const ok = await geste('fiche', () => enregistrerIdentite({
                projectId: vue.projet.id, baseVersionId: base, identityId: edition.identityId ?? undefined, nom: edition.nom, description: edition.description, vues: edition.vues.length ? edition.vues : undefined,
                attributs: edition.attributs.map((a) => ({ id: a.id, categorie: a.categorie, element: a.element, couleur: a.couleur || null, detail: a.detail })),
              }), `Fiche « ${edition.nom} » enregistrée`);
              if (ok) setEdition(null);
            }}>
            <strong style={{ fontSize: 13 }}>{edition.identityId ? `Modifier ${nomIdentite(edition.identityId)}` : 'Nouvelle fiche'}</strong>
            <label className="field" style={{ maxWidth: 420 }}>Nom du personnage
              <input value={edition.nom} maxLength={BORNES_IDENTITE.nom} required onChange={(e) => setEdition({ ...edition, nom: e.target.value })} />
            </label>
            <datalist id="tt-couleurs-identite">{vue.couleurs.map((c) => <option key={c} value={c} />)}</datalist>
            {edition.attributs.map((a, n) => (
              <div key={n} style={{ display: 'grid', gap: 6 }} data-attribut={n + 1}>
                <div className="lbl" style={{ margin: 0 }}>Attribut {n + 1}</div>
                <div className="fields" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))' }}>
                  <label className="field">Catégorie
                    <select value={a.categorie} onChange={(e) => majAttribut(n, { categorie: e.target.value as CategorieAttribut })}>
                      {CATEGORIES_ATTRIBUT.map((c) => <option key={c} value={c}>{LIBELLES_CATEGORIE[c]}</option>)}
                    </select>
                  </label>
                  <label className="field">Élément<input value={a.element} maxLength={BORNES_IDENTITE.element} placeholder="veste, cheveux, lunettes" onChange={(e) => majAttribut(n, { element: e.target.value })} /></label>
                  <label className="field">Couleur (liste fermée)<input list="tt-couleurs-identite" value={a.couleur} onChange={(e) => majAttribut(n, { couleur: e.target.value })} /></label>
                  <label className="field">Précision<input value={a.detail} maxLength={BORNES_IDENTITE.detail} onChange={(e) => majAttribut(n, { detail: e.target.value })} /></label>
                </div>
                <div className="kc"><button className="btn sm" type="button" onClick={() => setEdition({ ...edition, attributs: edition.attributs.filter((_, k) => k !== n) })}><Ic n="x" />Retirer l’attribut {n + 1}</button></div>
              </div>
            ))}
            <div className="kc">
              <button className="btn sm" type="button" disabled={edition.attributs.length >= BORNES_IDENTITE.attributs} onClick={() => setEdition({ ...edition, attributs: [...edition.attributs, { categorie: 'accessoire', element: '', couleur: '', detail: '' }] })}><Ic n="plus" />Ajouter un attribut</button>
            </div>
            <div>
              <div className="lbl">Vues utiles</div>
              <div className="kc">
                {VUES_IDENTITE.map((w) => <button key={w} type="button" className="chip" aria-pressed={edition.vues.includes(w)} onClick={() => setEdition({ ...edition, vues: edition.vues.includes(w) ? edition.vues.filter((x) => x !== w) : [...edition.vues, w] })}>{LIBELLES_VUE[w]}</button>)}
              </div>
            </div>
            <label className="field">Description
              <textarea className="ta" value={edition.description} maxLength={BORNES_IDENTITE.description} onChange={(e) => setEdition({ ...edition, description: e.target.value })} />
            </label>
            <div className="kc">
              <button className="btn sm pri" type="submit" disabled={!peut}>{enCours === 'fiche' ? 'Enregistrement…' : 'Enregistrer la fiche'}</button>
              <button className="btn sm" type="button" onClick={() => setEdition(null)}>Annuler</button>
            </div>
          </form>
        )}
      </section>

      <section className="tile sec" data-zone="voix" style={{ display: 'grid', gap: 10 }}>
        <div className="sech" style={{ margin: 0 }}><h2>Voix et temps</h2></div>
        {!voixActive && (
          <div className="banner" role="status" data-etat="non-active" data-capacite="voix" style={{ margin: 0 }}>
            <Ic n="lock" /><span><b>Voix · non activée pour cet espace.</b> Les modes de parole restent lisibles · les changer s’ouvrira avec la voix, d’abord pour des espaces pilotes.</span>
          </div>
        )}
        <small className="faint" style={{ fontSize: '11.5px' }} data-capacite="synthese">
          {v.capacites.synthese.disponible ? 'Synthèse vocale disponible · chaque prise est devisée avant d’être produite.' : `Synthèse vocale indisponible · ${v.capacites.synthese.raison.replace(/^La synthèse vocale n’est pas disponible · /, '')}`} La voix ne prononce que la narration validée de chaque plan.
        </small>
        <div className="tl">
          {v.modes.map((m) => (
            <div className="ev" key={m.mode} data-mode={m.mode} data-disponible={m.disponible ? 'oui' : 'non'}>
              <span className="ico"><Ic n={m.disponible ? 'check' : 'lock'} /></span>
              <span>{m.libelle}<small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{m.description}{m.raison ? ` · ${m.raison}` : ''}</small></span>
              <span className={`pill ${m.disponible ? 'g' : ''}`.trim()}>{m.disponible ? (m.mode === 'voiceover' ? 'Proposé' : 'Possible') : 'Indisponible'}</span>
            </div>
          ))}
        </div>
        {v.plansLipsync.length > 0 && (
          <div className="banner" role="alert" data-etat="lipsync-indisponible" style={{ margin: 0 }}>
            <Ic n="warn" /><span><b>Parole synchronisée demandée sans fournisseur</b> · {v.plansLipsync.map((s) => `plan ${rang(s)}`).join(', ')}. Rien n’est simulé · passe {v.plansLipsync.length > 1 ? 'ces plans' : 'ce plan'} en voix off ou retire la parole.</span>
            <button className="btn sm pri" type="button" disabled={!peutVoix} style={{ marginLeft: 'auto' }}
              onClick={() => void geste('voixoff', () => choisirModeParole({ projectId: vue.projet.id, baseVersionId: base, shotIds: v.plansLipsync, mode: 'voiceover' }), 'Passage en voix off enregistré')}>Passer en voix off</button>
          </div>
        )}
        {vue.plans.map((p) => {
          const t = v.temps.plans.find((x) => x.shotId === p.shotId);
          const prise = v.prises[p.shotId] ?? { etat: 'absente' as const };
          return (
            <div className="prow" key={p.shotId} data-plan={p.shotId} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div className="t">
                <strong style={{ fontSize: '12.5px' }}>Plan {p.rang} <span className="faint">· {p.identites.length ? p.identites.map(nomIdentite).join(', ') : 'aucune fiche liée'}</span></strong>
                <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{p.narration ? <>Narration validée · « {p.narration} »</> : 'Pas de narration.'}</small>
                <small className="faint" style={{ display: 'block', fontSize: '11.5px' }} data-prise={prise.etat}>
                  {prise.etat === 'mesuree'
                    ? `Prise existante · durée mesurée ${formatSecondes(prise.dureeMs)} (lue dans l’en-tête ${prise.format.toUpperCase()}${prise.tronque ? ', fichier tronqué' : ''}) pour ${formatSecondes(p.estimeMs)} prévues.`
                    : prise.etat === 'illisible'
                      ? `Prise illisible · ${prise.motif}. Durée prévue ${formatSecondes(p.estimeMs)}.`
                      : `Aucune prise · durée prévue ${formatSecondes(p.estimeMs)}, à confirmer par une prise réelle.`}
                  {t && t.depassementMs > 0 ? ` Le plan passe à ${formatSecondes(t.retenuMs)}.` : ''}
                </small>
              </div>
              <select aria-label={`Mode de parole du plan ${p.rang}`} value={p.mode} disabled={!peutVoix}
                onChange={(e) => { const mode = e.target.value; void geste(`mode-${p.shotId}`, () => choisirModeParole({ projectId: vue.projet.id, baseVersionId: base, shotIds: [p.shotId], mode }), `Mode du plan ${p.rang} enregistré`); }}>
                {v.modes.map((m) => <option key={m.mode} value={m.mode} disabled={!m.disponible}>{LIBELLE_MODE[m.mode]}{m.disponible ? '' : ' · indisponible'}</option>)}
              </select>
            </div>
          );
        })}
        <p style={{ fontSize: '12.5px' }} className={v.temps.depassementMs > 0 ? '' : 'muted'} data-temps={v.temps.depassementMs > 0 ? 'depassement' : 'dans-la-cible'}>{v.temps.message}</p>
      </section>
    </Vue>
  );
}
