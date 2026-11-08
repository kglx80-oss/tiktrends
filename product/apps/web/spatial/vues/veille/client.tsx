'use client';

import { useCallback, useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { CPM_VEILLE, FILTRES_VEILLE, TRIS_VEILLE, adresseVueVeille, departDepuisVeille, estAncreCarteVeille, lienVeille, pucesVeille, toucheNavigationDetail, verrouAction, videoLisible, vueActiveVeille, type CriteresVeille, type PlateformeVeille, type TriVeille, type VueVeille, type VueVeilleEnregistree } from '@tiktrends/core';
import type { InspoAd } from '@tiktrends/integrations';
import { saveAd, followBrand, unfollowBrand } from '../../../app/actions/inspo';
import { creerHypotheseAction } from '../../../app/actions/adsmap-hypotheses';
import { FormulaireHypothese } from '../resultats/hypothese-client';
import { FERME, pendantAction } from '../projet/focus';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Lien } from '../../communs';
import type { CarteVeilleDonnees, DetailVeille as DonneesDetailVeille } from './types';
import { ImageApercu } from './apercu-client';
import { ATTR_OUVRIR_DETAIL, rendreFocusPub } from './focus-pub';
import type { NavigationDetail } from './filtres-locaux-client';
import { PanneauVues } from './vues-client';
import { PopupSauvegarde, type ApercuSauvegarde, type EtatSauvegarde } from './sauvegarde-client';

/**
 * Les briques INTERACTIVES de la Veille Spatial. Chaque geste appelle une
 * action serveur EXISTANTE (`app/actions/inspo` · mêmes gardes que la V5) ·
 * le toast ne dit « gardée » qu'après le oui du serveur, et un refus remet
 * l'état d'avant et se dit.
 */

/* ───────────────────────── sauvegarde · suivi ───────────────────────── */

function useBascule(initial: boolean, faire: (vers: boolean) => Promise<{ ok: boolean; error?: string }>, dire: (vers: boolean) => string) {
  const [etat, setEtat] = useState(initial);
  const [attente, demarrer] = useTransition();
  const verrou = useRef(verrouAction());
  const { toast } = useSpatial();
  const basculer = () => {
    if (!verrou.current.tenter()) return;
    const vers = !etat;
    setEtat(vers);
    demarrer(async () => {
      try {
        const r = await faire(vers);
        if (!r.ok) { setEtat(!vers); toast(r.error ?? 'Action refusée.'); } else toast(dire(vers));
      } catch { setEtat(!vers); toast('Échec · vérifie ta connexion puis réessaie.'); }
      finally { verrou.current.relacher(); }
    });
  };
  return { etat, attente, basculer };
}

/**
 * Lot 6 V5 (VB S01) · le signet n'écrit plus d'un coup · il ouvre la pop-up
 * « Sauvegarder » (collections, tags, note, puis UNE action). Gardée, la même
 * pop-up dit « Mettre à jour » et offre « Retirer des sauvegardes ». L'état
 * affiché (plein ou vide, tags) suit le oui du serveur, jamais le clic.
 */
function usePopupSauvegarde(initial: boolean, changer?: (e: EtatSauvegarde) => void) {
  const [etat, setEtat] = useState(initial);
  useEffect(() => { setEtat(initial); }, [initial]);
  const [ouvert, setOuvert] = useState(false);
  const apres = (e: EtatSauvegarde) => { setEtat(e.sauvee); changer?.(e); };
  return { etat, ouvert, ouvrir: () => setOuvert(true), fermer: () => setOuvert(false), apres };
}

interface PropsSauvegarde { ad: InspoAd; initial: boolean; apercu?: ApercuSauvegarde; changer?: (e: EtatSauvegarde) => void }

/** Le marque-page de la carte (`button.xi`). */
export function IconeSauvegarde({ ad, initial, apercu, changer }: PropsSauvegarde) {
  const b = usePopupSauvegarde(initial, changer);
  return (
    <>
      <button type="button" className="xi" aria-pressed={b.etat} aria-haspopup="dialog" aria-expanded={b.ouvert} aria-label={b.etat ? 'Modifier la sauvegarde' : 'Sauvegarder'} onClick={b.ouvrir}>
        <Ic n="bookmark" />
      </button>
      {b.ouvert && <PopupSauvegarde ad={ad} apercu={apercu} sauvee={b.etat} fermer={b.fermer} apres={b.apres} />}
    </>
  );
}

