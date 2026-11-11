'use client';

import { useId, useMemo, useState } from 'react';
import {
  LECTURE_MAX_JOURNAL, LONGUEUR_MAX_COMMENTAIRE, RAISON_LECTEUR_COMMENTAIRE, TEXTES_HORS_LIGNE, departEditionCommentaire, etatPublicationCommentaire, filtrerCommentaires, resumeJournal,
  type FiltreCommentaires, type JournalProjet, type MembreMentionnable, type ResultatCommentaire, type TypeJournal,
} from '@tiktrends/core';
import { commenterProjet, lireActiviteProjet, modifierCommentaire, resoudreCommentaire } from '../../../app/actions/studios/activite';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Lien } from '../../communs';
import { CIBLE, Message, RaisonFermee } from './briques';
import { boutonAction, replacerFocus, type OptionsBoutonAction } from './action-serveur';
import { useHorsLigne } from './hors-ligne';
import { ChampMentions } from './ChampMentions';
import type { CommentairesProjet, PropsActiviteProjet, VueCommentaire } from './types';

/**
 * Onglet « Activité » de la fiche projet (lot 10 V5 · PC D13, D15, F9, F14,
 * F16 · RJ AC01) · deux tuiles Spatial :
 *
 *  · « Journal du projet » · qui a fait quoi, quand, sur quelle version ·
 *    LU dans le journal des studios, l'historique des versions, les tâches et
 *    les commentaires (rien n'est écrit pour l'afficher) · phrases du noyau
 *    (`journalProjet`), filtre par type et pages relus au serveur
 *    (`lireActiviteProjet`) ;
 *  · « Commentaires » · sur une version ou une création · écrire, modifier le
 *    sien, résoudre / rouvrir · jamais de suppression (un commentaire résolu
 *    reste lu sous « Résolus »). Le texte est rendu comme du TEXTE.
 *    Sur une création testée, ouvert ou résolu · « Itérer depuis ce
 *    commentaire » (`gesteIterationCommentaire`, noyau) · un LIEN vers l'écran
 *    Itérer existant, qui relit tout · fermé, sa raison écrite à côté.
 *    Le RÉSULTAT des itérations nées du commentaire, calculé par le serveur à
 *    chaque lecture (`resultatsCommentaire`) · « en test » avant la conclusion
 *    de leur lot. Les MENTIONS · « @ » ouvre la liste des membres qui voient le
 *    projet (`ChampMentions`, clavier ↑ ↓ Entrée Échap) · affichées sous le nom
 *    courant, en texte.
 *
 * Chaque bouton d'action serveur passe par la brique (`boutonAction`) · un
 * bouton fermé dit pourquoi à côté (`RaisonFermee`). Gratuit.
 */

const ICONE: Record<TypeJournal, 'copy' | 'down' | 'eye' | 'folder' | 'flask' | 'card' | 'spark' | 'bulb' | 'chat' | 'bookmark' | 'more'> = {
  versions: 'copy', exports: 'down', relectures: 'eye', projet: 'folder', tests: 'flask', devis: 'card', generations: 'spark', jarvis: 'bulb', commentaires: 'chat', notes: 'bookmark', autre: 'more',
};

/** La brique, avec la cible tactile de 44 px gardée même fermée (l'aspect fermé s'ajoute, il ne la remplace pas). */
const actionCible = (o: OptionsBoutonAction) => { const a = boutonAction(o); return { ...a, style: { ...CIBLE, ...a.style } }; };

type Retour = { ton: 'ok' | 'err'; texte: string; horsLigne?: boolean } | null;
type ReponseAction = { ok: boolean; message?: string; traceId?: string; code?: string };

const dire = (r: ReponseAction) => (r.code === 'VERSION_CONFLICT'
  ? `${r.message ?? 'Ce commentaire a changé depuis l’ouverture de la page.'}`
  : `${r.message ?? 'Refusé.'}${r.traceId ? ` · identifiant support ${r.traceId}` : ''}`);

export function OngletActivite(p: PropsActiviteProjet) {
  return (
    <>
      <Journal projectId={p.projectId} initial={p.journal} />
      <Commentaires projectId={p.projectId} initial={p.commentaires} />
    </>
  );
}

/* ───────────────────────────── Journal ───────────────────────────── */

