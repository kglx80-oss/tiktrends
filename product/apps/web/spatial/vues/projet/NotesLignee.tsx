'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  EXPLICATION_NOTES_SANS_NOEUD, LONGUEUR_MAX_COMMENTAIRE, RAISON_LECTEUR_NOTE, TEXTES_HORS_LIGNE, TEXTES_NOTE, ancreNote, departEditionCommentaire, etatPublicationCommentaire, resumeNotesNoeud,
  type GesteHypotheseNote, type GesteIterationCommentaire,
} from '@tiktrends/core';
import { modifierNoteLignee, noterNoeudLignee, resoudreNoteLignee } from '../../../app/actions/studios/notes-lignee';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Lien } from '../../communs';
import { ChampMentions } from './ChampMentions';
import { ResultatsFil, StatutsHypothesesNote } from './ResultatsFil';
import { CIBLE, Message, RaisonFermee } from './briques';
import { boutonAction, replacerFocus, type OptionsBoutonAction } from './action-serveur';
import { useHorsLigne } from './hors-ligne';
import type { LigneeLibre, NotesLignee, VueNoteLignee } from './types';

/**
 * Lot 11 V5 (PC E11) · les NOTES du canvas de lignée · une note est attachée à
 * UN NŒUD (sa clé stable, l'identifiant de lignée), jamais à un lien, jamais
 * libre · la lignée reste une projection en lecture seule, aucune carte ni
 * aucun trait ne s'ajoute.
 *
 *  · `NotesNoeud` · les notes d'un nœud, ses gestes (écrire, modifier la
 *    sienne · ancien texte gardé et relu sous « Textes précédents », résoudre,
 *    rouvrir) · dans le détail du nœud choisi et sous chaque nœud de « La
 *    lignée en liste » ;
 *  · `NotesSansNoeud` · les notes dont le nœud n'est plus dans la lignée ·
 *    lisibles, sous le libellé du nœud au moment de leur écriture · jamais
 *    supprimées ;
 *  · `useNotesLignee` · l'état partagé · chaque geste passe par la brique
 *    (`boutonAction`), la vue relue remplace l'ancienne, et le focus est
 *    replacé dans un EFFET sur la vue rendue (modèle `ParcoursImage`) · jamais
 *    seulement par `setTimeout(0)`.
 *
 * Le texte d'une note est rendu comme du TEXTE (React l'échappe). Aucune
 * touche nouvelle · tout se fait par des boutons et des champs natifs. Gratuit.
 *
 * Suite du lot 11 · les MENTIONS (le champ des commentaires, `ChampMentions`,
 * ses touches déjà déclarées · « @ » ouvre la liste des membres qui voient le
 * projet) · affichées sous le nom courant, en texte · et deux GESTES, des liens
 * vers les écrans EXISTANTS, qui relisent la note · « Itérer depuis cette
 * note » (nœud création / résultat testé) et « Formuler une hypothèse » (nœud
 * brief / hypothèse) · fermés, leur raison écrite à côté.
 *
 * Et le RÉSULTAT sous la note (suite du lot 11) · l'itération née de la note
 * une fois son lot conclu (« en test » avant), et le statut de l'hypothèse
 * née d'elle · calculés par le serveur à chaque lecture, le rendu partagé avec
 * le commentaire (`ResultatsFil`) · dans le détail du nœud, dans « La lignée
 * en liste » et dans « Notes sans nœud » (le même composant `Note`).
 */

/** La brique, avec la cible tactile de 44 px gardée même fermée. */
const actionCible = (o: OptionsBoutonAction) => { const a = boutonAction(o); return { ...a, style: { ...CIBLE, ...a.style } }; };

type ReponseAction = { ok: boolean; message?: string; traceId?: string; code?: string } & Partial<NotesLignee>;
/** Le retour du dernier geste · dit dans le panneau qui l'a lancé (`lieu`). */
type Retour = { ton: 'ok' | 'err'; texte: string; horsLigne?: boolean; lieu: string } | null;

const dire = (r: ReponseAction) => (r.code === 'VERSION_CONFLICT'
  ? `${r.message ?? 'Cette note a changé depuis l’ouverture de la page.'}`
  : `${r.message ?? 'Refusé.'}${r.traceId ? ` · identifiant support ${r.traceId}` : ''}`);