/** Le bouton « Sauvegarder / Gardée » (`button.btn`) · Ce qui scale, détail d'une pub. */
export function BoutonSauvegarde({ ad, initial, apercu, changer, classe = 'btn sm', libelles = ['Sauvegarder', 'Gardée'] }: PropsSauvegarde & { classe?: string; libelles?: [string, string] }) {
  const b = usePopupSauvegarde(initial, changer);
  return (
    <>
      <button className={classe} type="button" aria-pressed={b.etat} aria-haspopup="dialog" aria-expanded={b.ouvert} onClick={b.ouvrir}>
        <Ic n="bookmark" />{b.etat ? libelles[1] : libelles[0]}
      </button>
      {b.ouvert && <PopupSauvegarde ad={ad} apercu={apercu} sauvee={b.etat} fermer={b.fermer} apres={b.apres} />}
    </>
  );
}

/** Les tags posés sur la sauvegarde d'une pub (VB C09) · rendus seulement quand il y en a (écart de maquette déclaré). */
export function TagsCarte({ tags }: { tags?: ReadonlyArray<{ cle: string; nom: string }> }) {
  if (!tags?.length) return null;
  return (
    <div data-tags-carte="" aria-label="Tags" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 14px 8px' }}>
      {tags.map((t) => <span key={t.cle} className="pill" title={t.nom} style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}><Ic n="tag" />{t.nom}</span>)}
    </div>
  );
}

/** Ce que la carte d'une pub reprend d'une pop-up validée · sauvegardée ou non, et ses tags. */
export type MajCarte = (cle: string, e: EtatSauvegarde) => void;
const apercuCarte = (c: CarteVeilleDonnees): ApercuSauvegarde => ({ image: c.image, marque: c.marque, texte: c.texte });

/** Suivre un annonceur (`followBrand` · la liste de Radar et des Sauvegardes). */
export function BoutonSuivi({ plateforme, nom, ad, initial, classe = 'btn sm' }: { plateforme: string; nom: string; ad?: InspoAd; initial: boolean; classe?: string }) {
  const b = useBascule(initial,
    (vers) => (vers
      ? followBrand({ platform: plateforme, name: nom, externalId: ad?.advertiserId, logoUrl: ad?.advertiserLogo, domain: ad?.landingDomain })
      : unfollowBrand({ platform: plateforme, name: nom })),
    (vers) => (vers ? `${nom} ajouté au Radar` : 'Suivi retiré'));
  return (
    <button className={classe} type="button" aria-pressed={b.etat} disabled={b.attente} onClick={b.basculer}>
      <Ic n="eye" />{b.etat ? 'Suivi' : 'Suivre'}
    </button>
  );
}

/* ───────────────────────── retour sur la carte d'origine ───────────────────────── */

/**
 * Revenir à SA carte (ex `DefileAncreVeille`, lot 18B) · l'adresse de retour
 * porte l'ancre de la carte (`#ad-<plateforme>-<id>`), mais le défilement natif
 * ne tenait pas (mesuré · la carte hors de l'écran). Au montage, la carte est
 * centrée et reçoit le focus · au clavier, la tabulation repart d'elle.
 */
export function DefileAncre() {
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (!estAncreCarteVeille(h)) return;
    const carte = document.getElementById(h);
    if (!carte) return;
    carte.scrollIntoView({ block: 'center' });
    if (!carte.hasAttribute('tabindex')) carte.setAttribute('tabindex', '-1');
    carte.focus({ preventScroll: true });
  }, []);
  return null;
}

/* ───────────────────────── la carte et son détail ───────────────────────── */

const LOGO_META = (
  <svg viewBox="0 0 36 24" aria-hidden="true"><path fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.5C4.5 9.5 7.3 5 10.6 5c4.3 0 7.6 8.6 10.6 12.4 1.9 2.4 3.5 3.1 5 3.1 2.9 0 5.3-2.9 5.3-7.6C31.5 8.3 29.3 5 26.2 5c-3.9 0-7.2 6.8-9.2 9.8S12.6 21 10.2 21c-3.4 0-5.7-2-5.7-5.5z" /></svg>
);