function Journal({ projectId, initial }: { projectId: string; initial: PropsActiviteProjet['journal'] }) {
  const id = useId();
  const horsLigne = useHorsLigne();
  const [lu, setLu] = useState<{ journal: JournalProjet; tronque: boolean } | null>(initial.ok ? { journal: initial.journal, tronque: initial.tronque } : null);
  const [erreur, setErreur] = useState<Retour>(initial.ok ? null : { ton: 'err', texte: initial.message });
  const [enCours, setEnCours] = useState<string | null>(null);

  async function charger(cle: string, type: TypeJournal | null, page: number) {
    if (horsLigne) return;
    setEnCours(cle); setErreur(null);
    try {
      const r = await lireActiviteProjet({ projectId, type, page });
      if (!r.ok) { setErreur({ ton: 'err', texte: dire(r) }); return; }
      setLu({ journal: r.journal, tronque: r.tronque });
    } catch {
      setErreur({ ton: 'err', texte: 'Le serveur ne répond pas · vérifie ta connexion puis réessaie.', horsLigne: true });
    } finally { setEnCours(null); }
  }

  const j = lu?.journal ?? null;
  const premiere = !j || j.page <= 1;
  const derniere = !j || j.page >= j.pages;
  return (
    <section className="tile" id="journal" aria-labelledby={`${id}-titre`} data-journal-projet="">
      <div className="sech" style={{ margin: 0 }}>
        <h2 id={`${id}-titre`}>Journal du projet</h2>
        <span className="faint" style={{ fontSize: '12.5px' }}>Qui a fait quoi · lu dans le journal des studios, les versions, les tâches, les commentaires et les notes de la lignée · rien n’est écrit ici</span>
        {horsLigne && <span className="pill w" data-hors-ligne="">{TEXTES_HORS_LIGNE.pastille}</span>}
      </div>
      {j && j.filtres.length > 0 && (
        <div className="seg" role="group" aria-label="Filtrer le journal par type" data-filtres-journal="" style={{ flexWrap: 'wrap', marginTop: 10 }}>
          <button type="button" data-type="" aria-pressed={j.type === null} {...actionCible({ presse: enCours === 'type:', occupe: !!enCours, ferme: horsLigne, aspect: 'feuille', surClic: () => void charger('type:', null, 1) })}>Tout · {j.tous}</button>
          {j.filtres.map((f) => (
            <button key={f.cle} type="button" data-type={f.cle} aria-pressed={j.type === f.cle}
              {...actionCible({ presse: enCours === `type:${f.cle}`, occupe: !!enCours, ferme: horsLigne, aspect: 'feuille', surClic: () => void charger(`type:${f.cle}`, j.type === f.cle ? null : f.cle, 1) })}>{f.libelle} · {f.n}</button>
          ))}
        </div>
      )}
      {j && <p className="faint" role="status" data-resume-journal="" style={{ fontSize: '12.5px', marginTop: 10 }}>{resumeJournal(j)}</p>}
      {lu?.tronque && <p className="faint" data-journal-tronque="" style={{ fontSize: '11.5px', marginTop: 4 }}>Le journal lit les {LECTURE_MAX_JOURNAL} faits les plus récents de chaque source · les plus anciens restent enregistrés.</p>}
      {erreur && <Message ton={erreur.ton} horsLigne={erreur.horsLigne}>{erreur.texte}</Message>}
      {j && j.entrees.length > 0 && (
        <div className="tl" data-entrees-journal="">
          {j.entrees.map((e) => (
            <div className="ev" key={e.id} data-evenement={e.type}>
              <span className="ico"><Ic n={ICONE[e.type]} /></span>
              <span>
                <span data-phrase="">{e.phrase}</span>
                {e.detail && <small className="faint" data-detail="" style={{ display: 'block', fontSize: '11.5px' }}>{e.detail}</small>}
                <small className="faint" data-qui="" style={{ display: 'block', fontSize: '11.5px' }}>{e.quand} · {e.acteur}{e.versionN !== null ? ` · version ${e.versionN}` : ''}</small>
              </span>
              {e.lien ? <Lien className="btn sm" href={e.lien.href} style={CIBLE} aria-label={`${e.lien.libelle} · ${e.phrase}`}>{e.lien.libelle}</Lien> : <span />}
            </div>
          ))}
        </div>
      )}
      {j && j.pages > 1 && (
        <div className="kc" data-pages-journal="" style={{ marginTop: 10, alignItems: 'center' }}>
          <button className="btn sm" type="button" data-page="precedente" aria-describedby={premiere ? `${id}-premiere` : undefined}
            {...actionCible({ presse: enCours === 'page:prec', occupe: !!enCours, ferme: premiere || horsLigne, focalisable: 'tout', surClic: () => void charger('page:prec', j.type, j.page - 1) })}><Ic n="back" />Plus récents</button>
          <button className="btn sm" type="button" data-page="suivante" aria-describedby={derniere ? `${id}-derniere` : undefined}
            {...actionCible({ presse: enCours === 'page:suiv', occupe: !!enCours, ferme: derniere || horsLigne, focalisable: 'tout', surClic: () => void charger('page:suiv', j.type, j.page + 1) })}>Plus anciens<Ic n="arrow" /></button>
          {premiere && <RaisonFermee id={`${id}-premiere`} cle="journal-premiere">Tu lis déjà les plus récents.</RaisonFermee>}
          {derniere && <RaisonFermee id={`${id}-derniere`} cle="journal-derniere">Tu es à la fin du journal.</RaisonFermee>}
        </div>
      )}
    </section>
  );
}