export interface ControleNotes {
  projectId: string;
  vue: NotesLignee | null;
  erreur: string | null;
  retour: Retour;
  enCours: string | null;
  horsLigne: boolean;
  /** Un geste lancé depuis le panneau `lieu` · `focus` · où le focus va une fois la vue relue RENDUE (premier sélecteur présent). */
  geste: (lieu: string, cle: string, f: () => Promise<ReponseAction>, succes: string, focus: string[], apres?: () => void) => void;
}

/** Le panneau des notes d'un lieu · `detail:<nœud>`, `liste:<nœud>` ou `sans-noeud`. */
const panneauNotes = (lieu: string) => `[data-notes-panneau="${lieu}"]`;

export function useNotesLignee(projectId: string, initial: LigneeLibre['notes']): ControleNotes {
  const { toast } = useSpatial();
  const horsLigne = useHorsLigne();
  const [vue, setVue] = useState<NotesLignee | null>(initial && initial.ok ? initial.vue : null);
  const [retour, setRetour] = useState<Retour>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const operation = useRef(false);
  // Le focus à replacer quand la vue relue sera RENDUE · l'effet le rejoue après le rendu de la vue.
  const focusApresVue = useRef<string[] | null>(null);
  useEffect(() => {
    const cibles = focusApresVue.current;
    if (!cibles) return;
    focusApresVue.current = null;
    replacerFocus('toujours', ...cibles);
  }, [vue]);

  const geste = useCallback<ControleNotes['geste']>((lieu, cle, f, succes, focus, apres) => {
    if (operation.current || horsLigne) return;
    operation.current = true; setEnCours(cle); setRetour(null);
    void (async () => {
      try {
        const r = await f();
        if (!r.ok) { setRetour({ ton: 'err', texte: dire(r), lieu }); return; }
        focusApresVue.current = focus;
        apres?.();
        setVue({ peutEcrire: !!r.peutEcrire, notes: r.notes ?? [], mentionnables: r.mentionnables ?? [] });
        setRetour({ ton: 'ok', texte: succes, lieu }); toast(succes);
      } catch {
        setRetour({ ton: 'err', texte: 'Le serveur ne répond pas · vérifie ta connexion puis réessaie · ton texte est gardé.', horsLigne: true, lieu });
      } finally { setEnCours(null); operation.current = false; }
    })();
  }, [horsLigne, toast]);

  return { projectId, vue, erreur: initial && !initial.ok ? initial.message : null, retour, enCours, horsLigne, geste };
}

/** La lecture des notes a échoué · dit une fois, sous le canvas · le canvas reste. */
export function ErreurNotes({ ctl }: { ctl: ControleNotes }) {
  return ctl.erreur ? <Message ton="err">{ctl.erreur}</Message> : null;
}

/** Le retour du dernier geste, dans le panneau qui l'a lancé. */
function RetourNotes({ ctl, lieu }: { ctl: ControleNotes; lieu: string }) {
  return ctl.retour && ctl.retour.lieu === lieu ? <Message ton={ctl.retour.ton} horsLigne={ctl.retour.horsLigne}>{ctl.retour.texte}</Message> : null;
}

/**
 * Les notes d'UN nœud de la lignée · `lieu` distingue le détail du nœud choisi
 * et la liste (deux panneaux du même nœud, chacun ses champs).
 */
