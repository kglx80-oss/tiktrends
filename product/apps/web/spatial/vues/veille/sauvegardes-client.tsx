'use client';

import { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react';
import {
  COLLECTION_TOUTES, FILTRES_SAUVEGARDES, FORMAT_INCERTAIN, FORMAT_NON_CLASSE, FORMAT_TOUS, TRIS_FORMATS, collectionsSauvegardes, ecrireCollectionSauvegardes, filtrerSauvegardes, MESSAGE_COLLECTION_IGNOREE, lireCollectionSauvegardes, formatFiltrable, provenanceSauvegarde, trierSauvegardes,
  type FiltresSauvegardes, type TriFormats, dansCollection, estFormatCreatif, formatCreatif, formatsPourMedia, mediaAnnonce, verrouAction, videoLisible,
  MESSAGE_TAG_IGNORE, TAG_TOUS, tagsPresents, type TagVeille,
  AFFICHAGE_SAUVEGARDES_COOKIE, COLONNES_LISTE_SAUVEGARDES, ENTETE_SELECTION_SAUVEGARDES, GRILLE_LISTE_SAUVEGARDES, LARGEUR_MIN_LISTE_SAUVEGARDES, ligneListeVeille, porteTag, propositionHypotheseTag, styleTableDefilante, verdictSelectionProjet,
  type AccesHypothese, type AffichageVeille,
} from '@tiktrends/core';
import type { InspoAd } from '@tiktrends/integrations';
import { classerFormatSauvegarde, majSauvegarde, setSavedAdFolder, unsaveAd } from '../../../app/actions/inspo';
import { PopupSauvegarde, type EtatSauvegarde } from './sauvegarde-client';
import { trackSavedAdAction } from '../../../app/actions/adsmap-bridge';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Lien } from '../../communs';
import { Vignette } from './base';
import { BasculeAffichage } from './filtres-locaux-client';
import { FormulerHypotheseTag } from './hypothese-tag-client';
import { FERME } from '../projet/focus';

/**
 * Les collections des Sauvegardes (`div.colls` de la maquette) · une
 * collection = un dossier RÉEL (`saved_ads.folder`). Ranger et retirer passent
 * par les actions existantes (`setSavedAdFolder`, `unsaveAd`) · l'écran ne
 * change qu'après le oui du serveur.
 *
 * Vague 3 · les gestes de l'ancien écran, portés · chercher dans les
 * sauvegardes, classer le FORMAT d'une créa (`classerFormatSauvegarde`, geste
 * explicite « Enregistrer »), et « Préparer un test » dans Résultats
 * (`trackSavedAdAction`, un brouillon · rien n'est lancé, aucune dépense).
 *
 * Vague 4 · ce que l'écran Formats V5 ajoutait · les quatre tris, la file des
 * « incertaines » (à part des non classées), la provenance (sauvegardée le,
 * classée le, par qui) et des filtres de départ lus dans l'adresse.
 *
 * La collection active vit dans l'adresse (`?collection=f:Hiver`) · relue au
 * rendu serveur (`initiale`, validée contre les dossiers réels), réécrite à
 * chaque choix (entrée remplacée, autres paramètres gardés) et relue au
 * montage, quand le routeur restaure la page au retour arrière. Une collection
 * inconnue est ignorée et l'écran le dit (`collectionIgnoree`).
 */


/** Les droits des gestes de la carte, calculés par la page (jamais au client). */
export interface GestesSauvegarde {
  /** Pourquoi le classement est fermé (offre, rôle) · `null` = ouvert. */
  formatFerme: string | null;
  /** « Préparer un test » · ouvert, ou la raison réelle de la fermeture. */
  test: { ouvert: true } | { ouvert: false; raison: string };
}
export interface SauvegardeDonnees {
  id: string;
  platform: string;
  externalId: string;
  ad: InspoAd;
  folder: string | null;
  marque: { nom: string; initiale: string; fond: string };
  source: string;
  image: string | null;
  /** « 21 j + » quand elle tourne au seuil éprouvé du noyau · sinon rien. */
  longue: string | null;
  video: boolean;
  meta: [string, string];
  pastilles: ReadonlyArray<{ libelle: string; classe: '' | 'g' }>;
  cloner: string;
  /** Le format classé (`lireFormatCreatif`) · `null` = non classée · `etat` distingue l'incertaine. */
  format?: { id: string | null; versionAncienne: boolean; etat?: string };
  /** Vague 4 · la provenance (ISO) et les jours de diffusion, pour les tris de l'écran Formats. */
  sauvegardeLe?: string | null;
  classeeLe?: string | null;
  /** Le nom du membre de l'espace qui a classé · lu côté serveur, jamais l'e-mail. */
  auteur?: string | null;
  jours?: number | null;
  /** Lot 6 · les tags posés à la main, la note, et TOUTES les collections (0070 · le dossier en tête). */
  tags?: ReadonlyArray<TagVeille>;
  note?: string | null;
  collections?: readonly string[];
  /** Lot 6 bis · la marque pour laquelle la créa est gardée (`saved_ads.brand_id`, son nom) · `null` = l'espace. */
  pourMarque?: { id: string | null; nom: string | null };
}