export function Portail({ children }: { children: ReactNode }) {
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  return monte ? createPortal(children, document.body) : null;
}

/**
 * La carte d'une annonce (`article.xa`) · balisage de `xCard`, valeurs réelles.
 * Avec `ouvrir`, le détail est tenu par la liste (précédente / suivante dans
 * la liste filtrée, lot 7) · sans, la carte l'ouvre seule, comme avant.
 */
export function CarteVeille({ c: donnees, coutJarvis, ouvrir, maj }: { c: CarteVeilleDonnees; coutJarvis: string; ouvrir?: () => void; maj?: MajCarte }) {
  const [ouvert, setOuvert] = useState(false);
  // Lot 6 · ce que la pop-up a fait accepter au serveur · la carte (et son détail) le montrent sans recharger.
  const [local, setLocal] = useState<EtatSauvegarde | null>(null);
  const c: CarteVeilleDonnees = local ? { ...donnees, sauvee: local.sauvee, tags: local.tags } : donnees;
  const changer = (e: EtatSauvegarde) => { setLocal(e); maj?.(donnees.cle, e); };
  const fermer = useCallback(() => { setOuvert(false); rendreFocusPub(c.cle); }, [c.cle]);
  const lieu = [c.pays, c.plateforme].filter(Boolean).join(' · ');
  return (
    <article className="xa" id={c.ancre ?? undefined}>
      <div className="xh">
        <span className="av" style={{ background: c.marque.fond }}>{c.marque.initiale}</span>
        <div className="xn">
          <strong>{c.marque.nom}</strong>
          <small><i className={c.active ? 'live' : 'off'} />{c.jours}{c.signaux.map((s) => <span key={s.titre} title={s.titre}><Ic n={s.icone} />{s.texte}</span>)}</small>
        </div>
        <IconeSauvegarde ad={c.ad} initial={c.sauvee} apercu={apercuCarte(c)} changer={changer} />
      </div>
      <div className="xm">
        {lieu && <span className="xc">{lieu}</span>}
        {c.portee && <span title="Portée"><Ic n="users" />{c.portee}</span>}
        {c.depense && <span title="Dépense estimée · borne basse, au CPM choisi">≈ {c.depense}</span>}
        {c.croissance && <span className={c.croissance.classe} title="Croissance de la portée sur 7 jours">{c.croissance.texte}</span>}
      </div>
      <p className="xp">{c.texte}</p>
      <TagsCarte tags={c.tags} />
      <button type="button" className="xv" {...{ [ATTR_OUVRIR_DETAIL]: c.cle }} aria-label={`Voir le détail de la pub ${c.marque.nom}`} onClick={() => (ouvrir ? ouvrir() : setOuvert(true))}>
        <div className={`comp ${c.ratio}`.trim()}><ImageApercu src={c.image} /></div>
        {c.tendance && <span className="xt hot"><Ic n="chart" />Tendance</span>}<span className="xt st">{c.style}</span>
      </button>
      <div className="xf"><div><small>{c.domaine}</small><strong>{c.titre}</strong></div>{c.cta && <span className="xcta">{c.cta}</span>}</div>
      <div className="xact2"><Lien className="btn sm pri" href={c.iterer}><Ic n="loop" />Itérer depuis cette créa</Lien></div>
      {!ouvrir && ouvert && <Portail><DetailVeille c={c} coutJarvis={coutJarvis} fermer={fermer} maj={(_, e) => changer(e)} /></Portail>}
    </article>
  );
}

/**
 * Le détail d'une pub (`.xmod`). Avec `nav` · « Précédente », « Suivante » à
 * l'écran (cibles de 44 px) et au clavier (← →, jamais dans un champ de
 * saisie ni sur le lecteur vidéo · `toucheNavigationDetail`) · aux bornes, le
 * bouton reste focalisable, fermé, et la raison est écrite à côté.
 */
