'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ecranSpatial, cheminPorte, sectionDuChemin, groupesPalette, modulesMobiles, type EntreeRail, type SectionSpatiale } from '@tiktrends/core';
import { railCookieString } from '../../lib/rail-preference';
import { setActiveBrand } from '../../app/actions/brands';
import { listerProjets } from '../../app/actions/studios/projets';
import { SPRITE_SYMBOLES } from '../sprite';
import { Ic, Lien } from '../communs';
import { FournisseurSpatial, type CtxSpatial, type PanneauSpatial } from './contexte';
import { BandeauNotification, VueNotifications, useNotifications } from './Notifications';
import { FeuilleMarques, FeuilleModules, MenuProfil, Palette } from './Surcouches';
import { TiroirJarvis } from './TiroirJarvis';
import type { FiltreNotif } from '@tiktrends/core';
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
 */

export interface DonneesCoquille {
  entrees: EntreeRail[];
  espace: EntreeRail[];
  marque: { id: string; nom: string; logoUrl: string | null; imageUrl: string | null } | null;
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

  // Les chemins ouverts · la palette et « Tous les modules » en dépendent.
  const ouverts = useMemo(() => new Set(d.ouverts ?? [...d.entrees, ...d.espace].map((e) => e.href).filter((h): h is string => !!h)), [d.ouverts, d.entrees, d.espace]);
  const ouvert = (h: string) => ouverts.has(h);
  const jarvis = d.jarvis ?? d.entrees.some((e) => e.cle === 'jarvis');
  const creer = ouvert('/studio/projets') ? '/studio/projets/nouveau' : null;

  // La section d'accent et le rail suivent l'écran (le premier rendu les tient
  // déjà du serveur · ceci couvre la navigation client).
  useEffect(() => { if (section) document.body.dataset.sec = section; }, [section]);
  useEffect(() => { document.body.classList.toggle('rail-open', railOuvert); }, [railOuvert]);
  useEffect(() => { document.body.classList.toggle('jd-open', panneau === 'jarvis'); }, [panneau]);
  // Le fond flou de la maquette · l'image de la marque active, sinon rien.
  useEffect(() => {
    if (d.marque?.imageUrl) document.body.style.setProperty('--img', `url(${JSON.stringify(d.marque.imageUrl)})`);
    else document.body.style.removeProperty('--img');
  }, [d.marque?.imageUrl]);

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

  // ⌘K / Ctrl+K ouvre la palette · Échap ferme ce qui est ouvert.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ouvrirPalette(); }
      else if (e.key === 'Escape' && (palette || panneau)) { e.preventDefault(); fermer(); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [ouvrirPalette, fermer, palette, panneau]);
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

  const ctx = useMemo<CtxSpatial>(() => ({
    utilisateur: d.utilisateur, credits: d.credits, nonLues: notifs.nonLues, ouvrirPalette, basculer, toast, panneau, ouvrirJarvis,
  }), [d.utilisateur, d.credits, notifs.nonLues, ouvrirPalette, basculer, toast, panneau, ouvrirJarvis]);

  const naviguer = (href: string) => {
    setPalette(false); setPanneau(null);
    if (cheminPorte(href)) router.push(href); else window.location.assign(href);
  };

  const groupes = useMemo(() => groupesPalette({ ouverts, marque: d.marque, projets: projets ?? [] }), [ouverts, d.marque, projets]);

  const basculerRail = () => {
    const ouvert = !railOuvert;
    setRailOuvert(ouvert);
    document.cookie = railCookieString(!ouvert);
  };

  const ouvrirNotif = (n: NotifItem) => { notifs.marquer(n); setPanneau(null); notifs.fermerBandeau(); };

