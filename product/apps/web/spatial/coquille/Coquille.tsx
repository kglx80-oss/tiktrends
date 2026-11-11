'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FOND_SURCOUCHE_OPAQUE, ecranSpatial, cheminPorte, sectionDuChemin, groupesPalette, modulesMobiles, messageRaccourciIndisponible, raccourciDeLaFrappe, raccourcisActifs, toucheVisible, EVENEMENT_PREFERENCE_RACCOURCIS, type EntreeRail, type PreferencesTouches, type PorteeRaccourci, type PrefixeRaccourci, type Raccourci, type SectionSpatiale } from '@tiktrends/core';
import { railCookieString } from '../../lib/rail-preference';
import { setActiveBrand } from '../../app/actions/brands';
import { listerProjets } from '../../app/actions/studios/projets';
import { SPRITE_SYMBOLES } from '../sprite';
import { Ic, Lien, Touche, useTelephone } from '../communs';
import { useCiblesTactiles } from './CiblesTactiles';
import { FournisseurSpatial, type CtxSpatial, type PanneauSpatial } from './contexte';
import { BandeauNotification, VueNotifications, useNotifications } from './Notifications';
import { FeuilleMarques, FeuilleModules, MenuProfil, Palette } from './Surcouches';
import { AideRaccourcis } from './Raccourcis';
import { TiroirJarvis } from './TiroirJarvis';
import type { FiltreNotif, LogoParDefautAffiche, SignalLogoAReimporter } from '@tiktrends/core';
import type { NotifItem } from '../../app/actions/notifications';

/**
 * La coquille Spatial · le DOM de `docs/spatial/reference/_coquille.html`, à
 * l'identique (fond `.bg/.bg2`, `nav.rail.glass`, `main.win.glass`, bulle
 * `.jv`, panneaux `.sheet` / `#memenu` / `#notif`, toast, palette, sprite).
 * Le CSS de la maquette fait la mise en forme, mobile compris (le rail devient
 * la barre du bas, `more-only` passe dans « Tous les modules »).
 *
 * Tout ce que la maquette SIMULE est ici RÉEL ou absent · marques et rôle de la
 * session, vraie déconnexion, vraies notifications (table `notifications`,
 * bandeau `#nban` pour une notification arrivée pendant la visite), vrais
 * crédits, vraie conversation Jarvis dans le tiroir `#jdraw`, palette ⌘K vers
 * de vraies pages et les vrais projets de la marque. L'aperçu de rôle de la
 * maquette (changer de rôle pour voir) est une simulation · absent.
 *
 * Surcouches · une seule ouverte à la fois (`panneau`), Échap ferme et rend le
 * focus au bouton qui l'a ouverte, un clic hors du panneau Notifications ou
 * Profil le ferme, un changement d'écran ferme tout.
 *
 * Raccourcis clavier (lot 13) · UNE table au noyau (`RACCOURCIS`) · l'écouteur
 * ci-dessous lui demande ce que veut chaque frappe (`raccourciDeLaFrappe` ·
 * jamais dans une saisie, un lecteur, sous une fenêtre modale, avec un
 * modificateur imprévu, ni coupé par la préférence `tt_raccourcis`, relue à
 * chaque frappe), la fenêtre d'aide (« ? », bouton du rail) liste la même
 * table. Une destination suit les droits · l'entrée du rail, ou le chemin ouvert.
 */

