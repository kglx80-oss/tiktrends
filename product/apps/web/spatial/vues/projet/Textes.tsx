'use client';

import { Fragment, useEffect, useId, useState } from 'react';
import {
  cleBrouillonTextes, comparerTextes, etatEchecStudio, libelleVariable, mentionAppelTexte, raisonAjoutTexte, raisonFermeture,
  ECHEC_RESEAU_STUDIO, LIBELLES_TYPE_TEXTE, LIBELLES_TYPE_TEXTE_PLURIEL, TONS_ECRITURE, TYPES_TEXTE, VARIANTES_DEFAUT, VARIANTES_MAX,
  type ErreurStudio, type TexteStudio, type TonEcriture, type TypeTexte, type VarianteTexte,
} from '@tiktrends/core';
import type { VueTextes } from '../../../lib/studios/textes/textes';
import { ecrireTextes, enregistrerTextes, exporterTextes, injecterTexte } from '../../../app/actions/studios/textes';
import { MESSAGE_APPEL_PAYANT, resultatPayantIncertain, useAppelPayant } from '../../../lib/studios/appel-payant';
import { useRegime, useSpatial } from '../../coquille/contexte';
import { Ic, Lien, Vue } from '../../communs';
import { boutonAction, replacerFocus } from './action-serveur';
import { EnTeteAtelier } from './Atelier';
import { CIBLE, Message, RaisonFermee } from './briques';
import { useHorsLigne } from './hors-ligne';

/**
 * Atelier « Textes » d'un projet (`/studio/projets/[id]/textes`), porté de
 * l'écran V5 (`EcranTextes` et son assistant, retirés) sur les MÊMES actions ·
 * hooks, corps, CTA et scripts liés au même brief que les studios.
 *
 *  · Écrire avec l'IA · appel texte PAYANT, coût maximal annoncé AVANT le
 *    clic, second clic de confirmation, verrou d'appel payant ; ton et langue
 *    choisis partent avec la demande ; rien n'entre dans le projet sans
 *    « Retenir » ;
 *  · Écrire à la main · aucun appel, mêmes règles (allégation = fait du brief) ;
 *  · Retenus · modifier, retirer, copier, comparer, proposer dans un calque
 *    texte (proposition, rien d'appliqué) ;
 *  · Copier et exporter (Markdown, CSV, JSON) · sans média, sans crédit.
 * Chaque enregistrement crée une version (conflit dit, rien d'écrasé) · un
 * brouillon survit au rechargement après conflit. Le texte venu du modèle est
 * rendu comme TEXTE, jamais comme HTML.
 *
 * Chaque bouton qui part au serveur passe par la brique `boutonAction` ·
 * le bouton pressé garde le focus et dit qu'il travaille, un bouton fermé dit
 * pourquoi à côté de lui, hors ligne rien ne part (`useHorsLigne`), et quand
 * la ligne disparaît (texte retenu, retiré, modification enregistrée) le focus
 * rejoint la suite logique (`replacerFocus`), jamais `<body>`.
 */
const TITRE_RETENUS = '[data-titre="retenus"]';
const ROLE_LECTURE = 'Ton rôle permet de lire et d’exporter, pas d’écrire.';

export interface PropsTextes {
  vue: VueTextes;
  atelier: ReadonlyArray<{ segment: string; href: string | null }>;
}