export function DetailVeille({ c, coutJarvis, fermer, nav, maj }: { c: CarteVeilleDonnees; coutJarvis: string; fermer: () => void; nav?: NavigationDetail; maj?: MajCarte }) {
  const croix = useRef<HTMLButtonElement>(null);
  // Le focus va à la croix à l'OUVERTURE seulement · passer à la voisine le laisse où il est (bouton ou clavier).
  useEffect(() => { croix.current?.focus(); }, []);
  const appels = useRef({ fermer, nav });
  appels.current = { fermer, nav };
  useEffect(() => {
    const touche = (e: KeyboardEvent) => {
      const { fermer: f, nav: n } = appels.current;
      if (e.key === 'Escape') { f(); return; }
      if (!n) return;
      const sens = toucheNavigationDetail({ key: e.key, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, cible: e.target as HTMLElement | null });
      const vers = sens === 'precedente' ? n.voisins.precedente : sens === 'suivante' ? n.voisins.suivante : null;
      if (!sens) return;
      e.preventDefault();
      if (vers) n.aller(vers);
    };
    document.addEventListener('keydown', touche);
    return () => document.removeEventListener('keydown', touche);
  }, []);
  const d = c.detail;
  // Vague 4 · la vidéo se lit en place (comme l'ancienne carte) · une image reste une image.
  const video = videoLisible(c.ad);
  const [hypothese, setHypothese] = useState(false);
  // Une autre pub dans le même détail · le formulaire d'hypothèse de la précédente se referme.
  useEffect(() => { setHypothese(false); }, [c.cle]);
  const boutonHypothese = useRef<HTMLButtonElement>(null);
  const fermerHypothese = () => { setHypothese(false); setTimeout(() => boutonHypothese.current?.focus(), 0); };
  return (
    <div className="xmod" role="dialog" aria-modal="true" aria-label={`Pub ${c.marque.nom}`} onClick={(e) => { if (e.target === e.currentTarget) fermer(); }}>
      <div className="xmbox glass">
        <button ref={croix} type="button" className="xmx" aria-label="Fermer" onClick={fermer}><Ic n="x" s={false} /></button>
        {nav && <BarreNavigationDetail nav={nav} />}
        <div className="xmv"><div className={`comp ${c.ratio}`.trim()}>{video
          ? <video src={video} poster={c.image ?? undefined} controls playsInline preload="none" aria-label={`Vidéo de la pub ${c.marque.nom}`} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
          : <ImageApercu src={c.image} alt={`Aperçu de la pub ${c.marque.nom}`} lazy={false} />}</div></div>
        <div className="xmi">
          <div className="xh"><span className="av" style={{ background: c.marque.fond }}>{c.marque.initiale}</span><div className="xn"><strong>{c.marque.nom}</strong><small><i className={c.active ? 'live' : 'off'} />{d.statut}</small></div></div>
          {c.texte && <p>{c.texte}</p>}
          {d.liens.length > 0 && (
            <div className="xmlinks">
              {d.liens.map((l) => (
                <a key={l.href} className="xml" href={l.href} target="_blank" rel="noopener noreferrer">
                  <span className={`xmlic ${l.icone}`}>{l.icone === 'meta' ? LOGO_META : l.icone === 'tt' ? 'T' : <Ic n="tag" />}</span>
                  <span><strong>{l.titre}</strong><small>{l.sous}</small></span><Ic n="arrow" />
                </a>
              ))}
            </div>
          )}
          <TagsDetail key={c.cle} c={c} maj={maj} />
          {d.kpis.length > 0 && <div className="xmk">{d.kpis.map(([k, v]) => <div key={k}><small>{k}</small><b>{v}</b></div>)}</div>}
          <p className="xmw"><Ic n="bulb" /><span>{d.lecture}</span></p>
          <div className="xms">
            <span className="lbl">Avec Jarvis · un brouillon à relire, rien n’est envoyé seul</span>
            <div className="xmlinks">
              {d.jarvis.map((j) => (
                <Lien key={j.href} className="xml" href={j.href}><span className="xmlic site"><Ic n="spark" /></span><span><strong>{j.titre}</strong><small>{j.sous}</small></span><Ic n="arrow" /></Lien>
              ))}
              {d.texte && (
                <a className="xml" download="texte-publicitaire.txt" href={`data:text/plain;charset=utf-8,${encodeURIComponent(d.texte)}`}>
                  <span className="xmlic site"><Ic n="down" /></span><span><strong>Exporter le texte publicitaire</strong><small>TXT · texte de l’annonce</small></span><Ic n="arrow" />
                </a>
              )}
              <span className="xml" aria-disabled="true" title="La transcription audio n’est pas raccordée">
                <span className="xmlic site"><Ic n="text" /></span><span><strong>Transcrire le script</strong><small>Transcription audio indisponible</small></span>
              </span>
            </div>
          </div>
          {d.hypothese && (
            <div className="xms" data-geste="hypothese">
              <span className="lbl">Sans Jarvis · une hypothèse à toi, rangée dans Résultats</span>
              <div className="xmlinks">
                <button ref={boutonHypothese} type="button" className="xml" style={{ textAlign: 'left', minHeight: 44, width: '100%', font: 'inherit', cursor: 'pointer', ...(d.hypothese.ouvert ? {} : FERME) }}
                  aria-expanded={d.hypothese.ouvert ? hypothese : undefined} aria-disabled={!d.hypothese.ouvert || undefined} title={d.hypothese.raison ?? undefined}
                  onClick={() => { if (d.hypothese?.ouvert) setHypothese((o) => !o); }}>
                  <span className="xmlic site"><Ic n="bulb" /></span>
                  <span><strong>Ajouter aux hypothèses</strong><small>{d.hypothese.ouvert ? 'Rangée dans « À formuler » · la pub est gardée comme source' : d.hypothese.raison}</small></span>
                </button>
              </div>
              {hypothese && d.hypothese.ouvert && (
                <FormulaireHypothese depart={departDepuisVeille({ annonceur: c.ad.advertiserName })} fermer={fermerHypothese}
                  note={`Source · la pub de ${c.marque.nom}. Elle est gardée dans tes sauvegardes de la marque active.`}
                  envoyer={async (saisie) => {
                    const r = await saveAd({ platform: c.ad.platform, externalId: c.ad.id, snapshot: c.ad });
                    if (!r.ok) return { error: r.error ?? 'Sauvegarde refusée.' };
                    return creerHypotheseAction({ source: { type: 'veille', platform: c.ad.platform, externalId: c.ad.id }, saisie });
                  }} />
              )}
              {d.iterationVeille && <IterationVeille key={c.cle} ad={c.ad} g={d.iterationVeille} />}
            </div>
          )}
          <div className="kc">
            <Lien className="btn pri" href={c.iterer}><Ic n="loop" />Itérer depuis cette créa</Lien>
            <BoutonSauvegarde key={c.cle} ad={c.ad} initial={c.sauvee} apercu={apercuCarte(c)} changer={(e) => maj?.(c.cle, e)} classe="btn" libelles={['Sauvegarder', 'Sauvegardée']} />
            {c.ad.advertiserName && <BoutonSuivi plateforme={c.ad.platform} nom={c.ad.advertiserName} ad={c.ad} initial={c.suivie} classe="btn" />}
            {d.annonceur && <Lien className="btn ghost" href={d.annonceur}>Toutes les pubs {c.marque.nom}</Lien>}
          </div>
          <small className="faint">Source : bibliothèques publicitaires publiques · portée relevée, dépense estimée. Jarvis · {coutJarvis}</small>
        </div>
      </div>
    </div>
  );
}