export interface DonneesCoquille {
  entrees: EntreeRail[];
  espace: EntreeRail[];
  /**
   * `logoUrl` · l'adresse d'AFFICHAGE du logo par défaut (route média) ;
   * `logoAVerifier` · il a une empreinte · si l'image ne s'affiche pas, la
   * coquille demande pourquoi (`etatLogo`), une fois.
   */
  marque: { id: string; nom: string; logoUrl: string | null; imageUrl: string | null; logoAVerifier?: boolean } | null;
  marques: Array<{ id: string; nom: string }>;
  peutGererMarques: boolean;
  admin: boolean;
  passer: { titre: string; sous: string } | null;
  railOuvert: boolean;
  utilisateur: CtxSpatial['utilisateur'];
  espaceNom: string;
  credits: CtxSpatial['credits'];
  nonLues: number;
  deconnexion: () => Promise<void>;
  /**
   * Les chemins ouverts par les règles d'accès (rôle + formule) · la palette et
   * « Tous les modules » n'affichent que ceux-là. Absent · seules les entrées
   * du rail font foi.
   */
  ouverts?: string[];
  /** Le tiroir Jarvis est-il ouvert à la personne (feature `jarvis`) ? */
  jarvis?: boolean;
  /** Reprise du parcours d'accueil depuis le menu profil · `null` = absent. */
  demarrage?: string | null;
  /** Le logo de la marque active n'a pas pu s'afficher · son état (`etatLogoMarqueActive`, même bilan que la fiche Identité). */
  etatLogo?: (e: { brandId: string }) => Promise<LogoParDefautAffiche | null>;
  /**
   * Lot 13 ter · les touches VISIBLES · la préférence (cookie `tt_raccourcis`)
   * et la plateforme (en-têtes), lues au rendu serveur pour que la touche
   * dessinée soit juste dès le premier rendu. Absent · actifs, Ctrl.
   */
  raccourcis?: PreferencesTouches;
}

/** `document.cookie` · vide s'il est indisponible (préférences bloquées). */
function lireCookies(): string {
  try { return document.cookie; } catch { return ''; }
}

/** macOS (et iPadOS) · l'aide écrit ⌘ au lieu de Ctrl. */
function estMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
}

function EntreeLien({ e, actif, onNav }: { e: EntreeRail; actif: boolean; onNav?: () => void }) {
  const cls = [actif ? 'on' : '', e.plusSeulement ? 'more-only' : ''].filter(Boolean).join(' ');
  const contenu = (
    <>
      <Ic n={e.icone} s={false} />
      <span className="lab"><strong>{e.titre}</strong><small>{e.sous}</small></span>
      {e.bientot && <Ic n="lock" s={false} c="lk" />}
      <span className="tip">{e.bientot ? `${e.titre} · bientôt` : e.titre}</span>
      <span className="sr">{e.bientot ? `${e.titre}, bientôt disponible` : e.titre}</span>
      {e.pastille && <span className={e.pastille.classe} aria-label={e.pastille.libelle}>{e.pastille.valeur}</span>}
    </>
  );
  if (!e.href) {
    return <a className={`${cls} locked`.trim()} aria-disabled="true" tabIndex={-1} data-r={e.cle} onClick={onNav}>{contenu}</a>;
  }
  return <Lien href={e.href} data-r={e.cle} className={cls} aria-current={actif ? 'page' : undefined}>{contenu}</Lien>;
}