type Edition = Pick<TexteStudio, 'type' | 'langue' | 'texte' | 'sources'>;
/** Langues d'écriture proposées · le serveur accepte un code de deux lettres, `fr` par défaut. */
const LANGUES: ReadonlyArray<{ code: string; libelle: string }> = [{ code: 'fr', libelle: 'Français' }, { code: 'en', libelle: 'Anglais' }, { code: 'de', libelle: 'Allemand' }];
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
  const regime = useRegime();
  const appel = useAppelPayant(vue.projet.id, 'textes');
  const [version, setVersion] = useState(vue.version);
  const [retenus, setRetenus] = useState<TexteStudio[]>(vue.textes);
  const [proposees, setProposees] = useState<VarianteTexte[]>([]);
  const [ecartees, setEcartees] = useState<Array<{ id: string; raison: string }>>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [type, setType] = useState<TypeTexte>('hook');
  const [ton, setTon] = useState<TonEcriture>(TONS_ECRITURE[0]);
  const [langue, setLangue] = useState('fr');
  const idTitreManuel = useId();
  const idRaisonAjout = useId();
  const id = useId();
  const horsLigne = useHorsLigne();
  const limite = vue.limites.find((l) => l.type === type)!;
  const [nombre, setNombre] = useState(VARIANTES_DEFAUT);
  const [max, setMax] = useState<Record<string, number>>({});
  const maxType = max[type] ?? limite.max;
  const [manuel, setManuel] = useState<Edition>({ type: 'hook', langue: 'fr', texte: '', sources: [] });
  const [edition, setEdition] = useState<{ id: string; valeur: string } | null>(null);
  const [calque, setCalque] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<string | null>(null);
  const [arme, setArme] = useState(false);
  const [retour, setRetour] = useState<{ ton: 'ok' | 'err'; texte: string; conflit?: boolean; lien?: boolean; code?: string } | null>(null);
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
  const dire = (t: 'ok' | 'err', texte: string, o: { conflit?: boolean; lien?: boolean; code?: string } = {}) => { setRetour({ ton: t, texte, ...o }); if (t === 'ok') toast(texte); };
  const echec = retour?.ton === 'err' && retour.code ? etatEchecStudio(retour.code) : null;

  async function sauver(nom: string, liste: Edition[], ok: string): Promise<boolean> {
    if (horsLigne) return false;
    setEnCours(nom); setRetour(null);
    try {
      const r = await enregistrerTextes({ projectId: vue.projet.id, baseVersionId: version.id, textes: liste });
      if (!r.ok) { dire('err', messageErreur(r), { conflit: r.code === 'VERSION_CONFLICT', code: r.code }); return false; }
      setVersion({ id: r.version.id, n: r.version.n });
      setRetenus(r.textes);
      dire('ok', r.inchange ? 'Aucun changement à enregistrer.' : `${ok} · version ${r.version.n}.`);
      return true;
    } catch { dire('err', 'Le serveur n’a pas répondu · rien n’a été enregistré.', { code: ECHEC_RESEAU_STUDIO }); return false; }
    finally { setEnCours(null); }
  }

  async function ecrire() {
    if (horsLigne) return;
    const tentative = appel.commencer();
    if (!tentative) return;
    setArme(false); setEnCours('ecrire'); setRetour(null); setQuestions([]);
    // La confirmation disparaît · « Écrire », pressé, reprend le focus.
    replacerFocus('si-perdu', '[data-bouton="ecrire"]');
    try {
      const r = await ecrireTextes({ projectId: vue.projet.id, baseVersionId: version.id, type, nombre, maxCaracteres: maxType, langue, ton });
      appel.terminer(tentative, resultatPayantIncertain(r));
      if (!r.ok) { dire('err', messageErreur(r), { conflit: r.code === 'VERSION_CONFLICT', code: r.code }); return; }
      if (r.statut === 'questions') { setQuestions(r.questions); return; }
      setProposees(r.variantes); setEcartees(r.ecartees);
    } catch { appel.terminer(tentative, true); dire('err', MESSAGE_APPEL_PAYANT, { code: ECHEC_RESEAU_STUDIO }); }
    finally { setEnCours(null); replacerFocus('si-perdu', '[data-bouton="ecrire"]', '[data-variante="1"] [data-geste="retenir"]', TITRE_RETENUS); }
  }

  async function exporter(format: 'markdown' | 'csv' | 'json') {
    if (horsLigne) return;
    setEnCours(`export-${format}`); setRetour(null);
    try {
      const r = await exporterTextes({ projectId: vue.projet.id, versionId: version.id, format });
      if (!r.ok) { dire('err', messageErreur(r), { code: r.code }); return; }
      const url = URL.createObjectURL(new Blob([r.contenu], { type: `${r.typeMime};charset=utf-8` }));
      const a = document.createElement('a');
      a.href = url; a.download = r.nomFichier; a.click();
      URL.revokeObjectURL(url);
      dire('ok', `Export ${r.nomFichier} · aucun média lancé, rien de facturé.`);
    } catch { dire('err', 'Le serveur n’a pas répondu · aucun fichier exporté. Vérifie ta connexion puis réessaie.', { code: ECHEC_RESEAU_STUDIO }); }
    finally { setEnCours(null); }
  }

  async function injecter(t: TexteStudio) {
    const layerId = calque[t.id] ?? vue.calques[0]?.id;
    if (!layerId || horsLigne) return;
    setEnCours(`injecter-${t.id}`); setRetour(null);
    try {
      const r = await injecterTexte({ projectId: vue.projet.id, baseVersionId: version.id, layerId, texte: t.texte });
      if (!r.ok) { dire('err', messageErreur(r), { conflit: r.code === 'VERSION_CONFLICT', code: r.code }); return; }
      const nom = vue.calques.find((c) => c.id === layerId)?.nom ?? layerId;
      const deja = r.statut === 'proposee' && r.deja === true;
      dire('ok', deja
        ? `Cette proposition existait déjà pour le calque « ${nom} » · aucun doublon créé. Rien n’est appliqué tant que tu ne l’appliques pas depuis le projet.`
        : `Proposition créée pour le calque « ${nom} » · rien n’est appliqué tant que tu ne l’appliques pas depuis le projet.`, { lien: true });
    } catch { dire('err', 'Le serveur n’a pas répondu · la proposition a pu être créée. Réessaie : une demande déjà enregistrée ne crée jamais de doublon.', { code: ECHEC_RESEAU_STUDIO }); }
    finally { setEnCours(null); }
  }

  // Les raisons écrites à côté des boutons fermés · l'action en cours n'en est pas une (le bouton pressé le dit lui-même).
  // L'état de l'appel payant n'est lu qu'au navigateur (`initializing` au rendu serveur) · la cause durable passe d'abord.
  const raisonEcrire = raisonFermeture(horsLigne, !d.disponible && `Indisponible · ${d.raison}`, !vue.peutEcrire && ROLE_LECTURE, !vue.brief && 'Ce projet n’a pas de brief · les textes s’écrivent à partir du brief.',
    appel.bloque && (appel.etat === 'initializing' ? 'Vérification de l’appel précédent…' : 'Bloqué tant que l’appel précédent n’est pas confirmé · consulte le suivi du projet.'));
  const raisonAjout = raisonFermeture(horsLigne, raisonAjoutTexte({ peutEcrire: vue.peutEcrire, briefPresent: !!vue.brief, enCours: false, texte: manuel.texte }));
  const raisonEcrireRetenu = raisonFermeture(horsLigne, !vue.peutEcrire && ROLE_LECTURE);
  const occupe = enCours !== null;
  const raisonModification = (valeur: string) => raisonFermeture(horsLigne, !valeur.trim() && 'Écris un texte pour pouvoir l’enregistrer.');
  /** La ligne d'un texte retenu disparaît · le focus va au texte suivant, sinon au précédent, sinon au titre de la liste. */
  const focusApresRetrait = (i: number) => {
    const reste = retenus.filter((_, k) => k !== i);
    const voisin = reste[Math.min(i, reste.length - 1)];
    replacerFocus('si-perdu', ...(voisin ? [`[data-texte-id="${voisin.id}"] [data-geste="retirer"]`, `[data-texte-id="${voisin.id}"] [data-geste="copier"]`] : []), TITRE_RETENUS);
  };
  const coutEcriture = mentionAppelTexte(regime, d.coutMaxUsd);
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
          <Message ton={retour.ton} horsLigne={retour.code === ECHEC_RESEAU_STUDIO} etiquette={retour.ton === 'err' ? echec?.mot : undefined}>
            · {retour.texte}{retour.lien && <> <Lien href={`/studio/projets/${vue.projet.id}#propositions`}>Ouvrir le projet</Lien></>}
          </Message>
          {retour.conflit && <button className="btn sm" type="button" onClick={recharger} style={{ ...CIBLE, marginTop: 8 }}>Recharger la version courante</button>}
        </div>
      )}

      <div className="grid2">
        <section className="tile" data-zone="brief">
          <div className="lbl">Le brief partagé</div>
          {vue.brief ? (
            <div className="tl">
              <div className="ev"><span className="ico"><Ic n="flask" /></span><span>Objectif<small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{vue.brief.objectif || 'à préciser'}</small></span></div>
              <div className="ev"><span className="ico"><Ic n="bulb" /></span><span>Hypothèse<small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{vue.brief.hypothese ?? 'aucune'}</small></span></div>
              <div className="ev"><span className="ico"><Ic n="loop" /></span><span>Variable testée<small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>{vue.brief.variable ? libelleVariable(vue.brief.variable) : 'à préciser'}</small></span></div>
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
            <label className="field">Ton
              <select value={ton} onChange={(e) => { setTon(e.target.value as TonEcriture); setArme(false); }}>{TONS_ECRITURE.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            </label>
            <label className="field">Langue
              <select value={langue} onChange={(e) => { setLangue(e.target.value); setArme(false); }}>{LANGUES.map((l) => <option key={l.code} value={l.code}>{l.libelle}</option>)}</select>
            </label>
          </div>
          <small className="faint" style={{ fontSize: '11.5px' }}>{limite.mesuree ? `${limite.max} · palier mesuré où la police de l’accroche atteint son plancher.` : `${limite.max} · borne du contrat, aucune limite mesurée pour ce type · resserre-la si besoin.`}</small>
          {arme ? (
            <div className="sugg" data-confirmation="ecrire">
              <p style={{ fontSize: '12.5px' }}>{coutEcriture}. Aucun média, rien d’enregistré sans « Retenir ».</p>
              <div className="kc" style={{ marginTop: 8, alignItems: 'center' }}>
                <button className="btn sm pri" type="button" data-bouton="confirmer-ecrire" style={CIBLE} aria-describedby={raisonEcrire ? `${id}-ecrire` : undefined}
                  {...boutonAction({ occupe, ferme: !!raisonEcrire, surClic: () => void ecrire() })}>{`Confirmer · ${libelleEcrire.toLowerCase()}`}</button>
                <button className="btn sm" type="button" style={CIBLE} onClick={() => { setArme(false); replacerFocus('toujours', '[data-bouton="ecrire"]'); }}>Annuler</button>
              </div>
            </div>
          ) : (
            <div className="kc" style={{ alignItems: 'center' }}>
              <button className="btn sm pri" type="button" data-bouton="ecrire" style={CIBLE} aria-describedby={raisonEcrire ? `${id}-ecrire` : undefined}
                {...boutonAction({ presse: enCours === 'ecrire', occupe, ferme: !!raisonEcrire, surClic: () => { setArme(true); replacerFocus('toujours', '[data-bouton="confirmer-ecrire"]'); } })}><Ic n="spark" />{enCours === 'ecrire' ? 'Écriture…' : libelleEcrire}</button>
              <small className="faint" style={{ fontSize: '11.5px' }} data-cout="texte">{coutEcriture}</small>
            </div>
          )}
          {raisonEcrire && <RaisonFermee id={`${id}-ecrire`} cle="ecrire">{raisonEcrire}</RaisonFermee>}
          {questions.length > 0 && <Message ton="info">Il manque une précision · {questions.join(' · ')}</Message>}
        </section>
      </div>

      {(proposees.length > 0 || ecartees.length > 0) && (
        <section className="tile sec" style={{ display: 'grid', gap: 8 }} aria-label="Variantes proposées">
          <div className="sech" style={{ margin: 0 }}><h2>Proposés par l’IA</h2><span className="faint" style={{ fontSize: '12.5px' }}>Rien n’entre dans le projet sans « Retenir »</span></div>
          {raisonEcrireRetenu && <RaisonFermee id={`${id}-proposees`} cle="retenir">{raisonEcrireRetenu}</RaisonFermee>}
          {proposees.map((v, i) => (
            <div className="prow" key={v.id} data-variante={i + 1} data-variante-id={v.id} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div className="t">
                <strong style={{ fontSize: '12.5px' }}><span className="pill c">{LIBELLES_TYPE_TEXTE[v.type]} {i + 1}</span> <span className="faint">{v.longueur} / {maxType} caractères</span></strong>
                <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 4 }}>{v.texte}</p>
                {v.sources.length > 0 && <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>Allégations fondées sur · {v.sources.map((s) => `${s} (${libelleFait(s)})`).join(' · ')}</small>}
                {v.horsVariable && <small style={{ display: 'block', fontSize: '11.5px' }}><span className="pill w">Hors variable</span> Change « {v.variable} » et non la variable du test · le test ne l’isolerait pas.</small>}
              </div>
              <div className="kc" style={{ alignItems: 'center' }}>
                <button className="btn sm pri" type="button" data-geste="retenir" style={CIBLE} aria-label={`${enCours === `retenir-${v.id}` ? 'Enregistrement…' : 'Retenir'} · ${LIBELLES_TYPE_TEXTE[v.type]} ${i + 1}`} aria-describedby={raisonEcrireRetenu ? `${id}-proposees` : undefined}
                  {...boutonAction({ presse: enCours === `retenir-${v.id}`, occupe, ferme: !!raisonEcrireRetenu, surClic: async () => {
                    if (!(await sauver(`retenir-${v.id}`, [...retenus, v], 'Texte retenu'))) return;
                    const suivante = proposees.filter((x) => x.id !== v.id)[Math.min(i, proposees.length - 2)];
                    setProposees((p) => p.filter((x) => x.id !== v.id));
                    replacerFocus('si-perdu', ...(suivante ? [`[data-variante-id="${suivante.id}"] [data-geste="retenir"]`] : []), TITRE_RETENUS);
                  } })}><Ic n="check" />{enCours === `retenir-${v.id}` ? 'Enregistrement…' : 'Retenir'}</button>
                <button className="btn sm" type="button" style={CIBLE} aria-label={`Copier · ${LIBELLES_TYPE_TEXTE[v.type]} ${i + 1}`} onClick={async () => { const ok = await copier(v.texte); dire(ok ? 'ok' : 'err', ok ? 'Texte copié.' : 'Le navigateur a refusé la copie.'); }}><Ic n="copy" />Copier</button>
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
        <section className="tile" data-zone="ecrire-main" id="ecrire-main" aria-labelledby={idTitreManuel} style={{ display: 'grid', gap: 10 }}>
          <div className="lbl" id={idTitreManuel} style={{ margin: 0 }}>Écrire à la main</div>
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
              <div className="kc" style={{ alignItems: 'center' }}>
                <button className="btn sm pri" type="button" data-geste="ajouter" style={CIBLE} aria-describedby={raisonAjout ? idRaisonAjout : undefined}
                  {...boutonAction({ presse: enCours === 'ajouter', occupe, ferme: raisonAjout !== null, surClic: async () => {
                    if (!(await sauver('ajouter', [...retenus, manuel], 'Texte ajouté'))) return;
                    setManuel({ type: manuel.type, langue: 'fr', texte: '', sources: [] });
                    // Le champ vidé ferme « Ajouter » · le focus revient au champ, prêt pour le texte suivant.
                    replacerFocus('toujours', '[data-zone="ecrire-main"] textarea');
                  } })}>{enCours === 'ajouter' ? 'Ajout…' : 'Ajouter aux textes retenus'}</button>
                {raisonAjout && <RaisonFermee id={idRaisonAjout} cle="ajouter" data-raison="ajout">{raisonAjout}</RaisonFermee>}
              </div>
            </>
          ) : <small className="faint" style={{ fontSize: '11.5px' }}>{ROLE_LECTURE}</small>}
        </section>

        <section className="tile" data-zone="export" style={{ display: 'grid', gap: 10, alignContent: 'start' }}>
          <div className="lbl" style={{ margin: 0 }}>Copier et exporter</div>
          <small className="faint" style={{ fontSize: '11.5px' }}>Pour produire ailleurs · aucune génération, aucun crédit, aucun média.</small>
          <div className="kc" style={{ alignItems: 'center' }}>
            <button className="btn sm" type="button" data-geste="copier-tout" style={CIBLE} disabled={retenus.length === 0} aria-describedby={retenus.length === 0 ? `${id}-copier-tout` : undefined} onClick={async () => { const ok = await copier(retenus.map((t) => `${libelleType(t.type)} · ${t.texte}`).join('\n\n')); dire(ok ? 'ok' : 'err', ok ? 'Tous les textes retenus sont copiés.' : 'Le navigateur a refusé la copie.'); }}><Ic n="copy" />Copier tous les textes</button>
            {vue.peutExporter && (['markdown', 'csv', 'json'] as const).map((f) => (
              <button key={f} className="btn sm" type="button" data-export={f} style={CIBLE} aria-describedby={horsLigne ? `${id}-export` : undefined}
                {...boutonAction({ presse: enCours === `export-${f}`, occupe, ferme: horsLigne, surClic: () => void exporter(f) })}><Ic n="down" />{enCours === `export-${f}` ? 'Export en cours…' : f === 'markdown' ? 'Exporter en Markdown' : f === 'csv' ? 'Exporter en CSV' : 'Exporter en JSON'}</button>
            ))}
          </div>
          {retenus.length === 0 && <RaisonFermee id={`${id}-copier-tout`} cle="copier-tout">Aucun texte retenu à copier · retiens-en un d’abord.</RaisonFermee>}
          {horsLigne && vue.peutExporter && <RaisonFermee id={`${id}-export`} cle="export">{raisonFermeture(true)}</RaisonFermee>}
        </section>
      </div>

      <section className="tile sec" data-zone="retenus" style={{ display: 'grid', gap: 8 }}>
        <div className="sech" style={{ margin: 0 }}><h2 data-titre="retenus" tabIndex={-1}>Textes retenus · {retenus.length}</h2><span className="faint" style={{ fontSize: '12.5px' }}>Rangés dans le brief du projet · les studios les lisent au même endroit</span></div>
        {raisonEcrireRetenu && vue.peutEcrire && retenus.length > 0 && <RaisonFermee id={`${id}-retenus`} cle="retenus">{raisonEcrireRetenu}</RaisonFermee>}
        {retenus.length === 0 ? <p className="muted" style={{ fontSize: '12.5px' }} data-etat="sans-texte">Aucun texte retenu · {vue.peutEcrire ? 'écris-en un à la main ou retiens une variante proposée par l’IA.' : 'une personne qui peut écrire dans le projet les ajoute ici.'}</p> : retenus.map((t, i) => (
          <div className="prow" key={t.id} data-texte={t.type} data-texte-id={t.id} style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div className="t">
              <strong style={{ fontSize: '12.5px' }}><span className="pill g">{libelleType(t.type)}</span>{t.langue ? <span className="faint"> {t.langue}</span> : null}</strong>
              {edition?.id === t.id ? (
                <div style={{ display: 'grid', gap: 6, marginTop: 6 }}>
                  <textarea className="ta" rows={3} value={edition.valeur} aria-label="Modifier le texte" onChange={(e) => setEdition({ id: t.id, valeur: e.target.value })} />
                  <div className="kc" style={{ alignItems: 'center' }}>
                    <button className="btn sm pri" type="button" data-geste="enregistrer-modification" style={CIBLE} aria-describedby={raisonModification(edition.valeur) ? `${id}-modifier-${t.id}` : undefined}
                      {...boutonAction({ presse: enCours === `modifier-${t.id}`, occupe, ferme: !!raisonModification(edition.valeur), surClic: async () => {
                        if (!(await sauver(`modifier-${t.id}`, retenus.map((x) => (x.id === t.id ? { ...x, texte: edition.valeur } : x)), 'Texte modifié'))) return;
                        setEdition(null);
                        replacerFocus('toujours', `[data-texte-id="${t.id}"] [data-geste="modifier"]`, TITRE_RETENUS);
                      } })}>{enCours === `modifier-${t.id}` ? 'Enregistrement…' : 'Enregistrer la modification'}</button>
                    <button className="btn sm" type="button" style={CIBLE} onClick={() => { setEdition(null); replacerFocus('toujours', `[data-texte-id="${t.id}"] [data-geste="modifier"]`); }}>Annuler</button>
                    {raisonModification(edition.valeur) && <RaisonFermee id={`${id}-modifier-${t.id}`} cle="modifier">{raisonModification(edition.valeur)}</RaisonFermee>}
                  </div>
                </div>
              ) : <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 4 }}>{t.texte}</p>}
              {t.sources.length > 0 && <small className="faint" style={{ display: 'block', fontSize: '11.5px' }}>Sources · {t.sources.map((s) => `${s} (${libelleFait(s)})`).join(' · ')}</small>}
              {vue.peutEcrire && (vue.calques.length ? (
                <div className="kc" style={{ marginTop: 6, alignItems: 'center' }}>
                  <select className="dsort" style={{ maxWidth: '100%' }} aria-label="Calque texte" value={calque[t.id] ?? vue.calques[0]!.id} onChange={(e) => setCalque((c) => ({ ...c, [t.id]: e.target.value }))}>
                    {vue.calques.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                  <button className="btn sm" type="button" data-geste="proposer" style={CIBLE} aria-describedby={horsLigne ? `${id}-retenus` : undefined}
                    {...boutonAction({ presse: enCours === `injecter-${t.id}`, occupe, ferme: horsLigne, surClic: () => void injecter(t) })}>{enCours === `injecter-${t.id}` ? 'Proposition…' : 'Proposer dans ce calque'}</button>
                </div>
              ) : <small className="faint" style={{ display: 'block', fontSize: '11.5px' }} data-etat="sans-calque">Aucun calque texte dans la mise en page de ce projet · l’injection viendra avec l’éditeur.</small>)}
            </div>
            <div className="kc" style={{ alignItems: 'center' }}>
              <button className="btn sm" type="button" data-geste="copier" style={CIBLE} aria-label={`Copier · ${libelleType(t.type)} · ${t.texte.slice(0, 40)}`} onClick={async () => { const ok = await copier(t.texte); dire(ok ? 'ok' : 'err', ok ? 'Texte copié.' : 'Le navigateur a refusé la copie.'); }}><Ic n="copy" />Copier</button>
              {vue.peutEcrire && edition?.id !== t.id && <button className="btn sm" type="button" data-geste="modifier" style={CIBLE} aria-label={`Modifier · ${libelleType(t.type)} · ${t.texte.slice(0, 40)}`} onClick={() => { setEdition({ id: t.id, valeur: t.texte }); replacerFocus('toujours', `[data-texte-id="${t.id}"] textarea`); }}><Ic n="brush" />Modifier</button>}
              {vue.peutEcrire && <button className="btn sm" type="button" data-geste="retirer" style={CIBLE} aria-label={`${enCours === `retirer-${t.id}` ? 'Retrait…' : 'Retirer'} · ${libelleType(t.type)} · ${t.texte.slice(0, 40)}`} aria-describedby={horsLigne ? `${id}-retenus` : undefined}
                {...boutonAction({ presse: enCours === `retirer-${t.id}`, occupe, ferme: horsLigne, surClic: async () => { if (await sauver(`retirer-${t.id}`, retenus.filter((x) => x.id !== t.id), 'Texte retiré')) focusApresRetrait(i); } })}><Ic n="x" />{enCours === `retirer-${t.id}` ? 'Retrait…' : 'Retirer'}</button>}
            </div>
          </div>
        ))}
        <Comparaison textes={tous} />
      </section>
    </Vue>
  );
}

/** Un retrait suivi d'un ajout, sans espace entre eux · ils se liraient comme un seul mot (« soif ?Je »). */
const colles = (avant: { type: string; texte: string } | undefined, s: { texte: string }) => avant?.type === 'retire' && !/\s$/.test(avant.texte) && !/^\s/.test(s.texte);

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
        <select className="dsort" style={{ maxWidth: '100%' }} aria-label="Texte A" value={ta.cle} onChange={(e) => setA(e.target.value)}>{textes.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}</select>
        <select className="dsort" style={{ maxWidth: '100%' }} aria-label="Texte B" value={tb.cle} onChange={(e) => setB(e.target.value)}>{textes.map((t) => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}</select>
      </div>
      <p style={{ fontSize: 13, whiteSpace: 'pre-wrap' }} aria-label="Différences de A vers B">
        {c.segments.map((s, i) => (s.type === 'egal' ? <span key={i}>{s.texte}</span>
          : s.type === 'retire' ? <del key={i} aria-label={`retiré : ${s.texte}`}>{s.texte}</del>
            : <Fragment key={i}>{colles(c.segments[i - 1], s) && ' '}<ins aria-label={`ajouté : ${s.texte}`}>{s.texte}</ins></Fragment>))}
      </p>
      <small className="faint" style={{ fontSize: '11.5px' }}>A · {c.longueurA} caractères · B · {c.longueurB} caractères · {c.motsCommuns} mot{c.motsCommuns > 1 ? 's' : ''} en commun</small>
    </div>
  );
}