/**
 * Les tags de la pub dans son détail (VB F15) · ceux de SA sauvegarde, et
 * « + Ajouter » qui ouvre la pop-up « Sauvegarder » (tags, note, collections).
 * Une pub pas encore gardée le dit · ajouter un tag la garde.
 */
function TagsDetail({ c, maj }: { c: CarteVeilleDonnees; maj?: MajCarte }) {
  const [ouvert, setOuvert] = useState(false);
  const tags = c.tags ?? [];
  return (
    <div className="xms" data-tags-detail="">
      <span className="lbl">Tags</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {tags.map((t) => <span key={t.cle} className="pill"><Ic n="tag" />{t.nom}</span>)}
        {tags.length === 0 && <small className="faint">{c.sauvee ? 'Aucun tag sur cette sauvegarde' : 'Pas encore gardée · ajouter un tag la sauvegarde'}</small>}
        <button type="button" className="btn sm" aria-haspopup="dialog" aria-expanded={ouvert} style={{ minHeight: 44 }} onClick={() => setOuvert(true)}><Ic n="plus" />Ajouter</button>
      </div>
      {ouvert && <PopupSauvegarde ad={c.ad} apercu={apercuCarte(c)} sauvee={c.sauvee} fermer={() => setOuvert(false)} apres={(e) => maj?.(c.cle, e)} />}
    </div>
  );
}