/* ───────────────────────────── Commentaires ───────────────────────────── */

function Commentaires({ projectId, initial }: { projectId: string; initial: PropsActiviteProjet['commentaires'] }) {
  const id = useId();
  const { toast } = useSpatial();
  const horsLigne = useHorsLigne();
  const [liste, setListe] = useState<CommentairesProjet | null>(initial.ok ? initial.liste : null);
  const [retour, setRetour] = useState<Retour>(initial.ok ? null : { ton: 'err', texte: initial.message });
  const [enCours, setEnCours] = useState<string | null>(null);
  const [cible, setCible] = useState<string>(initial.ok ? initial.liste.cibles[0]?.cle ?? '' : '');
  const [texte, setTexte] = useState('');
  const [choisies, setChoisies] = useState<string[]>([]);
  const [filtre, setFiltre] = useState<FiltreCommentaires>('ouverts');
  const [edition, setEdition] = useState<{ id: string; texte: string; mentions: string[] } | null>(null);
  const mentionnables = liste?.mentionnables ?? [];

  const choisie = liste?.cibles.find((c) => c.cle === cible) ?? null;
  const publier = etatPublicationCommentaire(texte, { peutProposer: !!liste?.peutCommenter, cibleChoisie: !!choisie });
  const tous = useMemo(() => liste?.commentaires ?? [], [liste]);
  const vus = useMemo(() => filtrerCommentaires(tous, filtre), [tous, filtre]);
  const compte = (f: FiltreCommentaires) => filtrerCommentaires(tous, f).length;

  async function geste(cle: string, f: () => Promise<ReponseAction & Partial<CommentairesProjet>>, succes: string, apres?: () => void) {
    if (horsLigne) return;
    setEnCours(cle); setRetour(null);
    try {
      const r = await f();
      if (!r.ok) { setRetour({ ton: 'err', texte: dire(r) }); return; }
      setListe({ commentaires: r.commentaires ?? [], cibles: r.cibles ?? liste?.cibles ?? [], peutCommenter: r.peutCommenter ?? false, mentionnables: r.mentionnables ?? [] });
      setRetour({ ton: 'ok', texte: succes }); toast(succes);
      apres?.();
    } catch {
      setRetour({ ton: 'err', texte: 'Le serveur ne répond pas · vérifie ta connexion puis réessaie · ton texte est gardé.', horsLigne: true });
    } finally { setEnCours(null); }
  }

  return (
    <section className="tile sec" id="commentaires" aria-labelledby={`${id}-titre`} data-commentaires-projet="">
      <div className="sech" style={{ margin: 0 }}>
        <h2 id={`${id}-titre`}>Commentaires</h2>
        <span className="faint" style={{ fontSize: '12.5px' }}>Sur une version ou une création · un commentaire se résout, il ne se supprime pas</span>
      </div>
      {liste && (liste.peutCommenter ? (
        <form data-nouveau-commentaire="" style={{ display: 'grid', gap: 8, marginTop: 10 }}
          onSubmit={(ev) => {
            ev.preventDefault();
            if (!publier.ok || !choisie) return;
            void geste('publier', () => commenterProjet({ projectId, cible: choisie.type, cibleId: choisie.id, texte, mentions: choisies }), `Commentaire publié sur ${choisie.libelle}.`, () => { setTexte(''); setChoisies([]); });
          }}>
          <label className="field">Sur
            <select value={cible} data-champ="cible-commentaire" style={CIBLE} onChange={(ev) => setCible(ev.target.value)}>
              {liste.cibles.map((c) => <option key={c.cle} value={c.cle}>{c.libelle}</option>)}
            </select>
          </label>
          <ChampMentions libelle="Commentaire" champ="texte-commentaire" valeur={texte} surChange={setTexte} mentionnables={mentionnables}
            surChoix={(m) => setChoisies((l) => (l.includes(m) ? l : [...l, m]))} maxLength={LONGUEUR_MAX_COMMENTAIRE}
            placeholder="Ex. le produit est flou sur la création 2, à reprendre avant export" />
          <div className="kc" style={{ alignItems: 'center' }}>
            <button className="btn sm pri" type="submit" data-geste="publier-commentaire" aria-describedby={!publier.ok ? `${id}-publier` : undefined}
              title={horsLigne ? TEXTES_HORS_LIGNE.bouton : undefined}
              {...actionCible({ presse: enCours === 'publier', occupe: !!enCours, ferme: !publier.ok || horsLigne, focalisable: 'tout' })}><Ic n="chat" />{enCours === 'publier' ? 'Publication…' : 'Publier'}</button>
            {!publier.ok && publier.raison && <RaisonFermee id={`${id}-publier`} cle="publier-commentaire">{publier.raison}</RaisonFermee>}
          </div>
        </form>
      ) : <p className="faint" data-raison-lecteur="" style={{ fontSize: '12.5px', marginTop: 10 }}>{RAISON_LECTEUR_COMMENTAIRE}</p>)}
      {retour && <Message ton={retour.ton} horsLigne={retour.horsLigne}>{retour.texte}</Message>}
      {liste && tous.length > 0 && (
        <div className="seg" role="group" aria-label="Filtrer les commentaires" data-filtres-commentaires="" style={{ marginTop: 10 }}>
          {(['ouverts', 'resolus', 'tous'] as const).map((f) => (
            <button key={f} type="button" data-filtre={f} aria-pressed={filtre === f} style={CIBLE} onClick={() => setFiltre(f)}>
              {f === 'ouverts' ? 'Ouverts' : f === 'resolus' ? 'Résolus' : 'Tous'} · {compte(f)}
            </button>
          ))}
        </div>
      )}
      {liste && (tous.length === 0
        ? <p className="muted" data-commentaires-vide="" style={{ fontSize: '12.5px', marginTop: 10 }}>Aucun commentaire sur ce projet.</p>
        : vus.length === 0
          ? <p className="muted" data-commentaires-vide="" style={{ fontSize: '12.5px', marginTop: 10 }}>{filtre === 'ouverts' ? 'Aucun commentaire ouvert · les résolus restent lisibles sous « Résolus ».' : 'Aucun commentaire résolu.'}</p>
          : (
            <div className="tl" data-liste-commentaires="">
              {vus.map((c) => (
                <Commentaire key={c.id} c={c} enCours={enCours} horsLigne={horsLigne} edition={edition?.id === c.id ? edition.texte : null} mentionnables={mentionnables}
                  ouvrirEdition={() => setEdition({ id: c.id, ...departEditionCommentaire(c.segments) })}
                  changerEdition={(t) => setEdition((e) => (e && e.id === c.id ? { ...e, texte: t } : e))}
                  choisirMention={(m) => setEdition((e) => (e && e.id === c.id && !e.mentions.includes(m) ? { ...e, mentions: [...e.mentions, m] } : e))}
                  fermerEdition={() => setEdition(null)}
                  enregistrer={(t) => void geste(`modifier:${c.id}`, () => modifierCommentaire({ commentId: c.id, rowVersion: c.rowVersion, texte: t, mentions: edition?.id === c.id ? edition.mentions : [] }), 'Commentaire modifié · l’ancien texte est gardé.', () => {
                    setEdition(null); replacerFocus('toujours', `[data-commentaire="${c.id}"] [data-geste="modifier-commentaire"]`, '[data-champ="texte-commentaire"]');
                  })}
                  resoudre={(resolu) => void geste(`${resolu ? 'resoudre' : 'rouvrir'}:${c.id}`, () => resoudreCommentaire({ commentId: c.id, rowVersion: c.rowVersion, resolu }),
                    resolu ? 'Commentaire résolu · il reste lisible sous « Résolus ».' : 'Commentaire rouvert.',
                    () => replacerFocus('toujours', `[data-commentaire="${c.id}"] [data-geste="${resolu ? 'rouvrir' : 'resoudre'}-commentaire"]`, '[data-filtres-commentaires] button[aria-pressed="true"]'))} />
              ))}
            </div>
          ))}
    </section>
  );
}