/**
 * Lot 6 bis · ce que la page passe aux gestes nouveaux · la marque active (la
 * sélection vers un projet en dépend) et la porte des hypothèses (même calcul
 * que la garde serveur). Absent, ni la proposition d'hypothèse ni la marque
 * active ne sont connues · la sélection reste possible, le verdict la juge.
 */
export interface ContexteSauvegardes {
  marqueActive: { id: string; nom: string } | null;
  hypothese: AccesHypothese | null;
}

export function CollectionsSauvegardes({ items: depart, creerProjet, initiale = COLLECTION_TOUTES, collectionIgnoree = false, gestes, filtresInitiaux = FILTRES_SAUVEGARDES, tagIgnore = false, contexte, affichage: affichageInitial = 'grille' }: { items: ReadonlyArray<SauvegardeDonnees>; creerProjet: string; initiale?: string; collectionIgnoree?: boolean; gestes?: GestesSauvegarde; filtresInitiaux?: FiltresSauvegardes; tagIgnore?: boolean; contexte?: ContexteSauvegardes; affichage?: AffichageVeille }) {
  const [items, setItems] = useState(depart);
  // Lot 6 bis · SV06 (grille / liste, préférence de l'appareil lue au rendu serveur) et SV01 (sélection vers un projet).
  const [affichage, setAffichage] = useState<AffichageVeille>(affichageInitial);
  const [selection, setSelection] = useState<readonly string[]>([]);
  const basculer = (id: string) => setSelection((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const [filtres, setFiltres] = useState<FiltresSauvegardes>(filtresInitiaux);
  const fx = (p: Partial<FiltresSauvegardes>) => setFiltres((x) => ({ ...x, ...p }));
  const [actif, setActif] = useState(initiale);
  const [ignoree, setIgnoree] = useState(collectionIgnoree);
  const choisir = (cle: string) => { setActif(cle); setIgnoree(false); };
  const [enCreation, setEnCreation] = useState<string | null>(null);
  const [saisie, setSaisie] = useState<string | null>(null);
  const collections = useMemo(() => {
    const c = collectionsSauvegardes(items);
    // Une collection nommée mais encore vide · elle existera en base dès qu'une créa y est rangée.
    if (enCreation && !c.some((x) => x.cle === `f:${enCreation}`)) c.splice(c.length - 1, 0, { cle: `f:${enCreation}`, libelle: enCreation, n: 0 });
    return c;
  }, [items, enCreation]);
  // L'adresse suit la collection choisie · entrée remplacée, jamais empilée.
  const premier = useRef(true);
  useEffect(() => {
    if (premier.current) { premier.current = false; return; }
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${ecrireCollectionSauvegardes(window.location.search, actif)}${window.location.hash}`);
  }, [actif]);
  // Au montage · le retour arrière peut restaurer la page rendue sans la collection · on relit l'adresse.
  useEffect(() => {
    const lu = lireCollectionSauvegardes(Object.fromEntries(new URLSearchParams(window.location.search)), collections);
    setActif(lu.cle);
    if (lu.ignoree) {
      setIgnoree(true);
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${ecrireCollectionSauvegardes(window.location.search, lu.cle)}${window.location.hash}`);
    }
    // Au montage seulement · ensuite l'état fait foi et l'adresse le suit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dansVue = items.filter((i) => dansCollection(i.folder, actif, i.collections));
  const filtrables = dansVue.map((i) => ({ i, platform: i.platform, video: i.video, texte: i.ad.body ?? '', annonceur: i.marque.nom, format: formatFiltrable(i.format), tags: i.tags ?? [] }));
  const tagsDispo = tagsPresents(items);
  const tagActif = filtres.tag ?? TAG_TOUS;
  const visibles = (gestes ? trierSauvegardes(filtrerSauvegardes(filtrables, filtres).map((x) => x.i), filtres.tri) : dansVue);
  const incertaines = items.some((i) => i.format?.etat === FORMAT_INCERTAIN) || filtres.format === FORMAT_INCERTAIN;
  const formatsPresents = [...new Set(items.map((i) => i.format?.id).filter((x): x is string => !!x))].filter(estFormatCreatif);
  const plateformes = [...new Set(items.map((i) => i.platform))];
  const dossiers = collections.filter((c) => c.cle.startsWith('f:')).map((c) => c.libelle);
  // La sélection suit les sauvegardes qui RESTENT (une créa retirée en sort) · dans l'ordre où on les a cochées.
  const choisies = selection.map((id) => items.find((i) => i.id === id)).filter((i): i is SauvegardeDonnees => !!i);
  // Le tag filtré revient-il assez dans la marque (règle du noyau, seuil mesuré) ? Sous le seuil · rien.
  const tagFiltre = tagActif !== TAG_TOUS ? tagsDispo.find((t) => t.cle === tagActif) ?? null : null;
  const proposition = tagFiltre && contexte?.hypothese
    ? propositionHypotheseTag(tagFiltre, items.filter((i) => porteTag(i.tags, tagFiltre.cle)).map((i) => ({ id: i.id, annonceur: i.marque.nom })))
    : null;
  const retirer = (id: string) => { setItems((l) => l.filter((x) => x.id !== id)); setSelection((l) => l.filter((x) => x !== id)); };
  return (
    <div className="colls">
      <nav className="tile" aria-label="Collections">
        {collections.map((c) => (
          <button key={c.cle} type="button" aria-pressed={actif === c.cle} onClick={() => choisir(c.cle)}><span>{c.libelle}</span><span className="faint">{c.n}</span></button>
        ))}
        {saisie == null ? (
          <button type="button" onClick={() => setSaisie('')}><Ic n="plus" /> Nouvelle collection</button>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); const n = saisie.trim().slice(0, 60); if (n) { setEnCreation(n); choisir(`f:${n}`); } setSaisie(null); }} style={{ display: 'flex', gap: 6, padding: '4px 6px' }}>
            <input autoFocus value={saisie} onChange={(e) => setSaisie(e.target.value)} placeholder="Nom de la collection" aria-label="Nom de la nouvelle collection" maxLength={60} style={{ flex: 1, minWidth: 0 }} />
            <button className="btn sm" type="submit">Créer</button>
          </form>
        )}
      </nav>
      <div>
        <div className="toolbar">
          {gestes && (
            <div className="fields" style={{ flex: '1 1 100%', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
              <label className="field">Chercher<input type="search" value={filtres.texte} onChange={(e) => fx({ texte: e.target.value })} placeholder="Un mot du texte ou un annonceur" aria-label="Chercher dans les sauvegardes" /></label>
              <label className="field">Format<select value={filtres.format} onChange={(e) => fx({ format: e.target.value })} aria-label="Filtrer par format">
                <option value={FORMAT_TOUS}>Tous les formats</option><option value={FORMAT_NON_CLASSE}>Non classées · à classer</option>
                {incertaines && <option value={FORMAT_INCERTAIN}>Incertaines · exclues des formats</option>}
                {formatsPresents.map((f) => <option key={f} value={f}>{formatCreatif(f).libelle}</option>)}
              </select></label>
              <label className="field">Média<select value={filtres.media} onChange={(e) => fx({ media: e.target.value as FiltresSauvegardes['media'] })} aria-label="Filtrer par média">
                <option value="tous">Vidéos et images</option><option value="video">Vidéos</option><option value="image">Images</option>
              </select></label>
              {plateformes.length > 1 && <label className="field">Plateforme<select value={filtres.plateforme} onChange={(e) => fx({ plateforme: e.target.value })} aria-label="Filtrer par plateforme">
                <option value="tous">Toutes</option>{plateformes.map((x) => <option key={x} value={x}>{x === 'meta' ? 'Meta' : x === 'tiktok' ? 'TikTok' : x === 'google' ? 'Google' : x}</option>)}
              </select></label>}
              {(tagsDispo.length > 0 || tagActif !== TAG_TOUS) && <label className="field">Tags<select value={tagActif} onChange={(e) => fx({ tag: e.target.value })} aria-label="Filtrer par tag" data-filtre-tag-sauvegardes>
                <option value={TAG_TOUS}>Tous les tags</option>{tagsDispo.map((t) => <option key={t.cle} value={t.cle}>{`${t.nom} · ${t.n}`}</option>)}
              </select></label>}
              <label className="field">Tri<select value={filtres.tri} onChange={(e) => fx({ tri: e.target.value as TriFormats })} aria-label="Trier les sauvegardes">
                {TRIS_FORMATS.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
              </select></label>
            </div>
          )}
          {ignoree && <small className="faint" role="status" data-collection-ignoree="1" style={{ flex: '1 1 100%', fontSize: '12.5px' }}>{MESSAGE_COLLECTION_IGNOREE}</small>}
          {tagIgnore && <small className="faint" role="status" data-tag-ignore="1" style={{ flex: '1 1 100%', fontSize: '12.5px' }}>{MESSAGE_TAG_IGNORE}</small>}
          {proposition && contexte?.hypothese && (
            <div className="row" data-proposition-tag={proposition.tag.cle} style={{ flex: '1 1 100%', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <small className="faint" style={{ fontSize: '12.5px' }}>{`« ${proposition.tag.nom} » revient sur ${proposition.total} sauvegardes de la marque, chez ${proposition.annonceurs} annonceurs`}</small>
              <FormulerHypotheseTag proposition={proposition} acces={contexte.hypothese} />
            </div>
          )}
          <span className="faint" style={{ fontSize: '12.5px' }}>{visibles.length} créa{visibles.length > 1 ? 's' : ''}{actif === `f:${enCreation}` && visibles.length === 0 ? ` · range une créa dans « ${enCreation} » depuis son bouton « Gardée »` : ''}</span>
          <BasculeAffichage affichage={affichage} changer={setAffichage} cookie={AFFICHAGE_SAUVEGARDES_COOKIE} />
          <CreerProjetSelection choisies={choisies} creerProjet={creerProjet} marqueActive={contexte?.marqueActive ?? null} vider={() => setSelection([])} />
        </div>
        {affichage === 'liste'
          ? <ListeSauvegardes items={visibles} selection={selection} basculer={basculer} />
          : (
            <div className="vfeed" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
              {visibles.map((i) => (
                <CarteSauvegarde key={i.id} i={i} dossiers={dossiers} gestes={gestes} choisie={selection.includes(i.id)} basculer={() => basculer(i.id)}
                  range={(folder) => setItems((l) => l.map((x) => (x.id === i.id ? { ...x, folder, collections: folder ? [folder] : [] } : x)))}
                  maj={(e) => setItems((l) => l.map((x) => (x.id !== i.id ? x : !e.sauvee ? x : { ...x, tags: e.tags, ...(e.note !== undefined ? { note: e.note } : {}), ...(e.collections ? { collections: e.collections, folder: e.collections[0] ?? null } : {}) })))}
                  retire={() => retirer(i.id)}
                  classe={(id, date) => setItems((l) => l.map((x) => (x.id === i.id ? { ...x, format: { id, versionAncienne: false, etat: id ? 'classe' : FORMAT_NON_CLASSE }, classeeLe: id ? date : null, auteur: null } : x)))} />
              ))}
            </div>
          )}
      </div>
    </div>
  );
}

function CarteSauvegarde({ i, dossiers, range, retire, gestes, classe, maj, choisie, basculer }: { i: SauvegardeDonnees; dossiers: string[]; range: (f: string | null) => void; retire: () => void; gestes?: GestesSauvegarde; classe: (id: string | null, date: string | null) => void; maj: (e: EtatSauvegarde) => void; choisie: boolean; basculer: () => void }) {
  const [menu, setMenu] = useState(false);
  const [popup, setPopup] = useState(false);
  const [attente, demarrer] = useTransition();
  const verrou = useRef(verrouAction());
  const { toast } = useSpatial();
  const gardee = useRef<HTMLButtonElement>(null);
  // Échap referme le menu et rend le focus au bouton « Gardée » (ex sélecteur de board V5).
  useEffect(() => {
    if (!menu) return;
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); gardee.current?.focus(); } };
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [menu]);
  const agir = (faire: () => Promise<{ ok: boolean; error?: string }>, ok: () => void, message: string) => {
    if (!verrou.current.tenter()) return;
    setMenu(false);
    demarrer(async () => {
      try { const r = await faire(); if (r.ok) { ok(); toast(message); } else toast(r.error ?? 'Action refusée.'); }
      catch { toast('Échec · vérifie ta connexion puis réessaie.'); }
      finally { verrou.current.relacher(); }
    });
  };
  const cible = { platform: i.platform, externalId: i.externalId };
  return (
    <article className="vitem">
      <div className="who"><span className="av" style={{ background: i.marque.fond }}>{i.marque.initiale}</span>{i.marque.nom}<span className="faint">{i.source}</span></div>
      <div style={{ position: 'relative' }}>
        <Vignette image={i.image} />
        {i.longue && <span className="scale">{i.longue}</span>}
        {i.video && (() => { const v = videoLisible(i.ad); return v
          ? <a className="play" href={v} target="_blank" rel="noopener noreferrer" aria-label={`Lire la vidéo de ${i.marque.nom}`}><Ic n="arrow" /></a>
          : <span className="play"><Ic n="arrow" /></span>; })()}
      </div>
      <div className="vmeta"><span>{i.meta[0]}</span><span>{i.meta[1]}</span></div>
      <div className="row">{i.pastilles.map((p) => <span key={p.libelle} className={`pill ${p.classe}`.trim()}>{p.libelle}</span>)}</div>
      {(i.tags?.length ?? 0) > 0 && <TagsSauvegarde i={i} maj={maj} retirable={!!gestes} />}
      {i.note && <p data-note-sauvegarde="" className="faint" style={{ margin: 0, fontSize: 12.5, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}><Ic n="text" /> {i.note}</p>}
      {gestes && i.sauvegardeLe !== undefined && <small className="faint" data-provenance style={{ fontSize: 11, overflowWrap: 'anywhere' }}>{provenanceSauvegarde({ platform: i.platform, sauvegardeLe: i.sauvegardeLe, classeeLe: i.classeeLe ?? null, auteur: i.auteur ?? null })}</small>}
      <div className="acts">
        <button ref={gardee} className="btn sm" type="button" aria-pressed="true" aria-expanded={menu} aria-haspopup="menu" disabled={attente} onClick={() => setMenu(!menu)}><Ic n="bookmark" />Gardée</button>
        <Lien className="btn sm" href={i.cloner}><Ic n="copy" />Cloner</Lien>
        <CaseSelection i={i} choisie={choisie} basculer={basculer} />
      </div>
      {gestes && <ChoixFormat i={i} ferme={gestes.formatFerme} classe={classe} />}
      {gestes && (gestes.test.ouvert ? <PreparerTest platform={i.platform} externalId={i.externalId} /> : <p data-pont-refus className="faint" style={{ fontSize: 11, margin: 0 }}>{gestes.test.raison}</p>)}
      {menu && (
        <div className="tile fpanel" role="menu" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
          {dossiers.filter((d) => d !== i.folder).map((d) => (
            <button key={d} type="button" className="fopt" role="menuitem" onClick={() => agir(() => setSavedAdFolder({ ...cible, folder: d }), () => range(d), `Rangée dans « ${d} »`)}><span>Ranger dans « {d} »</span></button>
          ))}
          {i.folder && <button type="button" className="fopt" role="menuitem" onClick={() => agir(() => setSavedAdFolder({ ...cible, folder: null }), () => range(null), 'Sortie de la collection')}><span>Sortir de « {i.folder} »</span><small>Elle reste dans « Non classées »</small></button>}
          <button type="button" className="fopt" role="menuitem" onClick={() => { setMenu(false); setPopup(true); }}><span>Modifier collections, tags et note</span><small>Plusieurs collections, des tags, une note</small></button>
          <button type="button" className="fopt" role="menuitem" onClick={() => agir(() => unsaveAd(cible), retire, 'Retirée des sauvegardes')}><span>Retirer des sauvegardes</span></button>
        </div>
      )}
      {popup && <PopupSauvegarde ad={i.ad} apercu={{ image: i.image, marque: i.marque, texte: i.ad.body?.trim() || null }} sauvee fermer={() => setPopup(false)}
        apres={(e) => (e.sauvee ? maj(e) : retire())} />}
    </article>
  );
}

/**
 * Les tags d'une sauvegarde (lot 6) · chacun se retire d'un geste
 * (`majSauvegarde` avec les autres tags · ni la sauvegarde, ni sa note, ni
 * ses collections ne bougent). La pastille ne part qu'au oui du serveur.
 */
function TagsSauvegarde({ i, maj, retirable }: { i: SauvegardeDonnees; maj: (e: EtatSauvegarde) => void; retirable: boolean }) {
  const { toast } = useSpatial();
  const [attente, setAttente] = useState<string | null>(null);
  const verrou = useRef(verrouAction());
  const tags = i.tags ?? [];
  const retirer = async (cle: string, nom: string) => {
    if (!verrou.current.tenter()) return;
    setAttente(cle);
    try {
      const r = await majSauvegarde({ platform: i.platform, externalId: i.externalId, tags: tags.filter((t) => t.cle !== cle).map((t) => t.nom) });
      if (!r.ok) { toast(r.error ?? 'Retrait refusé.'); return; }
      maj({ sauvee: true, tags: r.sauvegarde?.tags ?? tags.filter((t) => t.cle !== cle) });
      toast(`Tag « ${nom} » retiré · la sauvegarde et sa note restent`);
    } catch { toast('Échec · vérifie ta connexion puis réessaie.'); }
    finally { verrou.current.relacher(); setAttente(null); }
  };
  return (
    <div className="row" data-tags-sauvegarde="" style={{ flexWrap: 'wrap', gap: 6 }}>
      {tags.map((t) => (retirable
        ? <button key={t.cle} type="button" className="chip on" style={{ minHeight: 44 }} aria-label={`Retirer le tag « ${t.nom} »`} aria-busy={attente === t.cle || undefined} onClick={() => void retirer(t.cle, t.nom)}><Ic n="tag" />{t.nom}<Ic n="x" /></button>
        : <span key={t.cle} className="pill"><Ic n="tag" />{t.nom}</span>))}
    </div>
  );
}

/**
 * Le FORMAT d'une créa gardée · un choix natif, filtré par le média (noyau),
 * puis « Enregistrer » · un geste explicite (une flèche du clavier n'écrit
 * rien). « Enregistré » seulement au oui du serveur · sinon le choix revient.
 */
function ChoixFormat({ i, ferme, classe }: { i: SauvegardeDonnees; ferme: string | null; classe: (id: string | null, date: string | null) => void }) {
  const { toast } = useSpatial();
  const options = formatsPourMedia(mediaAnnonce(i.ad.mediaType));
  const initial = i.format?.id ?? null;
  if (initial && estFormatCreatif(initial) && !options.some((f) => f.id === initial)) options.push(formatCreatif(initial));
  const [enregistre, setEnregistre] = useState<string>(initial ?? FORMAT_NON_CLASSE);
  const [valeur, setValeur] = useState<string>(initial ?? FORMAT_NON_CLASSE);
  const [attente, demarrer] = useTransition();
  const verrou = useRef(verrouAction());
  const idRaison = useId();
  const champ = useRef<HTMLSelectElement>(null);
  // Un échec remet le choix enregistré · le bouton « Enregistrer » disparaît avec la modification, le
  // focus revient au choix (ex lot 20B) au lieu de tomber sur la page · sauf s'il est parti ailleurs.
  const [refocus, setRefocus] = useState(false);
  const rendreFocus = () => { const actif = document.activeElement; if (!actif || actif === document.body || champ.current?.closest('article')?.contains(actif)) setRefocus(true); };
  // Le choix est désactivé pendant l'enregistrement · le focus lui revient une fois réactivé.
  useEffect(() => { if (refocus && !attente) { champ.current?.focus(); setRefocus(false); } }, [refocus, attente]);
  const modifie = !ferme && valeur !== enregistre;
  const enregistrer = () => {
    if (!modifie || !verrou.current.tenter()) return;
    const v = valeur;
    demarrer(async () => {
      try {
        const r = await classerFormatSauvegarde({ platform: i.platform, externalId: i.externalId, format: v });
        if (!r.ok) { setValeur(enregistre); toast(r.error); rendreFocus(); return; }
        setEnregistre(v);
        classe(r.format ?? null, r.date ?? null);
        toast(r.format ? `Enregistré · ${formatCreatif(r.format).libelle}` : 'Enregistré · non classée');
      } catch { setValeur(enregistre); toast('Échec de l’enregistrement · vérifie ta connexion puis réessaie.'); rendreFocus(); }
      finally { verrou.current.relacher(); }
    });
  };
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'end' }}>
      <label className="field" style={{ flex: 1, minWidth: 0 }}>Format
        <select ref={champ} value={valeur} disabled={!!ferme || attente} onChange={(e) => setValeur(e.target.value)} title={ferme ?? undefined} aria-describedby={ferme ? idRaison : undefined} data-format-choix>
          <option value={FORMAT_NON_CLASSE}>Non classé</option>
          {options.map((f) => <option key={f.id} value={f.id}>{f.libelle}</option>)}
        </select>
      </label>
      {modifie && <button type="button" className="btn sm pri" onClick={enregistrer} disabled={attente}>{attente ? 'Enregistrement…' : 'Enregistrer'}</button>}
      {ferme && <small className="faint" id={idRaison} data-format-indisponible style={{ fontSize: 11 }}>{ferme}</small>}
      {!ferme && i.format?.versionAncienne && !modifie && <small className="faint" style={{ fontSize: 11 }}>Classée avec une version antérieure de la liste, à revoir</small>}
    </div>
  );
}