function BarreNavigationDetail({ nav }: { nav: NavigationDetail }) {
  const v = nav.voisins;
  const id = useId();
  const raisons = [...new Set([v.libelle, v.raisonPrecedente, v.raisonSuivante].filter((x): x is string => !!x))].join(' · ');
  const bouton = (sens: 'precedente' | 'suivante') => {
    const vers = sens === 'precedente' ? v.precedente : v.suivante;
    return (
      <button type="button" className="btn" data-nav-detail={sens} aria-disabled={!vers || undefined} aria-describedby={`${id}-raison`}
        aria-keyshortcuts={sens === 'precedente' ? 'ArrowLeft' : 'ArrowRight'}
        style={{ minHeight: 44, minWidth: 44, ...(vers ? {} : FERME) }} onClick={() => { if (vers) nav.aller(vers); }}>
        {sens === 'precedente' ? <><Ic n="back" />Précédente</> : <>Suivante<Ic n="arrow" /></>}
      </button>
    );
  };
  return (
    <div data-barre-nav-detail role="group" aria-label="Parcourir la liste" style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '0 56px 10px 0' }}>
      {bouton('precedente')}
      {bouton('suivante')}
      {/* Les deux boutons d'abord, côte à côte · au téléphone, la position et la raison passent dessous. */}
      <small id={`${id}-raison`} role="status" className="faint" style={{ flex: '1 1 170px', fontSize: '12.5px' }}>{raisons}</small>
    </div>
  );
}

/**
 * « Itérer à partir de cette pub » (VB F26) · garde la pub (`saveAd`, l'action
 * existante · une pub déjà gardée n'est pas réécrite) puis ouvre l'écran Itérer
 * avec elle en source · on y choisit la SEULE variable remplacée. Rien n'est
 * créé ici · l'ad naît au clic « Créer » de l'écran Itérer, gardé côté serveur.
 * Pendant l'appel, le bouton garde le focus (`aria-disabled` + `aria-busy`) ·
 * fermé, il dit pourquoi à côté.
 */
function IterationVeille({ ad, g }: { ad: InspoAd; g: NonNullable<DonneesDetailVeille['iterationVeille']> }) {
  const router = useRouter();
  const id = useId();
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const ouvert = g.acces.ouvert;
  const lancer = async () => {
    if (!ouvert || occupe) return;
    setOccupe(true); setErreur(null);
    try {
      const r = await saveAd({ platform: ad.platform, externalId: ad.id, snapshot: ad });
      if (!r.ok) { setErreur(r.error ?? 'Sauvegarde refusée.'); return; }
      router.push(g.href);
    } catch {
      setErreur('Échec · vérifie ta connexion puis réessaie.');
    } finally { setOccupe(false); }
  };
  const a = pendantAction({ presse: occupe, occupe });
  return (
    <div className="xmlinks" style={{ marginTop: 6 }}>
      <button type="button" className="xml" data-geste="iterer-veille" {...a} aria-disabled={a['aria-disabled'] ?? (!ouvert || undefined)}
        aria-describedby={`${id}-sous`} style={{ textAlign: 'left', minHeight: 44, width: '100%', font: 'inherit', cursor: 'pointer', ...(ouvert && !occupe ? {} : FERME) }}
        onClick={() => void lancer()}>
        <span className="xmlic site"><Ic n="loop" /></span>
        <span><strong>{occupe ? 'Ouverture…' : 'Itérer à partir de cette pub'}</strong><small id={`${id}-sous`}>{ouvert ? 'Je garde sa structure, je remplace une seule variable · rien n’est écrit sur la pub' : g.acces.raison}</small></span>
      </button>
      {erreur && <small role="alert" style={{ fontSize: '11.5px', color: 'var(--bad)' }}>{erreur}</small>}
    </div>
  );
}