export function NotesNoeud({ noeud, notes, lieu, ctl }: { noeud: { id: string; titre: string }; notes: readonly VueNoteLignee[]; lieu: 'detail' | 'liste'; ctl: ControleNotes }) {
  const id = useId();
  const cle = `${lieu}:${noeud.id}`;
  const p = panneauNotes(cle);
  const [ouvert, setOuvert] = useState(false);
  const [texte, setTexte] = useState('');
  // Les membres choisis dans la liste « @ » · des IDENTIFIANTS, relus par le serveur contre le texte.
  const [choisies, setChoisies] = useState<string[]>([]);
  const peutEcrire = !!ctl.vue?.peutEcrire;
  const publier = etatPublicationCommentaire(texte, { peutProposer: peutEcrire, cibleChoisie: true }, TEXTES_NOTE);
  if (!ctl.vue) return null;
  return (
    <section data-notes-panneau={cle} data-notes-noeud={noeud.id} aria-labelledby={`${id}-titre`} style={{ display: 'grid', gap: 6, marginTop: 4 }}>
      <h3 id={`${id}-titre`} tabIndex={-1} data-titre-notes="" style={{ font: '600 12.5px/1.3 var(--sfd)', color: 'var(--fg)', margin: 0 }}>
        <Ic n="bookmark" /> Notes · {resumeNotesNoeud(notes)}
      </h3>
      {notes.length > 0 && (
        <ul className="tl" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {notes.map((n) => <Note key={n.id} n={n} lieu={cle} ctl={ctl} />)}
        </ul>
      )}
      {!peutEcrire
        ? <p className="faint" data-raison-lecteur-note="" style={{ fontSize: '11.5px', margin: 0, marginLeft: 0 }}>{RAISON_LECTEUR_NOTE}</p>
        : ouvert ? (
          <form data-nouvelle-note="" style={{ display: 'grid', gap: 6 }}
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!publier.ok) return;
              ctl.geste(cle, `poser:${cle}`, () => noterNoeudLignee({ projectId: ctl.projectId, noeud: noeud.id, texte, mentions: choisies }), `Note posée sur « ${noeud.titre} ».`,
                [`${p} [data-geste="ecrire-note"]`, `${p} [data-titre-notes]`], () => { setTexte(''); setChoisies([]); setOuvert(false); });
            }}>
            <ChampMentions libelle={`Note sur « ${noeud.titre} »`} champ="texte-note" valeur={texte} surChange={setTexte} mentionnables={ctl.vue.mentionnables ?? []}
              surChoix={(m) => setChoisies((l) => (l.includes(m) ? l : [...l, m]))} maxLength={LONGUEUR_MAX_COMMENTAIRE}
              placeholder="Ex. l’hypothèse est trop large, à resserrer avant le prochain lot" />
            <span className="kc" style={{ alignItems: 'center' }}>
              <button className="btn sm pri" type="submit" data-geste="poser-note" aria-describedby={!publier.ok ? `${id}-poser` : undefined}
                title={ctl.horsLigne ? TEXTES_HORS_LIGNE.bouton : undefined}
                {...actionCible({ presse: ctl.enCours === `poser:${cle}`, occupe: !!ctl.enCours, ferme: !publier.ok || ctl.horsLigne, focalisable: 'tout' })}>
                <Ic n="bookmark" />{ctl.enCours === `poser:${cle}` ? 'Enregistrement…' : 'Poser la note'}
              </button>
              <button className="btn sm" type="button" data-geste="annuler-note" {...actionCible({ occupe: !!ctl.enCours, surClic: () => { setOuvert(false); replacerFocus('toujours', `${p} [data-geste="ecrire-note"]`, `${p} [data-titre-notes]`); } })}>Annuler</button>
              {!publier.ok && publier.raison && <RaisonFermee id={`${id}-poser`} cle="poser-note">{publier.raison}</RaisonFermee>}
            </span>
          </form>
        ) : (
          <button className="btn sm" type="button" data-geste="ecrire-note" style={{ ...CIBLE, justifySelf: 'start' }} aria-label={`Écrire une note sur « ${noeud.titre} »`}
            onClick={() => { setOuvert(true); replacerFocus('toujours', `${p} [data-champ="texte-note"]`); }}><Ic n="plus" />Écrire une note</button>
        )}
      <RetourNotes ctl={ctl} lieu={cle} />
    </section>
  );
}

/** Les notes dont le nœud n'est plus dans la lignée · lisibles, jamais supprimées. */
export function NotesSansNoeud({ notes, ctl }: { notes: readonly VueNoteLignee[]; ctl: ControleNotes }) {
  const id = useId();
  if (!ctl.vue || notes.length === 0) return null;
  return (
    <section className="tile" data-notes-panneau="sans-noeud" data-notes-sans-noeud="" aria-labelledby={`${id}-titre`} style={{ marginTop: 12, display: 'grid', gap: 6 }}>
      <h3 id={`${id}-titre`} tabIndex={-1} data-titre-notes="" style={{ font: '600 13px/1.25 var(--sfd)', color: 'var(--fg)', margin: 0 }}>Notes sans nœud · {notes.length}</h3>
      <p className="faint" style={{ fontSize: '11.5px', margin: 0, marginLeft: 0 }}>{EXPLICATION_NOTES_SANS_NOEUD}</p>
      <ul className="tl" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {notes.map((n) => <Note key={n.id} n={n} lieu="sans-noeud" ctl={ctl} avecNoeud />)}
      </ul>
      <RetourNotes ctl={ctl} lieu="sans-noeud" />
    </section>
  );
}

