'use client';

import { useEffect, useState } from 'react';
import {
  cleBrouillonTextes, comparerTextes, libelleCoutTexteEstime, raisonAjoutTexte,
  LIBELLES_TYPE_TEXTE, LIBELLES_TYPE_TEXTE_PLURIEL, NOTE_BORNE_TEXTE, TYPES_TEXTE, VARIANTES_DEFAUT, VARIANTES_MAX,
  type ErreurStudio, type TexteStudio, type TypeTexte, type VarianteTexte,
} from '@tiktrends/core';
import type { VueTextes } from '../../../lib/studios/textes/textes';
import { ecrireTextes, enregistrerTextes, exporterTextes, injecterTexte } from '../../../app/actions/studios/textes';
import { MESSAGE_APPEL_PAYANT, resultatPayantIncertain, useAppelPayant } from '../../../lib/studios/appel-payant';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Lien, Vue } from '../../communs';
import { EnTeteAtelier } from './Atelier';
import { Message } from './briques';

/**
 * Atelier « Textes » d'un projet (`/studio/projets/[id]/textes`), porté de
 * l'écran V5 (`EcranTextes`) sur les MÊMES actions · hooks, corps, CTA et
 * scripts liés au même brief que les studios.
 *
 *  · Écrire avec l'IA · appel texte PAYANT, coût maximal annoncé AVANT le
 *    clic, second clic de confirmation, verrou d'appel payant ; rien n'entre
 *    dans le projet sans « Retenir » ;
 *  · Écrire à la main · aucun appel, mêmes règles (allégation = fait du brief) ;
 *  · Retenus · modifier, retirer, copier, comparer, proposer dans un calque
 *    texte (proposition, rien d'appliqué) ;
 *  · Copier et exporter (Markdown, CSV, JSON) · sans média, sans crédit.
 * Chaque enregistrement crée une version (conflit dit, rien d'écrasé) · un
 * brouillon survit au rechargement après conflit. Le texte venu du modèle est
 * rendu comme TEXTE, jamais comme HTML.
 */

export interface PropsTextes {
  vue: VueTextes;
  atelier: ReadonlyArray<{ segment: string; href: string | null }>;
}

type Edition = Pick<TexteStudio, 'type' | 'langue' | 'texte' | 'sources'>;
interface Brouillon { manuel: Edition; edition: { id: string; valeur: string } | null }
const libelleType = (t: TexteStudio['type']) => (t === 'libre' ? 'Texte libre' : LIBELLES_TYPE_TEXTE[t]);

function messageErreur(r: ErreurStudio): string {
  if (r.code === 'VERSION_CONFLICT') return 'Le projet a changé depuis l’ouverture de cette page · rien n’a été écrasé. Recharge pour repartir de la version courante (tes variantes non retenues seront à redemander).';
  if (r.violations?.length) return r.violations.map((v) => v.raison).join(' · ');
  return r.message;
}
function lireBrouillon(projectId: string): Brouillon | null {
  try {
    const brut = window.sessionStorage.getItem(cleBrouillonTextes(projectId));
    if (!brut) return null;
    window.sessionStorage.removeItem(cleBrouillonTextes(projectId));
    const b = JSON.parse(brut) as Brouillon;
    return b && typeof b.manuel?.texte === 'string' ? b : null;
  } catch { return null; }
}
function ecrireBrouillon(projectId: string, b: Brouillon): void {
  try { window.sessionStorage.setItem(cleBrouillonTextes(projectId), JSON.stringify(b)); } catch { /* stockage refusé · rien à garder */ }
}
async function copier(t: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
}