/* ───────────────────────── barre de vue, filtres et tri ───────────────────────── */

export interface PropsBarreVeille {
  criteres: CriteresVeille;
  plateforme: PlateformeVeille;
  vue: VueVeille;
  /** Le tri RÉELLEMENT envoyé à la source (Meta). */
  tri: TriVeille;
  cpm: number;
  stat: { pubs: number; annonceurs: number; suite: string };
  /** Les vues enregistrées de CETTE personne dans CET espace (`lireVuesVeille`) · lues par la page. */
  vues: ReadonlyArray<VueVeilleEnregistree>;
}

/**
 * `div.xbar` de la maquette · vues, filtres, tri et CPM. Chaque choix change
 * l'ADRESSE (`lienVeille`) · la page relit les critères et interroge la
 * source · un rechargement ou un Retour retrouve la même vue.
 *
 * « Nouvelle vue » garde ces paramètres d'adresse sous un nom (`PanneauVues`) ·
 * chaque vue gardée devient un onglet qui rouvre son adresse, et l'onglet de la
 * vue dont l'adresse est celle de l'écran est signalé (`vueActiveVeille`).
 */
export function BarreVeille({ criteres, plateforme, vue, tri, cpm, stat, vues: vuesInitiales }: PropsBarreVeille) {
  const router = useRouter();
  const [montrer, setMontrer] = useState(false);
  const [dd, setDd] = useState<string | null>(null);
  const [vues, setVues] = useState<ReadonlyArray<VueVeilleEnregistree>>(vuesInitiales);
  const active = vueActiveVeille(vues, criteres);
  const ouvrir = (href: string) => { setDd(null); router.push(href); };
  const aller = (over: Parameters<typeof lienVeille>[1]) => { setDd(null); router.push(lienVeille(criteres, over)); };
  useEffect(() => {
    if (!dd) return;
    const dehors = (e: MouseEvent) => { const t = e.target as HTMLElement; if (!t.closest('.fpanel') && !t.closest('[data-xdd]')) setDd(null); };
    document.addEventListener('click', dehors);
    return () => document.removeEventListener('click', dehors);
  }, [dd]);
  // Échap referme d'abord la liste ouverte, puis le panneau des filtres (comme l'ancien « Filtres » de la Veille).
  useEffect(() => {
    if (!dd && !montrer) return;
    const echap = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (dd) setDd(null); else setMontrer(false); };
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [dd, montrer]);
  const puces = pucesVeille(criteres);
  const triMeta = plateforme === 'meta';
  const triActif = tri;
  const triLibelle = triMeta ? TRIS_VEILLE.find(([k]) => k === triActif)?.[1] ?? 'Récentes' : 'Source';
  const filtres = FILTRES_VEILLE.map((g) => ({ ...g, filtres: g.filtres.filter((f) => !f.metaSeulement || triMeta) })).filter((g) => g.filtres.length);
  const tous = filtres.flatMap((g) => g.filtres);
  const filtreOuvert = tous.find((f) => f.cle === dd);
  const valeur = (cle: string) => (criteres as Record<string, unknown>)[cle] as string | undefined;
  const tab = (k: VueVeille, l: string, i: string) => (
    <button key={k} type="button" aria-pressed={vue === k && !active} onClick={() => aller({ vue: k, sort: k === 'tendance' ? undefined : criteres.sort })}><Ic n={i} />{l}</button>
  );
  return (
    <>
      <div className="xbar">
        <div className="xtabs" role="group" aria-label="Vue">
          {tab('tout', 'Toutes les pubs', 'grid')}{tab('tendance', 'Tendance', 'chart')}{tab('suivies', 'Suivies', 'bookmark')}
          {vues.map((v) => (
            <button key={v.id} type="button" aria-pressed={active === v.id} title={v.nom} onClick={() => ouvrir(adresseVueVeille(v.params))}>
              <Ic n="folder" /><span style={{ display: 'inline-block', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{v.nom}</span>
            </button>
          ))}
          <button type="button" className="xnew" data-xdd="vues" aria-haspopup="dialog" aria-expanded={dd === 'vues'} onClick={() => { setDd(dd === 'vues' ? null : 'vues'); setMontrer(false); }}><Ic n="plus" />Nouvelle vue</button>
        </div>
        <button type="button" className={`xfc ${montrer ? 'on' : ''}`} aria-expanded={montrer} onClick={() => { setMontrer(!montrer); setDd(null); }}>
          <Ic n="grid" />Filtres{puces.length > 0 && <> · <b>{puces.length}</b></>}<i className="chev" />
        </button>
        <button type="button" className="xfc" data-xdd="sort" aria-expanded={dd === 'sort'} onClick={() => setDd(dd === 'sort' ? null : 'sort')}>Tri : <b>{triLibelle}</b><i className="chev" /></button>
        <button type="button" className="xfc" data-xdd="cpm" aria-expanded={dd === 'cpm'} onClick={() => setDd(dd === 'cpm' ? null : 'cpm')}>Dépense estimée : <b>CPM {cpm} €</b><i className="chev" /></button>
        <span className="xstat"><b>{stat.pubs}</b> pub{stat.pubs > 1 ? 's' : ''} · {stat.annonceurs} annonceur{stat.annonceurs > 1 ? 's' : ''}{stat.suite}</span>
      </div>
      {montrer && (
        <section className="tile xfilters">
          {filtres.map((g) => (
            <div className="xfg" key={g.groupe}><span className="lbl">{g.groupe}</span><div className="xfl">
              {g.filtres.map((f) => {
                const v = valeur(f.cle);
                const lbl = v ? f.options.find(([k]) => k === v)?.[1] ?? v : '';
                return <button key={f.cle} type="button" className={`xfc ${v ? 'on' : ''}`} data-xdd={f.cle} aria-expanded={dd === f.cle} onClick={() => setDd(dd === f.cle ? null : f.cle)}>{f.libelle}{lbl && <> : <b>{lbl}</b></>}<i className="chev" /></button>;
              })}
            </div></div>
          ))}
        </section>
      )}
      {dd === 'vues' ? (
        <PanneauVues criteres={criteres} vues={vues} active={active} majVues={setVues} ouvrir={ouvrir} />
      ) : dd === 'sort' ? (
        <div className="tile fpanel" role="listbox">
          {triMeta
            ? TRIS_VEILLE.map(([k, l]) => <button key={k} type="button" className="fopt" aria-pressed={triActif === k} onClick={() => aller({ sort: k, vue: vue === 'tendance' ? undefined : vue })}><span>{l}</span></button>)
            : <p className="muted" style={{ padding: '6px 10px' }}>Le tri n’est proposé par la source que sur Meta.</p>}
        </div>
      ) : dd === 'cpm' ? (
        <div className="tile fpanel" role="listbox">
          {CPM_VEILLE.map((n) => <button key={n} type="button" className="fopt" aria-pressed={cpm === n} onClick={() => aller({ cpm: n, page: criteres.page })}><span>CPM {n} €</span><small>Coût pour 1 000 impressions, pour estimer la dépense</small></button>)}
        </div>
      ) : filtreOuvert ? (
        <div className={`tile fpanel ${filtreOuvert.options.length > 9 ? 'wide' : ''}`.trim()} role="listbox">
          {[['', 'Tous'] as const, ...filtreOuvert.options].map(([k, l]) => (
            <button key={k || 'tous'} type="button" className="fopt" aria-pressed={(valeur(filtreOuvert.cle) ?? '') === k} onClick={() => aller({ [filtreOuvert.cle]: k || undefined, ...(filtreOuvert.cle === 'p' && k !== 'meta' ? { searchIn: undefined, sort: undefined } : {}) })}><span>{l}</span></button>
          ))}
        </div>
      ) : null}
      {puces.length > 0 && (
        <div className="fsum">
          {puces.map((p) => <button key={p.cle} type="button" className="chip" onClick={() => aller({ [p.cle]: undefined })}>{p.libelle}<Ic n="x" /></button>)}
          <button type="button" className="chip" onClick={() => aller({ p: undefined, country: undefined, media: undefined, status: undefined, searchIn: undefined })}>Tout effacer</button>
        </div>
      )}
    </>
  );
}