function Note({ n, lieu, ctl, avecNoeud = false }: { n: VueNoteLignee; lieu: string; ctl: ControleNotes; avecNoeud?: boolean }) {
  const id = useId();
  const panneau = panneauNotes(lieu);
  const [edition, setEdition] = useState<string | null>(null);
  const [mentions, setMentions] = useState<string[]>([]);
  const ici = `${panneau} [data-note="${n.id}"]`;
  const etat = edition !== null ? etatPublicationCommentaire(edition, { peutProposer: n.gestes.modifier.ok, cibleChoisie: true }, TEXTES_NOTE) : null;
  const occupe = !!ctl.enCours;
  return (
    <li data-note={n.id} id={lieu === 'sans-noeud' || lieu.startsWith('detail:') ? ancreNote(n.id) : undefined} tabIndex={-1} data-resolue={n.resolu ? 'oui' : 'non'} className="ev" style={{ fontSize: '12px' }}>
      <span className="ico"><Ic n="bookmark" /></span>
      <span>
        <small className="faint" data-entete-note="" style={{ display: 'block', fontSize: '11.5px' }}>{n.auteur} · {n.quand}{avecNoeud ? ` · sur « ${n.libelleNoeud} »` : ''}</small>
        {edition !== null ? (
          <span style={{ display: 'grid', gap: 6, marginTop: 4 }}>
            <ChampMentions libelle="Modifier ta note" champ="edition-note" valeur={edition} surChange={setEdition} mentionnables={ctl.vue?.mentionnables ?? []}
              surChoix={(m) => setMentions((l) => (l.includes(m) ? l : [...l, m]))} maxLength={LONGUEUR_MAX_COMMENTAIRE} />
            <span className="kc" style={{ alignItems: 'center' }}>
              <button className="btn sm pri" type="button" data-geste="enregistrer-note" aria-describedby={etat && !etat.ok ? `${id}-enr` : undefined}
                {...actionCible({
                  presse: ctl.enCours === `modifier:${n.id}`, occupe, ferme: !etat?.ok || ctl.horsLigne, focalisable: 'tout',
                  surClic: () => ctl.geste(lieu, `modifier:${n.id}`, () => modifierNoteLignee({ noteId: n.id, rowVersion: n.rowVersion, texte: edition, mentions }), 'Note modifiée · l’ancien texte est gardé.',
                    [`${ici} [data-geste="modifier-note"]`, `${panneau} [data-titre-notes]`], () => setEdition(null)),
                })}>{ctl.enCours === `modifier:${n.id}` ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button className="btn sm" type="button" data-geste="annuler-edition-note" {...actionCible({ occupe, surClic: () => { setEdition(null); replacerFocus('toujours', `${ici} [data-geste="modifier-note"]`); } })}>Annuler</button>
              {etat && !etat.ok && etat.raison && <RaisonFermee id={`${id}-enr`} cle="enregistrer-note">{etat.raison}</RaisonFermee>}
            </span>
          </span>
        ) : (
          <span data-texte-note="" style={{ display: 'block', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '12.5px', marginTop: 2 }}>
            {n.segments
              ? n.segments.map((x, i) => (x.type === 'texte'
                ? <span key={i}>{x.texte}</span>
                : <b key={i} data-mention={x.ancien ? 'ancien' : x.id} style={{ fontWeight: 600 }}>{x.nom}</b>))
              : n.texte}
          </span>
        )}
        {edition === null && !!n.resultats?.length && <ResultatsFil fil="note" resultats={n.resultats} />}
        {edition === null && !!n.hypotheses?.length && <StatutsHypothesesNote statuts={n.hypotheses} />}
        {n.modifie && <small className="faint" data-modifie-note="" style={{ display: 'block', fontSize: '11.5px' }}>{n.modifie}</small>}
        {n.anciens.length > 0 && (
          <details data-anciens-textes="" style={{ fontSize: '11.5px' }}>
            <summary className="faint" style={{ ...CIBLE, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Textes précédents · {n.anciens.length}</summary>
            <ol style={{ margin: '4px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
              {n.anciens.map((a, i) => <li key={i} data-ancien-texte=""><span className="faint">Remplacé le {a.quand} · </span><span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{a.texte}</span></li>)}
            </ol>
          </details>
        )}
        {n.resolu && <small className="faint" data-resolue-par="" style={{ display: 'block', fontSize: '11.5px' }}>Résolue par {n.resolu.par} · {n.resolu.quand}</small>}
        {edition === null && n.iterer && <GesteNote geste={n.iterer} cle="iterer-note" icone="loop" auteur={`${n.auteur}, ${n.quand}`} />}
        {edition === null && n.hypothese && <GesteNote geste={n.hypothese} cle="hypothese-note" icone="bulb" auteur={`${n.auteur}, ${n.quand}`} />}
        {edition === null && (n.gestes.modifier.ok || n.gestes.resoudre.ok || n.gestes.rouvrir.ok) && (
          <span className="kc" style={{ marginTop: 6 }}>
            {n.gestes.modifier.ok && <button className="btn sm" type="button" data-geste="modifier-note" aria-label={`Modifier · ta note du ${n.quand}`}
              {...actionCible({ occupe, ferme: ctl.horsLigne, surClic: () => {
                // Le texte affiché (mentions sous le nom courant) et les mentions déjà choisies · la règle des commentaires.
                const d = n.segments ? departEditionCommentaire(n.segments) : { texte: n.texte, mentions: [] };
                setEdition(d.texte); setMentions(d.mentions); replacerFocus('toujours', `${ici} [data-champ="edition-note"]`);
              } })}><Ic n="text" />Modifier</button>}
            {n.gestes.resoudre.ok && <button className="btn sm" type="button" data-geste="resoudre-note" aria-label={`Résoudre · note de ${n.auteur} du ${n.quand}`}
              {...actionCible({
                presse: ctl.enCours === `resoudre:${n.id}`, occupe, ferme: ctl.horsLigne,
                surClic: () => ctl.geste(lieu, `resoudre:${n.id}`, () => resoudreNoteLignee({ noteId: n.id, rowVersion: n.rowVersion, resolue: true }), 'Note résolue · elle reste lisible ici.',
                  [`${ici} [data-geste="rouvrir-note"]`, `${panneau} [data-titre-notes]`]),
              })}><Ic n="check" />{ctl.enCours === `resoudre:${n.id}` ? 'Enregistrement…' : 'Résoudre'}</button>}
            {n.gestes.rouvrir.ok && <button className="btn sm" type="button" data-geste="rouvrir-note" aria-label={`Rouvrir · note de ${n.auteur} du ${n.quand}`}
              {...actionCible({
                presse: ctl.enCours === `rouvrir:${n.id}`, occupe, ferme: ctl.horsLigne,
                surClic: () => ctl.geste(lieu, `rouvrir:${n.id}`, () => resoudreNoteLignee({ noteId: n.id, rowVersion: n.rowVersion, resolue: false }), 'Note rouverte.',
                  [`${ici} [data-geste="resoudre-note"]`, `${panneau} [data-titre-notes]`]),
              })}><Ic n="loop" />{ctl.enCours === `rouvrir:${n.id}` ? 'Enregistrement…' : 'Rouvrir'}</button>}
          </span>
        )}
      </span>
      <span className={`pill ${n.resolu ? 'g' : 'c'}`}>{n.resolu ? 'Résolue' : 'Ouverte'}</span>
    </li>
  );
}

/**
 * Un geste d'une note vers un écran EXISTANT · un LIEN (l'écran d'arrivée relit
 * la note, rien n'est créé avant son clic) · fermé · un bouton focalisable,
 * sa raison écrite à côté.
 */
function GesteNote({ geste, cle, icone, auteur }: { geste: GesteIterationCommentaire | GesteHypotheseNote; cle: 'iterer-note' | 'hypothese-note'; icone: 'loop' | 'bulb'; auteur: string }) {
  const id = useId();
  return (
    <span className="kc" data-geste-note={cle} data-etat={geste.href ? 'ouvert' : 'ferme'} style={{ marginTop: 6, alignItems: 'center' }}>
      {geste.href
        ? <Lien className="btn sm" href={geste.href} data-geste={cle} style={CIBLE} aria-label={`${geste.libelle} · note de ${auteur}`}><Ic n={icone} />{geste.libelle}</Lien>
        : (
          <>
            <button className="btn sm" type="button" data-geste={cle} aria-describedby={`${id}-raison`} {...actionCible({ occupe: false, ferme: true, focalisable: 'tout' })}><Ic n={icone} />{geste.libelle}</button>
            <RaisonFermee id={`${id}-raison`} cle={cle}>{geste.raison}</RaisonFermee>
          </>
        )}
    </span>
  );
}