/**
 * « Préparer un test » · le pont EXISTANT Sauvegardes → Résultats
 * (`trackSavedAdAction`) · la créa devient un concept « imitation » en
 * brouillon. Rien n'est lancé, rien n'est généré, aucune dépense · c'est dit.
 */
function PreparerTest({ platform, externalId }: { platform: string; externalId: string }) {
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'ok' | { erreur: string }>('repos');
  const verrou = useRef(verrouAction());
  const lancer = async () => {
    if (etat === 'ok' || !verrou.current.tenter()) return;
    setEtat('envoi');
    try { const r = await trackSavedAdAction({ platform, externalId }); setEtat(r.error ? { erreur: r.error } : 'ok'); }
    catch { setEtat({ erreur: 'Échec · vérifie ta connexion puis réessaie.' }); }
    finally { verrou.current.relacher(); }
  };
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <button type="button" className="btn sm" onClick={() => void lancer()} disabled={etat === 'ok' || etat === 'envoi'} title="Crée un concept « imitation » en brouillon dans Résultats · rien n’est lancé">
        <Ic n="flask" />{etat === 'ok' ? 'Brouillon de test créé' : etat === 'envoi' ? 'Préparation…' : 'Préparer un test'}
      </button>
      <small className="faint" role="status" style={{ fontSize: 11 }}>
        {typeof etat === 'object' ? etat.erreur : etat === 'ok' ? <><Lien href="/adsmap">Ouvrir Résultats</Lien> · hypothèse et variable à compléter avant le test.</> : 'Un brouillon dans Résultats · rien n’est lancé, aucune dépense.'}
      </small>
    </div>
  );
}

