'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { CPM_VEILLE, FILTRES_VEILLE, TRIS_VEILLE, lienVeille, pucesVeille, verrouAction, videoLisible, type CriteresVeille, type PlateformeVeille, type TriVeille, type VueVeille } from '@tiktrends/core';
import type { InspoAd } from '@tiktrends/integrations';
import { saveAd, unsaveAd, followBrand, unfollowBrand } from '../../../app/actions/inspo';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Lien } from '../../communs';
import type { CarteVeilleDonnees } from './types';

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

const sauver = (ad: InspoAd) => (vers: boolean) => (vers ? saveAd({ platform: ad.platform, externalId: ad.id, snapshot: ad }) : unsaveAd({ platform: ad.platform, externalId: ad.id }));
const direSauvegarde = (vers: boolean) => (vers ? 'Pub gardée dans tes sauvegardes' : 'Retirée des sauvegardes');

/** Le marque-page de la carte (`button.xi`). */
export function IconeSauvegarde({ ad, initial }: { ad: InspoAd; initial: boolean }) {
  const b = useBascule(initial, sauver(ad), direSauvegarde);
  return (
    <button type="button" className="xi" aria-pressed={b.etat} disabled={b.attente} aria-label={b.etat ? 'Retirer des sauvegardes' : 'Sauvegarder'} onClick={b.basculer}>
      <Ic n="bookmark" />
    </button>
  );
}

/** Le bouton « Sauvegarder / Gardée » (`button.btn`) · Sauvegardes, détail d'une pub. */
export function BoutonSauvegarde({ ad, initial, classe = 'btn sm', libelles = ['Sauvegarder', 'Gardée'] }: { ad: InspoAd; initial: boolean; classe?: string; libelles?: [string, string] }) {
  const b = useBascule(initial, sauver(ad), direSauvegarde);
  return (
    <button className={classe} type="button" aria-pressed={b.etat} disabled={b.attente} onClick={b.basculer}>
      <Ic n="bookmark" />{b.etat ? libelles[1] : libelles[0]}
    </button>
  );
}

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

/* ───────────────────────── la carte et son détail ───────────────────────── */

const LOGO_META = (
  <svg viewBox="0 0 36 24" aria-hidden="true"><path fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.5C4.5 9.5 7.3 5 10.6 5c4.3 0 7.6 8.6 10.6 12.4 1.9 2.4 3.5 3.1 5 3.1 2.9 0 5.3-2.9 5.3-7.6C31.5 8.3 29.3 5 26.2 5c-3.9 0-7.2 6.8-9.2 9.8S12.6 21 10.2 21c-3.4 0-5.7-2-5.7-5.5z" /></svg>
);

function Portail({ children }: { children: ReactNode }) {
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  return monte ? createPortal(children, document.body) : null;
}

/** La carte d'une annonce (`article.xa`) · balisage de `xCard`, valeurs réelles. */
export function CarteVeille({ c, coutJarvis }: { c: CarteVeilleDonnees; coutJarvis: string }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <article className="xa" id={c.ancre ?? undefined}>
      <div className="xh">
        <span className="av" style={{ background: c.marque.fond }}>{c.marque.initiale}</span>
        <div className="xn">
          <strong>{c.marque.nom}</strong>
          <small><i className={c.active ? 'live' : 'off'} />{c.jours}{c.signaux.map((s) => <span key={s.titre} title={s.titre}><Ic n={s.icone} />{s.texte}</span>)}</small>
        </div>
        <IconeSauvegarde ad={c.ad} initial={c.sauvee} />
      </div>
      <div className="xm">
        {c.pays && <span className="xc">{c.pays}</span>}
        {c.portee && <span title="Portée"><Ic n="users" />{c.portee}</span>}
        {c.depense && <span title="Dépense estimée · borne basse, au CPM choisi">≈ {c.depense}</span>}
        {c.croissance && <span className={c.croissance.classe} title="Croissance de la portée sur 7 jours">{c.croissance.texte}</span>}
      </div>
      <p className="xp">{c.texte}</p>
      <button type="button" className="xv" aria-label={`Voir le détail de la pub ${c.marque.nom}`} onClick={() => setOuvert(true)}>
        <div className={`comp ${c.ratio}`.trim()}>{c.image && <img src={c.image} alt="" loading="lazy" referrerPolicy="no-referrer" />}</div>
        {c.tendance && <span className="xt hot"><Ic n="chart" />Tendance</span>}<span className="xt st">{c.style}</span>
      </button>
      <div className="xf"><div><small>{c.domaine}</small><strong>{c.titre}</strong></div>{c.cta && <span className="xcta">{c.cta}</span>}</div>
      <div className="xact2"><Lien className="btn sm pri" href={c.iterer}><Ic n="loop" />Itérer depuis cette créa</Lien></div>
      {ouvert && <Portail><DetailVeille c={c} coutJarvis={coutJarvis} fermer={() => setOuvert(false)} /></Portail>}
    </article>
  );
}