export function Coquille({ donnees, children }: { donnees: DonneesCoquille; children: ReactNode }) {
  const d = donnees;
  const router = useRouter();
  const chemin = usePathname() || '/';
  const section: SectionSpatiale | null = ecranSpatial(chemin)?.section ?? sectionDuChemin(chemin);
  const [railOuvert, setRailOuvert] = useState(d.railOuvert);
  const [panneau, setPanneau] = useState<PanneauSpatial>(null);
  const [palette, setPalette] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<FiltreNotif>('tout');
  const [projets, setProjets] = useState<Array<{ id: string; titre: string }> | null>(null);
  const [brouillon, setBrouillon] = useState<{ texte: string; n: number } | null>(null);
  const [maintenant, setMaintenant] = useState(() => new Date());
  const notifs = useNotifications(d.nonLues);
  const chargerNotifs = notifs.charger;
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const declencheur = useRef<HTMLElement | null>(null);
  // La première touche d'une séquence (« g » puis une lettre), en attente.
  const prefixe = useRef<PrefixeRaccourci | null>(null);
  // Lot 13 bis · l'aide filtrée (« Raccourcis » d'un projet) · `null` · l'aide entière.
  const [filtreAide, setFiltreAide] = useState<readonly PorteeRaccourci[] | null>(null);
  // Lot 13 ter · les touches visibles · la préférence suit chaque bascule (aide, Mon profil), la plateforme le navigateur.
  const [touchesActives, setTouchesActives] = useState(d.raccourcis?.actifs ?? true);
  const [mac, setMac] = useState(d.raccourcis?.mac ?? false);
  useEffect(() => {
    setMac(estMac());
    const suivre = () => setTouchesActives(raccourcisActifs(lireCookies()));
    window.addEventListener(EVENEMENT_PREFERENCE_RACCOURCIS, suivre);
    return () => window.removeEventListener(EVENEMENT_PREFERENCE_RACCOURCIS, suivre);
  }, []);
  const touches = useMemo<PreferencesTouches>(() => ({ actifs: touchesActives, mac }), [touchesActives, mac]);
  const toucheJarvis = toucheVisible('jarvis', touches);
  const toucheAide = toucheVisible('aide', touches);
  const toucheRail = toucheVisible('rail', touches);
  // Le logo de la marque active · une image qui ne s'affiche pas cède la place
  // à l'initiale ; pour un logo importé (empreinte), la raison est demandée UNE
  // fois par marque · « Logo à réimporter » le dit, avec le chemin vers l'Identité.
  const [logoKo, setLogoKo] = useState<string | null>(null);
  const [signalLogo, setSignalLogo] = useState<{ brandId: string; signal: SignalLogoAReimporter } | null>(null);
  const logoDemande = useRef(new Set<string>());
  const imgLogo = useRef<HTMLImageElement | null>(null);
  const marqueId = d.marque?.id ?? null;
  const logoAffiche = d.marque?.logoUrl ?? null;
  const logoAVerifier = !!d.marque?.logoAVerifier;
  const etatLogo = d.etatLogo;
  const logoEchoue = useCallback(() => {
    if (!marqueId || !logoAffiche) return;
    setLogoKo(`${marqueId} ${logoAffiche}`);
    if (!logoAVerifier || !etatLogo || logoDemande.current.has(marqueId)) return;
    logoDemande.current.add(marqueId);
    void etatLogo({ brandId: marqueId }).then((r) => { if (r?.signal) setSignalLogo({ brandId: marqueId, signal: r.signal }); }).catch(() => undefined);
  }, [marqueId, logoAffiche, logoAVerifier, etatLogo]);
  // Une image en erreur AVANT l'hydratation n'appelle pas `onError` · relue au montage.
  useEffect(() => { const i = imgLogo.current; if (i && i.complete && i.naturalWidth === 0) logoEchoue(); }, [logoEchoue]);
  const montrerLogo = !!logoAffiche && logoKo !== `${marqueId} ${logoAffiche}`;
  const signal = signalLogo && signalLogo.brandId === marqueId ? signalLogo.signal : null;

  // Les chemins ouverts · la palette et « Tous les modules » en dépendent.
  const ouverts = useMemo(() => new Set(d.ouverts ?? [...d.entrees, ...d.espace].map((e) => e.href).filter((h): h is string => !!h)), [d.ouverts, d.entrees, d.espace]);
  const ouvert = (h: string) => ouverts.has(h);
  const jarvis = d.jarvis ?? d.entrees.some((e) => e.cle === 'jarvis');
  const creer = ouvert('/studio/projets') ? '/studio/projets/nouveau' : null;

  // La section d'accent et le rail suivent l'écran (le premier rendu les tient
  // déjà du serveur · ceci couvre la navigation client).
  useEffect(() => { if (section) document.body.dataset.sec = section; }, [section]);
  // Au téléphone, les primitives de la maquette (boutons, puces, onglets, cloche,
  // avatar, interrupteurs) reçoivent une cible tactile de 44 px · après la
  // section, dont dépend le zoom de la vue.
  const telephone = useTelephone();
  useCiblesTactiles(telephone);
  useEffect(() => { document.body.classList.toggle('rail-open', railOuvert); }, [railOuvert]);
  useEffect(() => { document.body.classList.toggle('jd-open', panneau === 'jarvis'); }, [panneau]);
  // Le fond flou de la maquette · l'image de la marque active, sinon rien.
  // Un logo qui ne s'affiche pas ne sert pas non plus de fond.
  const fond = montrerLogo ? d.marque?.imageUrl ?? null : null;
  useEffect(() => {
    if (fond) document.body.style.setProperty('--img', `url(${JSON.stringify(fond)})`);
    else document.body.style.removeProperty('--img');
  }, [fond]);

  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (minuteur.current) clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setToastMsg(null), 2600);
  }, []);

  /** Ferme la surcouche ouverte et rend le focus à ce qui l'a ouverte. */
  const fermer = useCallback(() => {
    setPanneau(null); setPalette(false);
    const el = declencheur.current; declencheur.current = null;
    if (el && document.contains(el)) setTimeout(() => el.focus(), 0);
  }, []);

  const basculer = useCallback((p: Exclude<PanneauSpatial, null>) => {
    setPalette(false);
    setPanneau((cur) => {
      if (cur === p) { const el = declencheur.current; declencheur.current = null; if (el) setTimeout(() => el.focus(), 0); return null; }
      declencheur.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
      return p;
    });
    if (p === 'notifs') { setMaintenant(new Date()); void chargerNotifs(); }
  }, [chargerNotifs]);

  const ouvrirPalette = useCallback(() => {
    declencheur.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    setPanneau(null); setPalette(true);
  }, []);

  const ouvrirJarvis = useCallback((texte?: string) => {
    if (!jarvis) return;
    if (texte) setBrouillon((b) => ({ texte, n: (b?.n ?? 0) + 1 }));
    setPalette(false);
    setPanneau((cur) => {
      if (cur !== 'jarvis') declencheur.current = document.getElementById('jv');
      return 'jarvis';
    });
  }, [jarvis]);

  // Les vrais projets récents de la marque active · lus à la PREMIÈRE
  // ouverture de la palette (lecture seule, gardée par les droits Studios).
  useEffect(() => {
    if (!palette || projets !== null) return;
    if (!d.marque || !ouvert('/studio/projets')) { setProjets([]); return; }
    void listerProjets({ brandId: d.marque.id, limite: 6 })
      .then((r) => setProjets('projets' in r && r.ok ? r.projets.map((x) => ({ id: x.id, titre: x.title })) : []))
      .catch(() => setProjets([]));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette, projets, d.marque]);

  // Échap ferme ce qui est ouvert · le reste passe par la table des raccourcis
  // (Ctrl K ou ⌘ K, « ? », J, [, N, I, « g » puis une lettre).
  const agir = useRef<(r: Raccourci) => void>(() => {});
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (palette || panneau)) { e.preventDefault(); prefixe.current = null; fermer(); return; }
      const t = e.target instanceof Element ? e.target : null;
      const r = raccourciDeLaFrappe(
        { key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, shiftKey: e.shiftKey, repetee: e.repeat, dejaTraitee: e.defaultPrevented },
        {
          actifs: raccourcisActifs(lireCookies()),
          modaleOuverte: !!document.querySelector('[aria-modal="true"]'),
          cible: t ? {
            tagName: t.tagName,
            editable: (t as HTMLElement).isContentEditable === true || !!t.closest('[contenteditable]:not([contenteditable="false"])'),
            role: t.getAttribute('role'),
            dansLecteur: !!t.closest('video, audio'),
          } : null,
          prefixe: prefixe.current,
          maintenant: Date.now(),
        },
      );
      prefixe.current = r.prefixe;
      if (r.empecher) e.preventDefault();
      if (r.raccourci) agir.current(r.raccourci);
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [fermer, palette, panneau]);
  // Un clic hors du panneau Notifications ou Profil le ferme (maquette).
  useEffect(() => {
    if (panneau !== 'notifs' && panneau !== 'profil') return;
    const id = panneau === 'notifs' ? 'notif' : 'memenu';
    const declenche = panneau === 'notifs' ? '#bell' : '#me';
    const clic = (e: MouseEvent) => {
      const t = e.target as Element | null;
      if (!t || t.closest(`#${id}`) || t.closest(declenche)) return;
      setPanneau(null);
    };
    document.addEventListener('mousedown', clic);
    return () => document.removeEventListener('mousedown', clic);
  }, [panneau]);
  // Le panneau ouvert reçoit le focus (lecteur d'écran, clavier).
  useEffect(() => {
    const id = panneau === 'notifs' ? 'notif' : panneau === 'profil' ? 'memenu' : panneau === 'marques' || panneau === 'modules' ? 'sheet' : null;
    if (id) document.getElementById(id)?.focus();
  }, [panneau]);
  // Un changement d'écran referme les surcouches.
  useEffect(() => { setPanneau(null); setPalette(false); }, [chemin]);

  const basculerRail = useCallback(() => {
    const ouvert = !railOuvert;
    setRailOuvert(ouvert);
    document.cookie = railCookieString(!ouvert);
    return ouvert;
  }, [railOuvert]);

  // Lot 13 bis · l'aide, entière ou filtrée · chaque ouverture pose SON filtre (« ? » et le rail · aucun).
  const ouvrirRaccourcis = useCallback((portees?: readonly PorteeRaccourci[]) => {
    setFiltreAide(portees && portees.length ? portees : null);
    if (panneau !== 'raccourcis') basculer('raccourcis');
  }, [panneau, basculer]);

  const ctx = useMemo<CtxSpatial>(() => ({
    utilisateur: d.utilisateur, credits: d.credits, nonLues: notifs.nonLues, ouvrirPalette, basculer, toast, panneau, ouvrirJarvis,
    ouvrirRaccourcis, rail: { ouvert: railOuvert, basculer: basculerRail }, touches,
  }), [d.utilisateur, d.credits, notifs.nonLues, ouvrirPalette, basculer, toast, panneau, ouvrirJarvis, ouvrirRaccourcis, railOuvert, basculerRail, touches]);

  const naviguer = (href: string) => {
    setPalette(false); setPanneau(null);
    if (cheminPorte(href)) router.push(href); else window.location.assign(href);
  };

  const groupes = useMemo(() => groupesPalette({ ouverts, marque: d.marque, projets: projets ?? [] }), [ouverts, d.marque, projets]);

  /** Ouvre l'aide des raccourcis, entière · le focus reviendra à ce qui l'avait. */
  const ouvrirAide = () => ouvrirRaccourcis();

  // Ce que fait chaque entrée de la coquille · relu à chaque frappe (état courant).
  agir.current = (r: Raccourci) => {
    const a = r.action;
    if (!a) return;
    if (a.type === 'palette') ouvrirPalette();
    else if (a.type === 'aide') ouvrirAide();
    else if (a.type === 'jarvis') { if (jarvis) ouvrirJarvis(); else toast(messageRaccourciIndisponible(r)); }
    else if (a.type === 'rail') toast(basculerRail() ? 'Menu déployé' : 'Menu réduit');
    else if (a.type === 'aller') {
      const e = [...d.entrees, ...d.espace].find((x) => x.cle === a.section && x.href);
      if (e?.href) naviguer(e.href); else toast(messageRaccourciIndisponible(r));
    } else if (a.type === 'ouvrir') {
      if (ouvert(a.requis) && cheminPorte(a.href)) naviguer(a.href); else toast(messageRaccourciIndisponible(r));
    }
  };

  const ouvrirNotif = (n: NotifItem) => { notifs.marquer(n); setPanneau(null); notifs.fermerBandeau(); };

  return (
    <FournisseurSpatial value={ctx}>
      <div className="bg" aria-hidden="true" /><div className="bg2" aria-hidden="true" />
      {/* `min-height` · la feuille de la maquette pose `html,body{min-height:100%}`,
          qui ne résout pas (hauteur de `html` indéfinie) · sur une page plus
          courte que l'écran en mobile, le `body` opaque s'arrêtait sous le
          contenu et le fond flou apparaissait en bande grise dessous. */}
      <div className="app" style={{ minHeight: '100vh' }} inert={panneau === 'raccourcis' || undefined}>
        <nav className="rail glass" aria-label="Navigation principale">
          {/* `width:auto` · la maquette donne `width:100%` à la rangée de marque ;
              en barre mobile (≤ 760 px) ses deux enfants sont masqués, mais elle
              réclamait toute la largeur et écrasait les onglets à 20 px. En
              bureau, `auto` rend la même largeur (rail fermé · déjà `auto` ;
              rail ouvert · `align-items:stretch`). */}
          <div className="brandrow" style={{ width: 'auto' }}>
            <button className={montrerLogo ? 'logo hasfav' : 'logo'} id="brandsw" type="button" aria-label={`Changer de marque${d.marque ? ` · ${d.marque.nom}` : ''}${signal ? ` · ${signal.libelle}` : ''}`}
              title={signal ? `${signal.libelle} · ${signal.raison}` : undefined} data-logo-etat={signal ? 'a_reimporter' : undefined}
              onClick={() => basculer('marques')} aria-expanded={panneau === 'marques'} style={signal ? { position: 'relative' } : undefined}>
              {montrerLogo ? <img ref={imgLogo} src={logoAffiche!} alt="" width={32} height={32} onError={logoEchoue} /> : (d.marque?.nom ?? '?').slice(0, 1).toUpperCase()}
              {signal && <span className="rbadge" aria-hidden="true">!</span>}
            </button>
            <span className="lab"><strong>{d.marque?.nom ?? 'Aucune marque'}</strong><small>{signal ? signal.libelle : 'Changer de marque'}</small></span>
          </div>
          {d.entrees.map((e) => <EntreeLien key={e.cle} e={e} actif={e.cle === section} onNav={e.bientot ? () => toast(e.bientot!) : undefined} />)}
          <span className="sepr" />
          {d.espace.map((e) => <EntreeLien key={e.cle} e={e} actif={e.cle === section} />)}
          {d.admin && (
            <Lien href="/admin" id="radmin" className={section === 'admin' ? 'radmin on' : 'radmin'} aria-current={section === 'admin' ? 'page' : undefined}>
              <Ic n="shield" s={false} /><span className="lab"><strong>Tour de contrôle</strong><small>Admin+ · pilotage interne</small></span><span className="tip">Tour de contrôle · Admin+</span>
            </Lien>
          )}
          <span className="rspacer" />
          {d.passer && (
            <Lien href="/billing" className="rup" data-r="forfaits">
              <span className="rup-ic"><Ic n="spark" /></span><span className="lab"><strong>{d.passer.titre}</strong><small>{d.passer.sous}</small></span><span className="tip">Forfaits &amp; crédits</span>
            </Lien>
          )}
          {/* Lot 13 ter · la touche « [ », lue dans la table, à côté du libellé (masqué rail réduit) · écart déclaré. */}
          <button className="railtg" id="railtg" type="button" aria-label={railOuvert ? 'Réduire le menu' : 'Déployer le menu'} aria-expanded={railOuvert} aria-keyshortcuts={toucheRail?.aria} onClick={basculerRail}>
            <Ic n="side" /><span className="lab"><strong>Réduire le menu<Touche t={toucheRail} /></strong></span>
          </button>
          {/* Lot 13 · l'aide des raccourcis, hors maquette · même primitive que
              « Réduire le menu » (`.railtg`, masquée au téléphone par la feuille). */}
          <button className="railtg" id="raccourcis-aide" type="button" aria-label="Raccourcis clavier" title="Raccourcis clavier" aria-haspopup="dialog" aria-expanded={panneau === 'raccourcis'} aria-keyshortcuts={toucheAide?.aria} onClick={ouvrirAide}>
            <Ic n="q" /><span className="lab"><strong>Raccourcis clavier<Touche t={toucheAide} /></strong></span>
          </button>
          <button className="morebtn" id="morebtn" type="button" aria-label="Plus de modules" onClick={() => basculer('modules')} aria-expanded={panneau === 'modules'}
            style={{ width: 48, height: 48, borderRadius: '50%', border: 0, background: 'none', color: 'var(--fg2)', placeContent: 'center', cursor: 'pointer' }}>
            <Ic n="more" s={false} />
          </button>
        </nav>
        <main className="win glass" id="win">{children}</main>
      </div>

      <div className="orn glass" id="orn" hidden />
      {jarvis && (
        <button className="jv" id="jv" type="button" aria-label="Demander à Jarvis sur cette page" aria-expanded={panneau === 'jarvis'} title="Demander à Jarvis sur cette page"
          aria-keyshortcuts={toucheJarvis?.aria} onClick={() => (panneau === 'jarvis' ? fermer() : ouvrirJarvis())}>
          <span className="orb">J</span>
          {/* Lot 13 ter · la touche du tiroir, lue dans la table, en pastille sur l'orbe (rien au téléphone, sans clavier) · écart déclaré. */}
          {!telephone && <Touche t={toucheJarvis} style={{ position: 'absolute', top: -6, left: -6, margin: 0, background: 'var(--glass)', backdropFilter: 'var(--blur)', color: 'var(--fg2)', pointerEvents: 'none' }} />}
        </button>
      )}

      <div className="sheet glass" id="sheet" tabIndex={-1} hidden={panneau !== 'marques' && panneau !== 'modules'}>
        {panneau === 'marques' && (
          <FeuilleMarques marques={d.marques} active={d.marque?.id ?? null} ajouter={d.peutGererMarques ? '/brands/new' : null} signalLogo={signal}
            onChoisir={(id) => {
              if (id === d.marque?.id) { fermer(); return; }
              void setActiveBrand(id).then(() => { setPanneau(null); setProjets(null); router.refresh(); }).catch(() => toast('La marque n’a pas pu être changée. Réessaie.'));
            }} />
        )}
        {panneau === 'modules' && <FeuilleModules modules={modulesMobiles({ ouverts, marque: d.marque })} />}
      </div>

      <section className="notif glass memenu" id="memenu" tabIndex={-1} hidden={panneau !== 'profil'} aria-label="Profil" style={{ background: FOND_SURCOUCHE_OPAQUE }}>
        {panneau === 'profil' && (
          <MenuProfil utilisateur={d.utilisateur} equipe={ouvert('/team') ? '/team' : null} forfaits={ouvert('/billing') ? '/billing' : null}
            demarrage={d.demarrage ?? null} deconnexion={d.deconnexion} />
        )}
      </section>

      <section className="notif glass" id="notif" tabIndex={-1} hidden={panneau !== 'notifs'} aria-label="Notifications" style={{ background: FOND_SURCOUCHE_OPAQUE }}>
        {panneau === 'notifs' && (
          <VueNotifications items={notifs.items} nonLues={notifs.nonLues} filtre={filtre} maintenant={maintenant}
            onFiltre={setFiltre} onToutLire={notifs.toutLire} onOuvrir={ouvrirNotif} onMarquer={notifs.marquer} />
        )}
      </section>

      {notifs.bandeau && panneau !== 'notifs' && (
        <BandeauNotification n={notifs.bandeau} maintenant={new Date()} onOuvrir={ouvrirNotif}
          onTout={() => { notifs.fermerBandeau(); declencheur.current = document.getElementById('bell'); setPanneau('notifs'); setMaintenant(new Date()); }}
          onFermer={notifs.fermerBandeau} />
      )}

      {jarvis && (
        <TiroirJarvis ouvert={panneau === 'jarvis'} marque={d.marque ? { id: d.marque.id, nom: d.marque.nom } : null} creer={creer}
          brouillon={brouillon} onFermer={fermer} onNaviguer={naviguer} toast={toast} chemin={chemin} />
      )}

      {palette && <Palette groupes={groupes} onNaviguer={naviguer} onFermer={fermer} onTheme={toast} />}

      {panneau === 'raccourcis' && <AideRaccourcis onFermer={fermer} mac={mac} portees={filtreAide} onTout={() => setFiltreAide(null)} />}

      <div className={toastMsg ? 'toast on' : 'toast'} id="toast" role="status" aria-live="polite">{toastMsg}</div>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: SPRITE_SYMBOLES }} />
    </FournisseurSpatial>
  );
}