/**
 * Lot 6 bis (SV01) · la case « Sélectionner » d'une sauvegarde · ne fait que
 * cocher (aucune écriture) · la sélection vit dans la page, jusqu'au lien.
 */
function CaseSelection({ i, choisie, basculer }: { i: SauvegardeDonnees; choisie: boolean; basculer: () => void }) {
  return (
    <label className="btn sm" data-selection-sauvegarde={i.id} style={{ minHeight: 44, cursor: 'pointer' }}>
      <input type="checkbox" checked={choisie} onChange={basculer} aria-label={`Sélectionner la créa de ${i.marque.nom} pour un projet`} style={{ width: 18, height: 18, margin: 0 }} />
      Sélectionner
    </label>
  );
}

/**
 * Lot 6 bis (SV01) · « Créer un projet avec la sélection » · rien de coché ·
 * le lien d'avant (un projet vide) ; une sélection admise · l'assistant
 * Nouveau projet EXISTANT avec ces sauvegardes en références
 * (`verdictSelectionProjet`, noyau) ; refusée (plusieurs marques, une autre
 * marque que l'active, trop de créas) · fermé, la raison écrite à côté.
 */
function CreerProjetSelection({ choisies, creerProjet, marqueActive, vider }: { choisies: ReadonlyArray<SauvegardeDonnees>; creerProjet: string; marqueActive: { id: string; nom: string } | null; vider: () => void }) {
  const id = useId();
  if (choisies.length === 0) return <Lien className="btn pri sm" href={creerProjet} style={{ marginLeft: 'auto' }}>Créer un projet Studios</Lien>;
  const v = verdictSelectionProjet(choisies.map((i) => ({ id: i.id, marqueId: i.pourMarque?.id ?? null, marqueNom: i.pourMarque?.nom ?? null, video: i.video })), { marqueActive });
  const libelle = `Créer un projet avec la sélection (${choisies.length})`;
  return (
    <>
      <button type="button" className="btn sm" data-vider-selection="" style={{ minHeight: 44, marginLeft: 'auto' }} onClick={vider}>Tout désélectionner</button>
      {v.ok
        ? <Lien className="btn pri sm" href={v.lien} data-creer-selection="ok" style={{ minHeight: 44 }}>{libelle}</Lien>
        : <button type="button" className="btn pri sm" data-creer-selection="refus" aria-disabled="true" aria-describedby={`${id}-r`} style={{ minHeight: 44, ...FERME }}>{libelle}</button>}
      {!v.ok && <small id={`${id}-r`} role="status" className="faint" data-raison-selection="" style={{ flex: '1 1 100%', fontSize: '12.5px' }}>{v.raison}</small>}
    </>
  );
}