function DetailVeille({ c, coutJarvis, fermer }: { c: CarteVeilleDonnees; coutJarvis: string; fermer: () => void }) {
  const croix = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    croix.current?.focus();
    const echap = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer(); };
    document.addEventListener('keydown', echap);
    return () => document.removeEventListener('keydown', echap);
  }, [fermer]);
  const d = c.detail;
  // Vague 4 · la vidéo se lit en place (comme l'ancienne carte) · une image reste une image.
  const video = videoLisible(c.ad);
  return (
    <div className="xmod" role="dialog" aria-modal="true" aria-label={`Pub ${c.marque.nom}`} onClick={(e) => { if (e.target === e.currentTarget) fermer(); }}>
      <div className="xmbox glass">
        <button ref={croix} type="button" className="xmx" aria-label="Fermer" onClick={fermer}><Ic n="x" s={false} /></button>
        <div className="xmv"><div className={`comp ${c.ratio}`.trim()}>{video
          ? <video src={video} poster={c.image ?? undefined} controls playsInline preload="none" aria-label={`Vidéo de la pub ${c.marque.nom}`} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
          : c.image && <img src={c.image} alt="" referrerPolicy="no-referrer" />}</div></div>
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
          <div className="kc">
            <Lien className="btn pri" href={c.iterer}><Ic n="loop" />Itérer depuis cette créa</Lien>
            <BoutonSauvegarde ad={c.ad} initial={c.sauvee} classe="btn" libelles={['Sauvegarder', 'Sauvegardée']} />
            {c.ad.advertiserName && <BoutonSuivi plateforme={c.ad.platform} nom={c.ad.advertiserName} ad={c.ad} initial={c.suivie} classe="btn" />}
            {d.annonceur && <Lien className="btn ghost" href={d.annonceur}>Toutes les pubs {c.marque.nom}</Lien>}
          </div>
          <small className="faint">Source : bibliothèques publicitaires publiques · portée relevée, dépense estimée. Jarvis · {coutJarvis}</small>
        </div>
      </div>
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
}

/**
 * `div.xbar` de la maquette · vues, filtres, tri et CPM. Chaque choix change
 * l'ADRESSE (`lienVeille`) · la page relit les critères et interroge la
 * source · un rechargement ou un Retour retrouve la même vue.
 */
export function BarreVeille({ criteres, plateforme, vue, tri, cpm, stat }: PropsBarreVeille) {
  const router = useRouter();
  const [montrer, setMontrer] = useState(false);
  const [dd, setDd] = useState<string | null>(null);
  const aller = (over: Parameters<typeof lienVeille>[1]) => { setDd(null); router.push(lienVeille(criteres, over)); };
  useEffect(() => {
    if (!dd) return;
    const dehors = (e: MouseEvent) => { const t = e.target as HTMLElement; if (!t.closest('.fpanel') && !t.closest('[data-xdd]')) setDd(null); };
    document.addEventListener('click', dehors);
    return () => document.removeEventListener('click', dehors);
  }, [dd]);
  const puces = pucesVeille(criteres);
  const triMeta = plateforme === 'meta';
  const triActif = tri;
  const triLibelle = triMeta ? TRIS_VEILLE.find(([k]) => k === triActif)?.[1] ?? 'Récentes' : 'Source';
  const filtres = FILTRES_VEILLE.map((g) => ({ ...g, filtres: g.filtres.filter((f) => !f.metaSeulement || triMeta) })).filter((g) => g.filtres.length);
  const tous = filtres.flatMap((g) => g.filtres);
  const filtreOuvert = tous.find((f) => f.cle === dd);
  const valeur = (cle: string) => (criteres as Record<string, unknown>)[cle] as string | undefined;
  const tab = (k: VueVeille, l: string, i: string) => (
    <button key={k} type="button" aria-pressed={vue === k} onClick={() => aller({ vue: k, sort: k === 'tendance' ? undefined : criteres.sort })}><Ic n={i} />{l}</button>
  );
  return (
    <>
      <div className="xbar">
        <div className="xtabs" role="group" aria-label="Vue">
          {tab('tout', 'Toutes les pubs', 'grid')}{tab('tendance', 'Tendance', 'chart')}{tab('suivies', 'Suivies', 'bookmark')}
          <button type="button" className="xnew" disabled title="Les vues enregistrées ne sont pas encore disponibles · tes filtres vivent dans l’adresse de la page, à garder en favori"><Ic n="plus" />Nouvelle vue</button>
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
      {dd === 'sort' ? (
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