function Commentaire({ c, enCours, horsLigne, edition, mentionnables, ouvrirEdition, changerEdition, choisirMention, fermerEdition, enregistrer, resoudre }: {
  c: VueCommentaire; enCours: string | null; horsLigne: boolean; edition: string | null; mentionnables: readonly MembreMentionnable[];
  ouvrirEdition: () => void; changerEdition: (t: string) => void; choisirMention: (id: string) => void; fermerEdition: () => void; enregistrer: (t: string) => void; resoudre: (resolu: boolean) => void;
}) {
  const id = useId();
  const etat = edition !== null ? etatPublicationCommentaire(edition, { peutProposer: c.gestes.modifier.ok, cibleChoisie: true }) : null;
  return (
    <div className="ev" data-commentaire={c.id} data-resolu={c.resolu ? 'oui' : 'non'}>
      <span className="ico"><Ic n="chat" /></span>
      <span>
        <small className="faint" data-entete-commentaire="" style={{ display: 'block', fontSize: '11.5px' }}>{c.auteur} · {c.quand} · sur {c.cible.libelle}</small>
        {edition !== null ? (
          <span style={{ display: 'grid', gap: 6, marginTop: 4 }}>
            <ChampMentions libelle="Modifier ton commentaire" champ="edition-commentaire" valeur={edition} surChange={changerEdition} surChoix={choisirMention}
              mentionnables={mentionnables} maxLength={LONGUEUR_MAX_COMMENTAIRE} />
            <span className="kc" style={{ alignItems: 'center' }}>
              <button className="btn sm pri" type="button" data-geste="enregistrer-commentaire" aria-describedby={etat && !etat.ok ? `${id}-enr` : undefined}
                {...actionCible({ presse: enCours === `modifier:${c.id}`, occupe: !!enCours, ferme: !etat?.ok || horsLigne, focalisable: 'tout', surClic: () => enregistrer(edition) })}>{enCours === `modifier:${c.id}` ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button className="btn sm" type="button" data-geste="annuler-edition" {...actionCible({ occupe: !!enCours, surClic: fermerEdition })}>Annuler</button>
              {etat && !etat.ok && etat.raison && <RaisonFermee id={`${id}-enr`} cle="enregistrer-commentaire">{etat.raison}</RaisonFermee>}
            </span>
          </span>
        ) : (
          <span data-texte-commentaire="" style={{ display: 'block', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '12.5px', marginTop: 2 }}>
            {c.segments.map((s, i) => (s.type === 'texte'
              ? <span key={i}>{s.texte}</span>
              : <b key={i} data-mention={s.ancien ? 'ancien' : s.id} style={{ fontWeight: 600 }}>{s.nom}</b>))}
          </span>
        )}
        {edition === null && c.resultats.length > 0 && <ResultatsCommentaire resultats={c.resultats} />}
        {c.modifie && <small className="faint" data-modifie="" style={{ display: 'block', fontSize: '11.5px' }}>{c.modifie}</small>}
        {c.resolu && <small className="faint" data-resolu-par="" style={{ display: 'block', fontSize: '11.5px' }}>Résolu par {c.resolu.par} · {c.resolu.quand}</small>}
        {edition === null && c.iterer && (
          <span className="kc" data-iterer-commentaire={c.iterer.href ? 'ouvert' : 'ferme'} style={{ marginTop: 6, alignItems: 'center' }}>
            {c.iterer.href
              ? <Lien className="btn sm" href={c.iterer.href} data-geste="iterer-commentaire" style={CIBLE} aria-label={`${c.iterer.libelle} · ${c.auteur}, ${c.quand}`}><Ic n="loop" />{c.iterer.libelle}</Lien>
              : (
                <>
                  <button className="btn sm" type="button" data-geste="iterer-commentaire" aria-describedby={`${id}-iterer`} {...actionCible({ occupe: false, ferme: true, focalisable: 'tout' })}><Ic n="loop" />{c.iterer.libelle}</button>
                  <RaisonFermee id={`${id}-iterer`} cle="iterer-commentaire">{c.iterer.raison}</RaisonFermee>
                </>
              )}
          </span>
        )}
        {edition === null && (c.gestes.modifier.ok || c.gestes.resoudre.ok || c.gestes.rouvrir.ok) && (
          <span className="kc" style={{ marginTop: 6 }}>
            {c.gestes.modifier.ok && <button className="btn sm" type="button" data-geste="modifier-commentaire" aria-label={`Modifier · ton commentaire du ${c.quand}`}
              {...actionCible({ occupe: !!enCours, ferme: horsLigne, surClic: ouvrirEdition })}><Ic n="text" />Modifier</button>}
            {c.gestes.resoudre.ok && <button className="btn sm" type="button" data-geste="resoudre-commentaire" aria-label={`Résoudre · commentaire de ${c.auteur} du ${c.quand}`}
              {...actionCible({ presse: enCours === `resoudre:${c.id}`, occupe: !!enCours, ferme: horsLigne, surClic: () => resoudre(true) })}><Ic n="check" />{enCours === `resoudre:${c.id}` ? 'Enregistrement…' : 'Résoudre'}</button>}
            {c.gestes.rouvrir.ok && <button className="btn sm" type="button" data-geste="rouvrir-commentaire" aria-label={`Rouvrir · commentaire de ${c.auteur} du ${c.quand}`}
              {...actionCible({ presse: enCours === `rouvrir:${c.id}`, occupe: !!enCours, ferme: horsLigne, surClic: () => resoudre(false) })}><Ic n="loop" />{enCours === `rouvrir:${c.id}` ? 'Enregistrement…' : 'Rouvrir'}</button>}
          </span>
        )}
      </span>
      <span className={`pill ${c.resolu ? 'g' : 'c'}`}>{c.resolu ? 'Résolu' : 'Ouvert'}</span>
    </div>
  );
}

/**
 * Le résultat des itérations nées du commentaire · calculé par le serveur
 * (`resultatsCommentaire`) · conclue · le statut, le chiffre clé et le lien vers
 * le lot (fermé avec sa raison hors de la marque active) · sinon « en test ».
 */
function ResultatsCommentaire({ resultats }: { resultats: readonly ResultatCommentaire[] }) {
  const id = useId();
  return (
    <span data-resultats-commentaire="" style={{ display: 'grid', gap: 6, marginTop: 6 }}>
      {resultats.map((r, i) => (r.etat === 'conclue' ? (
        <span key={r.adId} data-resultat-commentaire={r.statut} style={{ display: 'grid', gap: 4, fontSize: '11.5px' }}>
          <span><span className={`pill ${r.classe}`.trim()}><Ic n={r.icone} />{r.libelle}</span> <span className="muted" data-chiffre-resultat="">{r.variante} · lot #{r.lot.numero} · {r.chiffre}</span></span>
          {r.lot.href
            ? <Lien className="btn sm" href={r.lot.href} data-lien-lot="" style={{ ...CIBLE, justifySelf: 'start' }} aria-label={`Voir le lot #${r.lot.numero} · ${r.libelle}, ${r.variante}`}>Voir le lot #{r.lot.numero}</Lien>
            : (
              <span className="kc" style={{ alignItems: 'center' }}>
                <button className="btn sm" type="button" data-lien-lot="" aria-describedby={`${id}-lot-${i}`} {...actionCible({ occupe: false, ferme: true, focalisable: 'tout' })}>Voir le lot #{r.lot.numero}</button>
                <RaisonFermee id={`${id}-lot-${i}`} cle="lot-resultat-commentaire">{r.lot.raison}</RaisonFermee>
              </span>
            )}
        </span>
      ) : (
        <span key={r.adId} data-resultat-commentaire="en_test" className="muted" style={{ fontSize: '11.5px' }}>
          <span className="pill c">{r.libelle}</span> {r.variante} · {r.phrase}
        </span>
      )))}
    </span>
  );
}