const COLONNES_LISTE = GRILLE_LISTE_SAUVEGARDES;

/**
 * Lot 6 bis (SV06) · la vue liste des Sauvegardes · MÊMES sauvegardes, MÊME
 * ordre que la grille (la liste filtrée et triée lui est passée telle quelle),
 * lignes lues par la règle de la vue liste de la Veille (`ligneListeVeille`) ·
 * le tableau défile dans son cadre au téléphone (`styleTableDefilante`). La
 * case de sélection y vit aussi · les gestes de la carte (ranger, classer,
 * préparer un test) restent sur la grille.
 */
export function ListeSauvegardes({ items, selection, basculer }: { items: ReadonlyArray<SauvegardeDonnees>; selection: readonly string[]; basculer: (id: string) => void }) {
  return (
    <div className="tile" data-vue-liste-sauvegardes="">
      <div className="atable" data-table="sauvegardes-liste" style={styleTableDefilante(LARGEUR_MIN_LISTE_SAUVEGARDES)} role="table" aria-label="Sauvegardes">
        <div className="atr ath" role="row" style={{ gridTemplateColumns: COLONNES_LISTE }}>{COLONNES_LISTE_SAUVEGARDES.map((t, k) => <span key={k} role="columnheader" aria-label={k === 0 ? ENTETE_SELECTION_SAUVEGARDES : undefined}>{t}</span>)}</div>
        {items.map((i) => {
          const l = ligneListeVeille(i.ad);
          return (
            <div className="atr" role="row" key={i.id} data-ligne-sauvegarde={i.id} style={{ gridTemplateColumns: COLONNES_LISTE }}>
              <span role="cell" style={{ display: 'flex', alignItems: 'center' }}>
                <label style={{ minHeight: 44, minWidth: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selection.includes(i.id)} onChange={() => basculer(i.id)} aria-label={`Sélectionner la créa de ${i.marque.nom} pour un projet`} style={{ width: 18, height: 18, margin: 0 }} />
                </label>
              </span>
              <span role="cell" style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ width: 40, flex: '0 0 40px' }}><Vignette image={i.image} /></span>
                <b style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.marque.nom}</b>
              </span>
              <span role="cell">{l.plateforme}</span>
              <span role="cell">{l.format}</span>
              <span role="cell">{l.diffusion}</span>
              <span role="cell" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(i.tags ?? []).map((t) => t.nom).join(', ') || undefined}>{(i.tags ?? []).length ? (i.tags ?? []).map((t) => t.nom).join(', ') : <span className="faint">Aucun</span>}</span>
              <span role="cell" title={i.ad.body?.trim() || undefined} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.ad.body?.trim() || <span className="faint">Texte non fourni</span>}</span>
              <span role="cell" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <Lien className="btn sm" href={i.cloner} style={{ minHeight: 44 }} aria-label={`Cloner la créa de ${i.marque.nom}`}><Ic n="copy" />Cloner</Lien>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