  return (
    <FournisseurSpatial value={ctx}>
      <div className="bg" aria-hidden="true" /><div className="bg2" aria-hidden="true" />
      <div className="app">
        <nav className="rail glass" aria-label="Navigation principale">
          <div className="brandrow">
            <button className={d.marque?.logoUrl ? 'logo hasfav' : 'logo'} id="brandsw" type="button" aria-label={`Changer de marque${d.marque ? ` · ${d.marque.nom}` : ''}`} onClick={() => basculer('marques')} aria-expanded={panneau === 'marques'}>
              {d.marque?.logoUrl ? <img src={d.marque.logoUrl} alt="" width={32} height={32} /> : (d.marque?.nom ?? '?').slice(0, 1).toUpperCase()}
            </button>
            <span className="lab"><strong>{d.marque?.nom ?? 'Aucune marque'}</strong><small>Changer de marque</small></span>
          </div>
          {d.entrees.map((e) => <EntreeLien key={e.cle} e={e} actif={e.cle === section} onNav={e.bientot ? () => toast(e.bientot!) : undefined} />)}
          <span className="sepr" />
          {d.espace.map((e) => <EntreeLien key={e.cle} e={e} actif={e.cle === section} />)}
          {d.admin && (
            <Lien href="/admin" id="radmin" className="radmin">
              <Ic n="shield" s={false} /><span className="lab"><strong>Tour de contrôle</strong><small>Admin+ · pilotage interne</small></span><span className="tip">Tour de contrôle · Admin+</span>
            </Lien>
          )}
          <span className="rspacer" />
          {d.passer && (
            <Lien href="/billing" className="rup" data-r="forfaits">
              <span className="rup-ic"><Ic n="spark" /></span><span className="lab"><strong>{d.passer.titre}</strong><small>{d.passer.sous}</small></span><span className="tip">Forfaits &amp; crédits</span>
            </Lien>
          )}
          <button className="railtg" id="railtg" type="button" aria-label={railOuvert ? 'Réduire le menu' : 'Déployer le menu'} aria-expanded={railOuvert} onClick={basculerRail}>
            <Ic n="side" /><span className="lab"><strong>Réduire le menu</strong></span>
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
          onClick={() => (panneau === 'jarvis' ? fermer() : ouvrirJarvis())}><span className="orb">J</span></button>
      )}

      <div className="sheet glass" id="sheet" tabIndex={-1} hidden={panneau !== 'marques' && panneau !== 'modules'}>
        {panneau === 'marques' && (
          <FeuilleMarques marques={d.marques} active={d.marque?.id ?? null} ajouter={d.peutGererMarques ? '/brands/new' : null}
            onChoisir={(id) => {
              if (id === d.marque?.id) { fermer(); return; }
              void setActiveBrand(id).then(() => { setPanneau(null); setProjets(null); router.refresh(); }).catch(() => toast('La marque n’a pas pu être changée. Réessaie.'));
            }} />
        )}
        {panneau === 'modules' && <FeuilleModules modules={modulesMobiles({ ouverts, marque: d.marque })} />}
      </div>

      <section className="notif glass memenu" id="memenu" tabIndex={-1} hidden={panneau !== 'profil'} aria-label="Profil">
        {panneau === 'profil' && (
          <MenuProfil utilisateur={d.utilisateur} equipe={ouvert('/team') ? '/team' : null} forfaits={ouvert('/billing') ? '/billing' : null}
            demarrage={d.demarrage ?? null} deconnexion={d.deconnexion} />
        )}
      </section>

      <section className="notif glass" id="notif" tabIndex={-1} hidden={panneau !== 'notifs'} aria-label="Notifications">
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
          brouillon={brouillon} onFermer={fermer} onNaviguer={naviguer} toast={toast} />
      )}

      {palette && <Palette groupes={groupes} onNaviguer={naviguer} onFermer={fermer} />}

      <div className={toastMsg ? 'toast on' : 'toast'} id="toast" role="status" aria-live="polite">{toastMsg}</div>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: SPRITE_SYMBOLES }} />
    </FournisseurSpatial>
  );
}
