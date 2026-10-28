'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import {
  COLLECTION_TOUTES, FILTRES_SAUVEGARDES, FORMAT_INCERTAIN, FORMAT_NON_CLASSE, FORMAT_TOUS, TRIS_FORMATS, collectionsSauvegardes, filtrerSauvegardes, formatFiltrable, provenanceSauvegarde, trierSauvegardes,
  type FiltresSauvegardes, type TriFormats, dansCollection, estFormatCreatif, formatCreatif, formatsPourMedia, mediaAnnonce, verrouAction, videoLisible,
} from '@tiktrends/core';
import type { InspoAd } from '@tiktrends/integrations';
import { classerFormatSauvegarde, setSavedAdFolder, unsaveAd } from '../../../app/actions/inspo';
import { trackSavedAdAction } from '../../../app/actions/adsmap-bridge';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Lien } from '../../communs';
import { Vignette } from './base';

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
}

export function CollectionsSauvegardes({ items: depart, creerProjet, initiale = COLLECTION_TOUTES, gestes, filtresInitiaux = FILTRES_SAUVEGARDES }: { items: ReadonlyArray<SauvegardeDonnees>; creerProjet: string; initiale?: string; gestes?: GestesSauvegarde; filtresInitiaux?: FiltresSauvegardes }) {
  const [items, setItems] = useState(depart);
  const [filtres, setFiltres] = useState<FiltresSauvegardes>(filtresInitiaux);
  const fx = (p: Partial<FiltresSauvegardes>) => setFiltres((x) => ({ ...x, ...p }));
  const [actif, setActif] = useState(initiale);
  const [enCreation, setEnCreation] = useState<string | null>(null);
  const [saisie, setSaisie] = useState<string | null>(null);
  const collections = useMemo(() => {
    const c = collectionsSauvegardes(items);
    // Une collection nommée mais encore vide · elle existera en base dès qu'une créa y est rangée.
    if (enCreation && !c.some((x) => x.cle === `f:${enCreation}`)) c.splice(c.length - 1, 0, { cle: `f:${enCreation}`, libelle: enCreation, n: 0 });
    return c;
  }, [items, enCreation]);
  const dansVue = items.filter((i) => dansCollection(i.folder, actif));
  const filtrables = dansVue.map((i) => ({ i, platform: i.platform, video: i.video, texte: i.ad.body ?? '', annonceur: i.marque.nom, format: formatFiltrable(i.format) }));
  const visibles = (gestes ? trierSauvegardes(filtrerSauvegardes(filtrables, filtres).map((x) => x.i), filtres.tri) : dansVue);
  const incertaines = items.some((i) => i.format?.etat === FORMAT_INCERTAIN) || filtres.format === FORMAT_INCERTAIN;
  const formatsPresents = [...new Set(items.map((i) => i.format?.id).filter((x): x is string => !!x))].filter(estFormatCreatif);
  const plateformes = [...new Set(items.map((i) => i.platform))];
  const dossiers = collections.filter((c) => c.cle.startsWith('f:')).map((c) => c.libelle);
  return (
    <div className="colls">
      <nav className="tile" aria-label="Collections">
        {collections.map((c) => (
          <button key={c.cle} type="button" aria-pressed={actif === c.cle} onClick={() => setActif(c.cle)}><span>{c.libelle}</span><span className="faint">{c.n}</span></button>
        ))}
        {saisie == null ? (
          <button type="button" onClick={() => setSaisie('')}><Ic n="plus" /> Nouvelle collection</button>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); const n = saisie.trim().slice(0, 60); if (n) { setEnCreation(n); setActif(`f:${n}`); } setSaisie(null); }} style={{ display: 'flex', gap: 6, padding: '4px 6px' }}>
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
              <label className="field">Tri<select value={filtres.tri} onChange={(e) => fx({ tri: e.target.value as TriFormats })} aria-label="Trier les sauvegardes">
                {TRIS_FORMATS.map((t) => <option key={t.id} value={t.id}>{t.libelle}</option>)}
              </select></label>
            </div>
          )}
          <span className="faint" style={{ fontSize: '12.5px' }}>{visibles.length} créa{visibles.length > 1 ? 's' : ''}{actif === `f:${enCreation}` && visibles.length === 0 ? ` · range une créa dans « ${enCreation} » depuis son bouton « Gardée »` : ''}</span>
          <Lien className="btn pri sm" href={creerProjet} style={{ marginLeft: 'auto' }}>Créer un projet Studios</Lien>
        </div>
        <div className="vfeed" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
          {visibles.map((i) => (
            <CarteSauvegarde key={i.id} i={i} dossiers={dossiers} gestes={gestes}
              range={(folder) => setItems((l) => l.map((x) => (x.id === i.id ? { ...x, folder } : x)))}
              retire={() => setItems((l) => l.filter((x) => x.id !== i.id))}
              classe={(id, date) => setItems((l) => l.map((x) => (x.id === i.id ? { ...x, format: { id, versionAncienne: false, etat: id ? 'classe' : FORMAT_NON_CLASSE }, classeeLe: id ? date : null, auteur: null } : x)))} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CarteSauvegarde({ i, dossiers, range, retire, gestes, classe }: { i: SauvegardeDonnees; dossiers: string[]; range: (f: string | null) => void; retire: () => void; gestes?: GestesSauvegarde; classe: (id: string | null, date: string | null) => void }) {
  const [menu, setMenu] = useState(false);
  const [attente, demarrer] = useTransition();
  const verrou = useRef(verrouAction());
  const { toast } = useSpatial();
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
      {gestes && i.sauvegardeLe !== undefined && <small className="faint" data-provenance style={{ fontSize: 11, overflowWrap: 'anywhere' }}>{provenanceSauvegarde({ platform: i.platform, sauvegardeLe: i.sauvegardeLe, classeeLe: i.classeeLe ?? null, auteur: i.auteur ?? null })}</small>}
      <div className="acts">
        <button className="btn sm" type="button" aria-pressed="true" aria-expanded={menu} aria-haspopup="menu" disabled={attente} onClick={() => setMenu(!menu)}><Ic n="bookmark" />Gardée</button>
        <Lien className="btn sm" href={i.cloner}><Ic n="copy" />Cloner</Lien>
      </div>
      {gestes && <ChoixFormat i={i} ferme={gestes.formatFerme} classe={classe} />}
      {gestes && (gestes.test.ouvert ? <PreparerTest platform={i.platform} externalId={i.externalId} /> : <p data-pont-refus className="faint" style={{ fontSize: 11, margin: 0 }}>{gestes.test.raison}</p>)}
      {menu && (
        <div className="tile fpanel" role="menu" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
          {dossiers.filter((d) => d !== i.folder).map((d) => (
            <button key={d} type="button" className="fopt" role="menuitem" onClick={() => agir(() => setSavedAdFolder({ ...cible, folder: d }), () => range(d), `Rangée dans « ${d} »`)}><span>Ranger dans « {d} »</span></button>
          ))}
          {i.folder && <button type="button" className="fopt" role="menuitem" onClick={() => agir(() => setSavedAdFolder({ ...cible, folder: null }), () => range(null), 'Sortie de la collection')}><span>Sortir de « {i.folder} »</span><small>Elle reste dans « Non classées »</small></button>}
          <button type="button" className="fopt" role="menuitem" onClick={() => agir(() => unsaveAd(cible), retire, 'Retirée des sauvegardes')}><span>Retirer des sauvegardes</span></button>
        </div>
      )}
    </article>
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
  const modifie = !ferme && valeur !== enregistre;
  const enregistrer = () => {
    if (!modifie || !verrou.current.tenter()) return;
    const v = valeur;
    demarrer(async () => {
      try {
        const r = await classerFormatSauvegarde({ platform: i.platform, externalId: i.externalId, format: v });
        if (!r.ok) { setValeur(enregistre); toast(r.error); return; }
        setEnregistre(v);
        classe(r.format ?? null, r.date ?? null);
        toast(r.format ? `Enregistré · ${formatCreatif(r.format).libelle}` : 'Enregistré · non classée');
      } catch { setValeur(enregistre); toast('Échec de l’enregistrement · vérifie ta connexion puis réessaie.'); }
      finally { verrou.current.relacher(); }
    });
  };
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'end' }}>
      <label className="field" style={{ flex: 1, minWidth: 0 }}>Format
        <select value={valeur} disabled={!!ferme || attente} onChange={(e) => setValeur(e.target.value)} title={ferme ?? undefined} data-format-choix>
          <option value={FORMAT_NON_CLASSE}>Non classé</option>
          {options.map((f) => <option key={f.id} value={f.id}>{f.libelle}</option>)}
        </select>
      </label>
      {modifie && <button type="button" className="btn sm pri" onClick={enregistrer} disabled={attente}>{attente ? 'Enregistrement…' : 'Enregistrer'}</button>}
      {ferme && <small className="faint" style={{ fontSize: 11 }}>{ferme}</small>}
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