export function Textes({ vue, atelier }: PropsTextes) {
  const { toast } = useSpatial();
  const appel = useAppelPayant(vue.projet.id, 'textes');
  const [version, setVersion] = useState(vue.version);
  const [retenus, setRetenus] = useState<TexteStudio[]>(vue.textes);
  const [proposees, setProposees] = useState<VarianteTexte[]>([]);
  const [ecartees, setEcartees] = useState<Array<{ id: string; raison: string }>>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [type, setType] = useState<TypeTexte>('hook');
  const limite = vue.limites.find((l) => l.type === type)!;
  const [nombre, setNombre] = useState(VARIANTES_DEFAUT);
  const [max, setMax] = useState<Record<string, number>>({});
  const maxType = max[type] ?? limite.max;
  const [manuel, setManuel] = useState<Edition>({ type: 'hook', langue: 'fr', texte: '', sources: [] });
  const [edition, setEdition] = useState<{ id: string; valeur: string } | null>(null);
  const [calque, setCalque] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<string | null>(null);
  const [arme, setArme] = useState(false);
  const [retour, setRetour] = useState<{ ton: 'ok' | 'err'; texte: string; conflit?: boolean; lien?: boolean } | null>(null);
  const d = vue.disponibilite;
  const faits = vue.brief?.faits ?? [];
  const libelleFait = (fid: string) => faits.find((f) => f.id === fid)?.claim ?? 'fait absent de cette version';

  useEffect(() => {
    const b = lireBrouillon(vue.projet.id);
    if (!b || (!b.manuel.texte.trim() && !b.edition)) return;
    setManuel(b.manuel);
    if (b.edition && vue.textes.some((t) => t.id === b.edition!.id)) setEdition(b.edition);
    setRetour({ ton: 'ok', texte: 'Version courante rechargée · ton brouillon est remis en place, rien n’est encore enregistré.' });
    // Lecture au montage seulement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const recharger = () => { ecrireBrouillon(vue.projet.id, { manuel, edition }); window.location.reload(); };
  const dire = (ton: 'ok' | 'err', texte: string, o: { conflit?: boolean; lien?: boolean } = {}) => { setRetour({ ton, texte, ...o }); if (ton === 'ok') toast(texte); };

  async function sauver(liste: Edition[], ok: string): Promise<boolean> {
    setEnCours('sauver'); setRetour(null);
    try {
      const r = await enregistrerTextes({ projectId: vue.projet.id, baseVersionId: version.id, textes: liste });
      if (!r.ok) { dire('err', messageErreur(r), { conflit: r.code === 'VERSION_CONFLICT' }); return false; }
      setVersion({ id: r.version.id, n: r.version.n });
      setRetenus(r.textes);
      dire('ok', r.inchange ? 'Aucun changement à enregistrer.' : `${ok} · version ${r.version.n}.`);
      return true;
    } catch { dire('err', 'Le serveur n’a pas répondu · rien n’a été enregistré.'); return false; }
    finally { setEnCours(null); }
  }

  async function ecrire() {
    const tentative = appel.commencer();
    if (!tentative) return;
    setArme(false); setEnCours('ecrire'); setRetour(null); setQuestions([]);
    try {
      const r = await ecrireTextes({ projectId: vue.projet.id, baseVersionId: version.id, type, nombre, maxCaracteres: maxType, langue: 'fr' });
      appel.terminer(tentative, resultatPayantIncertain(r));
      if (!r.ok) { dire('err', messageErreur(r), { conflit: r.code === 'VERSION_CONFLICT' }); return; }
      if (r.statut === 'questions') { setQuestions(r.questions); return; }
      setProposees(r.variantes); setEcartees(r.ecartees);
    } catch { appel.terminer(tentative, true); dire('err', MESSAGE_APPEL_PAYANT); }
    finally { setEnCours(null); }
  }

  async function exporter(format: 'markdown' | 'csv' | 'json') {
    setEnCours(`export-${format}`); setRetour(null);
    try {
      const r = await exporterTextes({ projectId: vue.projet.id, versionId: version.id, format });
      if (!r.ok) { dire('err', messageErreur(r)); return; }
      const url = URL.createObjectURL(new Blob([r.contenu], { type: `${r.typeMime};charset=utf-8` }));
      const a = document.createElement('a');
      a.href = url; a.download = r.nomFichier; a.click();
      URL.revokeObjectURL(url);
      dire('ok', `Export ${r.nomFichier} · aucun média lancé, rien de facturé.`);
    } catch { dire('err', 'Le serveur n’a pas répondu · aucun fichier exporté. Vérifie ta connexion puis réessaie.'); }
    finally { setEnCours(null); }
  }

  async function injecter(t: TexteStudio) {
    const layerId = calque[t.id] ?? vue.calques[0]?.id;
    if (!layerId) return;
    setEnCours(`injecter-${t.id}`); setRetour(null);
    try {
      const r = await injecterTexte({ projectId: vue.projet.id, baseVersionId: version.id, layerId, texte: t.texte });
      if (!r.ok) { dire('err', messageErreur(r), { conflit: r.code === 'VERSION_CONFLICT' }); return; }
      const nom = vue.calques.find((c) => c.id === layerId)?.nom ?? layerId;
      dire('ok', `Proposition créée pour le calque « ${nom} » · rien n’est appliqué tant que tu ne l’appliques pas depuis le projet.`, { lien: true });
    } catch { dire('err', 'Le serveur n’a pas répondu · aucune proposition créée. Vérifie ta connexion puis réessaie.'); }
    finally { setEnCours(null); }
  }

  const ecritureBloquee = appel.bloque || !d.disponible || !vue.peutEcrire || enCours !== null || !vue.brief;
  const raisonAjout = raisonAjoutTexte({ peutEcrire: vue.peutEcrire, briefPresent: !!vue.brief, enCours: enCours !== null, texte: manuel.texte });
  const coutEcriture = `${libelleCoutTexteEstime(d.coutMaxUsd)} · ${NOTE_BORNE_TEXTE}`;
  const libelleEcrire = `Écrire ${nombre} ${nombre > 1 ? LIBELLES_TYPE_TEXTE_PLURIEL[type] : LIBELLES_TYPE_TEXTE[type].toLowerCase()}`;
  const tous = [
    ...retenus.map((t) => ({ cle: `r-${t.id}`, libelle: `Retenu · ${libelleType(t.type)} · ${t.texte.slice(0, 40)}`, texte: t.texte })),
    ...proposees.map((t, i) => ({ cle: `p-${t.id}`, libelle: `Proposé ${i + 1} · ${libelleType(t.type)} · ${t.texte.slice(0, 40)}`, texte: t.texte })),
  ];

  return (
    <Vue>
      <EnTeteAtelier titre="Textes liés au brief" projet={{ id: vue.projet.id, title: vue.projet.title, marque: vue.projet.marque, versionN: version.n }} atelier={atelier}
        actif={`/studio/projets/${vue.projet.id}/textes`} aide="Hooks, corps, CTA et scripts sur les mêmes faits et la même hypothèse que les studios." />
      {retour && (
        <div className="sec">
          <Message ton={retour.ton}>{retour.texte}{retour.lien && <> <Lien href={`/studio/projets/${vue.projet.id}#propositions`}>Ouvrir le projet</Lien></>}</Message>
          {retour.conflit && <button className="btn sm" type="button" onClick={recharger} style={{ marginTop: 8 }}>Recharger la version courante</button>}
        </div>
      )}

      <div className="grid2">
        <section className="tile" data-zone="brief">
          <div className="lbl">Le brief partagé</div>
          {vue.brief ? (
            <div className="tl">
              <div className="ev"><span className="ico"><Ic n="flask" /></span><span>Objectif<small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{vue.brief.objectif || 'à préciser'}</small></span></div>
              <div className="ev"><span className="ico"><Ic n="bulb" /></span><span>Hypothèse<small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{vue.brief.hypothese ?? 'aucune'}</small></span></div>
              <div className="ev"><span className="ico"><Ic n="loop" /></span><span>Variable testée<small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{vue.brief.variable || 'à préciser'}</small></span></div>
              <details>
                <summary className="faint" style={{ cursor: 'pointer', fontSize: '12.5px' }}>{faits.length} fait{faits.length > 1 ? 's' : ''} citables par les allégations</summary>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '11.5px' }}>{faits.map((f) => <li key={f.id}><code>{f.id}</code> · {f.claim}</li>)}</ul>
              </details>
            </div>
          ) : <p className="muted" style={{ fontSize: '12.5px' }} data-etat="sans-brief">{vue.briefIllisible ? 'Le brief de cette version est illisible.' : 'Ce projet n’a pas encore de brief · les textes s’écrivent à partir du brief.'}</p>}
        </section>

        <section className="tile" data-zone="ecrire-ia" style={{ display: 'grid', gap: 10 }}>
          <div className="lbl" style={{ margin: 0 }}>Écrire avec l’IA</div>
          {appel.bloque && <div className="banner" role="status" style={{ margin: 0 }}><span className="orb" style={{ width: 32, height: 32, fontSize: '12.5px' }}>J</span><span>{MESSAGE_APPEL_PAYANT} <Lien href={`/studio/projets/${vue.projet.id}#taches`}>Voir le suivi</Lien></span></div>}
          <div className="kc" role="group" aria-label="Type de texte">
            {TYPES_TEXTE.map((t) => <button key={t} type="button" className="chip" aria-pressed={type === t} onClick={() => { setType(t); setArme(false); }}>{LIBELLES_TYPE_TEXTE[t]}</button>)}
          </div>
          <div className="fields" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
            <label className="field">Variantes
              <input type="number" min={1} max={VARIANTES_MAX} value={nombre} onChange={(e) => { setNombre(Math.min(VARIANTES_MAX, Math.max(1, Number(e.target.value) || 1))); setArme(false); }} />
            </label>
            <label className="field">Caractères au plus
              <input type="number" min={1} max={limite.max} value={maxType} onChange={(e) => setMax((m) => ({ ...m, [type]: Math.min(limite.max, Math.max(1, Number(e.target.value) || 1)) }))} />
            </label>
          </div>
          <small className="faint" style={{ fontSize: '11.5px' }}>{limite.mesuree ? `${limite.max} · palier mesuré où la police de l’accroche atteint son plancher.` : `${limite.max} · borne du contrat, aucune limite mesurée pour ce type · resserre-la si besoin.`}</small>
          {!d.disponible && <small className="faint" style={{ fontSize: '11.5px' }} role="note">Indisponible · {d.raison}</small>}
          {arme ? (
            <div className="sugg" data-confirmation="ecrire">
              <p style={{ fontSize: '12.5px' }}>Appel texte payant · {coutEcriture}, imputé au plafond de dépense. Aucun média, aucun crédit, rien d’enregistré sans « Retenir ».</p>
              <div className="kc" style={{ marginTop: 8 }}>
                <button className="btn sm pri" type="button" disabled={ecritureBloquee} onClick={() => void ecrire()}>{enCours === 'ecrire' ? 'Écriture…' : `Confirmer · ${libelleEcrire.toLowerCase()}`}</button>
                <button className="btn sm" type="button" onClick={() => setArme(false)}>Annuler</button>
              </div>
            </div>
          ) : (
            <div className="kc">
              <button className="btn sm pri" type="button" data-bouton="ecrire" disabled={ecritureBloquee} onClick={() => setArme(true)}><Ic n="spark" />{enCours === 'ecrire' ? 'Écriture…' : libelleEcrire}</button>
              <small className="faint" style={{ fontSize: '11.5px' }} data-cout="texte">Appel texte payant · {coutEcriture}</small>
            </div>
          )}
          {questions.length > 0 && <Message ton="info">Il manque une précision · {questions.join(' · ')}</Message>}
        </section>
      </div>

      {(proposees.length > 0 || ecartees.length > 0) && (
        <section className="tile sec" style={{ display: 'grid', gap: 8 }} aria-label="Variantes proposées">
          <div className="sech" style={{ margin: 0 }}><h2>Proposés par l’IA</h2><span className="faint" style={{ fontSize: '12.5px' }}>Rien n’entre dans le projet sans « Retenir »</span></div>
          {proposees.map((v, i) => (
            <div className="prow" key={v.id} data-variante={i + 1} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div className="t">
                <strong style={{ fontSize: '12.5px' }}><span className="pill c">{LIBELLES_TYPE_TEXTE[v.type]} {i + 1}</span> <span className="faint">{v.longueur} / {maxType} caractères</span></strong>
                <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 4 }}>{v.texte}</p>
                {v.sources.length > 0 && <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>Allégations fondées sur · {v.sources.map((s) => `${s} (${libelleFait(s)})`).join(' · ')}</small>}
                {v.horsVariable && <small style={{ display: 'block', fontSize: '11.5px' }}><span className="pill w">Hors variable</span> Change « {v.variable} » et non la variable du test · le test ne l’isolerait pas.</small>}
              </div>
              <div className="kc">
                <button className="btn sm pri" type="button" disabled={enCours !== null || !vue.peutEcrire} onClick={async () => { if (await sauver([...retenus, v], 'Texte retenu')) setProposees((p) => p.filter((x) => x.id !== v.id)); }}><Ic n="check" />Retenir</button>
                <button className="btn sm" type="button" onClick={async () => { const ok = await copier(v.texte); dire(ok ? 'ok' : 'err', ok ? 'Texte copié.' : 'Le navigateur a refusé la copie.'); }}><Ic n="copy" />Copier</button>
              </div>
            </div>
          ))}
          {ecartees.length > 0 && (
            <div className="sugg">
              <p style={{ fontSize: '12.5px' }}>Écartées par le contrôle du serveur</p>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: '11.5px' }}>{ecartees.map((x) => <li key={x.id}>{x.id} · {x.raison}</li>)}</ul>
            </div>
          )}
        </section>
      )}

      <div className="grid2 sec">
        <section className="tile" data-zone="ecrire-main" id="ecrire-main" style={{ display: 'grid', gap: 10 }}>
          <div className="lbl" style={{ margin: 0 }}>Écrire à la main</div>
          <small className="faint" style={{ fontSize: '11.5px' }}>Aucun appel, aucun coût · les mêmes règles : une allégation cite un fait du brief.</small>
          {vue.peutEcrire ? (
            <>
              <div className="kc" role="group" aria-label="Type du texte écrit à la main">
                {TYPES_TEXTE.map((t) => <button key={t} type="button" className="chip" aria-pressed={manuel.type === t} onClick={() => setManuel((m) => ({ ...m, type: t }))}>{LIBELLES_TYPE_TEXTE[t]}</button>)}
              </div>
              <textarea className="ta" rows={3} value={manuel.texte} maxLength={12_000} aria-label="Texte" onChange={(e) => setManuel((m) => ({ ...m, texte: e.target.value }))} />
              {faits.some((f) => f.kind === 'declared' || f.kind === 'measured') && (
                <div>
                  <div className="lbl">Faits qui fondent les allégations (facultatif)</div>
                  <small className="faint" style={{ display: 'block', fontSize: '11.5px', marginBottom: 6 }}>Faits déclarés du produit et mesures · une observation d’une annonce concurrente ne fonde aucune allégation de la marque.</small>
                  <div className="kc">
                    {faits.filter((f) => f.kind === 'declared' || f.kind === 'measured').map((f) => (
                      <button key={f.id} type="button" className="chip" aria-pressed={manuel.sources.includes(f.id)} data-fait={f.id}
                        onClick={() => setManuel((m) => ({ ...m, sources: m.sources.includes(f.id) ? m.sources.filter((x) => x !== f.id) : [...m.sources, f.id] }))}>{f.claim}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="kc">
                <button className="btn sm pri" type="button" data-geste="ajouter" disabled={raisonAjout !== null}
                  onClick={async () => { if (await sauver([...retenus, manuel], 'Texte ajouté')) setManuel({ type: manuel.type, langue: 'fr', texte: '', sources: [] }); }}>Ajouter aux textes retenus</button>
                {raisonAjout && <small className="faint" style={{ fontSize: '11.5px' }} data-raison="ajout">{raisonAjout}</small>}
              </div>
            </>
          ) : <small className="faint" style={{ fontSize: '11.5px' }}>Ton rôle permet de lire et d’exporter, pas d’écrire.</small>}
        </section>

        <section className="tile" data-zone="export" style={{ display: 'grid', gap: 10 }}>
          <div className="lbl" style={{ margin: 0 }}>Copier et exporter</div>
          <small className="faint" style={{ fontSize: '11.5px' }}>Pour produire ailleurs · aucune génération, aucun crédit, aucun média.</small>
          <div className="kc">
            <button className="btn sm" type="button" disabled={retenus.length === 0} onClick={async () => { const ok = await copier(retenus.map((t) => `${libelleType(t.type)} · ${t.texte}`).join('\n\n')); dire(ok ? 'ok' : 'err', ok ? 'Tous les textes retenus sont copiés.' : 'Le navigateur a refusé la copie.'); }}><Ic n="copy" />Copier tous les textes</button>
            {vue.peutExporter && (['markdown', 'csv', 'json'] as const).map((f) => (
              <button key={f} className="btn sm" type="button" data-export={f} disabled={enCours !== null} onClick={() => void exporter(f)}><Ic n="down" />{f === 'markdown' ? 'Markdown' : f === 'csv' ? 'CSV' : 'JSON'}</button>
            ))}
          </div>
        </section>
      </div>

      <section className="tile sec" data-zone="retenus" style={{ display: 'grid', gap: 8 }}>
        <div className="sech" style={{ margin: 0 }}><h2>Textes retenus · {retenus.length}</h2><span className="faint" style={{ fontSize: '12.5px' }}>Rangés dans le brief du projet · les studios les lisent au même endroit</span></div>
        {retenus.length === 0 ? <p className="muted" style={{ fontSize: '12.5px' }} data-etat="sans-texte">Aucun texte retenu.</p> : retenus.map((t) => (
          <div className="prow" key={t.id} data-texte={t.type} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="t">
              <strong style={{ fontSize: '12.5px' }}><span className="pill g">{libelleType(t.type)}</span>{t.langue ? <span className="faint"> {t.langue}</span> : null}</strong>
              {edition?.id === t.id ? (
                <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                  <textarea className="ta" rows={3} value={edition.valeur} aria-label="Modifier le texte" onChange={(e) => setEdition({ id: t.id, valeur: e.target.value })} />
                  <div className="kc">
                    <button className="btn sm pri" type="button" disabled={enCours !== null || !edition.valeur.trim()} onClick={async () => { if (await sauver(retenus.map((x) => (x.id === t.id ? { ...x, texte: edition.valeur } : x)), 'Texte modifié')) setEdition(null); }}>Enregistrer</button>
                    <button className="btn sm" type="button" onClick={() => setEdition(null)}>Annuler</button>
                  </div>
                </div>
              ) : <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 4 }}>{t.texte}</p>}
              {t.sources.length > 0 && <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>Sources · {t.sources.map((s) => `${s} (${libelleFait(s)})`).join(' · ')}</small>}
              {vue.peutEcrire && (vue.calques.length ? (
                <div className="kc" style={{ marginTop: 6 }}>
                  <select aria-label="Calque texte" value={calque[t.id] ?? vue.calques[0]!.id} onChange={(e) => setCalque((c) => ({ ...c, [t.id]: e.target.value }))}>
                    {vue.calques.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                  <button className="btn sm" type="button" disabled={enCours !== null} onClick={() => void injecter(t)}>Proposer dans ce calque</button>
                </div>
              ) : <small className="faint" style={{ display: 'block', fontSize: '11.5px' }} data-etat="sans-calque">Aucun calque texte dans la mise en page de ce projet · l’injection viendra avec l’éditeur.</small>)}
            </div>
            <div className="kc">
              <button className="btn sm" type="button" onClick={async () => { const ok = await copier(t.texte); dire(ok ? 'ok' : 'err', ok ? 'Texte copié.' : 'Le navigateur a refusé la copie.'); }}><Ic n="copy" />Copier</button>
              {vue.peutEcrire && edition?.id !== t.id && <button className="btn sm" type="button" onClick={() => setEdition({ id: t.id, valeur: t.texte })}><Ic n="brush" />Modifier</button>}
              {vue.peutEcrire && <button className="btn sm" type="button" disabled={enCours !== null} onClick={() => void sauver(retenus.filter((x) => x.id !== t.id), 'Texte retiré')}><Ic n="x" />Retirer</button>}
            </div>
          </div>
        ))}
        <Comparaison textes={tous} />
      </section>
    </Vue>
  );
}

/** Comparer deux textes mot à mot (règle pure `comparerTextes`) · retiré barré, ajouté souligné, le sens porté par le libellé. */
function Comparaison({ textes }: { textes: Array<{ cle: string; libelle: string; texte: string }> }) {
  const [a, setA] = useState(textes[0]?.cle ?? '');
  const [b, setB] = useState(textes[1]?.cle ?? '');
  if (textes.length < 2) return <small className="faint" style={{ fontSize: '11.5px' }} data-etat="comparaison-vide">Deux textes au moins pour comparer.</small>;
  const ta = textes.find((t) => t.cle === a) ?? textes[0]!;
  const tb = textes.find((t) => t.cle === b) ?? textes[1]!;
  const c = comparerTextes(ta.texte, tb.texte);
  return (
    <div className="sugg" data-zone="comparaison" style={{ display: 'grid', gap: 8 }}>
      <strong style={{ fontSize: 13 }}>Comparer deux textes</strong>
      <div className="kc">
        <select aria-label="Texte A" value={ta.cle} onChange={(e) => setA(e.target.value)}>{textes.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}</select>
        <select aria-label="Texte B" value={tb.cle} onChange={(e) => setB(e.target.value)}>{textes.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}</select>
      </div>
      <p style={{ fontSize: 13, whiteSpace: 'pre-wrap' }} aria-label="Différences de A vers B">
        {c.segments.map((s, i) => (s.type === 'egal' ? <span key={i}>{s.texte}</span>
          : s.type === 'retire' ? <del key={i} aria-label={`retiré : ${s.texte}`}>{s.texte}</del>
            : <ins key={i} aria-label={`ajouté : ${s.texte}`}>{s.texte}</ins>))}
      </p>
      <small className="faint" style={{ fontSize: '11.5px' }}>A · {c.longueurA} caractères · B · {c.longueurB} caractères · {c.motsCommuns} mot{c.motsCommuns > 1 ? 's' : ''} en commun</small>
    </div>
  );
}
