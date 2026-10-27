'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ecranSpatial, cheminPorte, sectionDuChemin, type EntreeRail, type SectionSpatiale } from '@tiktrends/core';
import { railCookieString } from '../../lib/rail-preference';
import { setActiveBrand } from '../../app/actions/brands';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type NotifItem } from '../../app/actions/notifications';
import { SPRITE_SYMBOLES } from '../sprite';
import { Ic, Lien } from '../communs';
import { FournisseurSpatial, type CtxSpatial, type PanneauSpatial } from './contexte';

/**
 * La coquille Spatial · le DOM de `docs/spatial/reference/_coquille.html`, à
 * l'identique (fond `.bg/.bg2`, `nav.rail.glass`, `main.win.glass`, bulle
 * `.jv`, panneaux `.sheet` / `#memenu` / `#notif`, toast, palette, sprite).
 * Le CSS de la maquette fait la mise en forme, mobile compris (le rail devient
 * la barre du bas, `more-only` passe dans « Tous les modules »).
 *
 * Tout ce que la maquette SIMULE est ici RÉEL ou absent · marques et rôle de la
 * session, vraie déconnexion, vraies notifications (table `notifications`),
 * vrais crédits. La bannière « Mise à jour 2.4 » et l'aperçu de rôle de la
 * maquette n'ont pas d'équivalent réel · ils ne sont pas reproduits.
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
}

const quand = (iso: string) => {
  const d = new Date(iso), j = Math.round((Date.now() - d.getTime()) / 86_400_000);
  return j <= 0 ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : j === 1 ? 'hier' : `il y a ${j} j`;
};

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
  const [requete, setRequete] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [notifs, setNotifs] = useState<NotifItem[] | null>(null);
  const [nonLues, setNonLues] = useState(d.nonLues);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);
  const champPalette = useRef<HTMLInputElement>(null);

  // La section d'accent et le rail suivent l'écran (le premier rendu les tient
  // déjà du serveur · ceci couvre la navigation client).
  useEffect(() => { if (section) document.body.dataset.sec = section; }, [section]);
  useEffect(() => { document.body.classList.toggle('rail-open', railOuvert); }, [railOuvert]);
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

  const basculer = useCallback((p: Exclude<PanneauSpatial, null>) => {
    setPanneau((cur) => (cur === p ? null : p));
    if (p === 'notifs') {
      void fetchNotifications().then((r) => { setNotifs(r.items); setNonLues(r.unread); }).catch(() => setNotifs([]));
    }
  }, []);

  const ouvrirPalette = useCallback(() => { setPalette(true); setRequete(''); setPanneau(null); }, []);

  // ⌘K / Ctrl+K ouvre la palette · Échap ferme ce qui est ouvert.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ouvrirPalette(); }
      else if (e.key === 'Escape') { setPalette(false); setPanneau(null); }
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [ouvrirPalette]);
  useEffect(() => { if (palette) champPalette.current?.focus(); }, [palette]);
  // Un changement d'écran referme les surcouches.
  useEffect(() => { setPanneau(null); setPalette(false); }, [chemin]);

  const ctx = useMemo<CtxSpatial>(() => ({
    utilisateur: d.utilisateur, credits: d.credits, nonLues, ouvrirPalette, basculer, toast,
  }), [d.utilisateur, d.credits, nonLues, ouvrirPalette, basculer, toast]);

  const naviguer = (href: string) => {
    setPalette(false); setPanneau(null);
    if (cheminPorte(href)) router.push(href); else window.location.assign(href);
  };

  const toutes = [...d.entrees, ...d.espace].filter((e) => e.href);
  const destinations = toutes.filter((e) => !requete || `${e.titre} ${e.sous}`.toLowerCase().includes(requete.toLowerCase()));

  const basculerRail = () => {
    const ouvert = !railOuvert;
    setRailOuvert(ouvert);
    document.cookie = railCookieString(!ouvert);
  };

  return (
    <FournisseurSpatial value={ctx}>
      <div className="bg" aria-hidden="true" /><div className="bg2" aria-hidden="true" />
      <div className="app">
        <nav className="rail glass" aria-label="Navigation principale">
          <div className="brandrow">
            <button className={d.marque?.logoUrl ? 'logo hasfav' : 'logo'} id="brandsw" type="button" aria-label={`Changer de marque${d.marque ? ` · ${d.marque.nom}` : ''}`} onClick={() => basculer('marques')}>
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
          <button className="morebtn" id="morebtn" type="button" aria-label="Plus de modules" onClick={() => basculer('modules')}
            style={{ width: 48, height: 48, borderRadius: '50%', border: 0, background: 'none', color: 'var(--fg2)', placeContent: 'center', cursor: 'pointer' }}>
            <Ic n="more" s={false} />
          </button>
        </nav>
        <main className="win glass" id="win">{children}</main>
      </div>

      <div className="orn glass" id="orn" hidden />
      <button className="jv" id="jv" type="button" aria-label="Demander à Jarvis" title="Demander à Jarvis" onClick={() => naviguer('/jarvis')}><span className="orb">J</span></button>

      <div className="sheet glass" id="sheet" hidden={panneau !== 'marques' && panneau !== 'modules'}>
        {panneau === 'marques' && (
          <>
            <strong>Changer de marque</strong>
            {d.marques.map((m) => (
              <a key={m.id} href="#" onClick={(ev) => {
                ev.preventDefault();
                if (m.id === d.marque?.id) { setPanneau(null); return; }
                void setActiveBrand(m.id).then(() => { setPanneau(null); router.refresh(); }).catch(() => toast('La marque n’a pas pu être changée. Réessaie.'));
              }}><Ic n={m.id === d.marque?.id ? 'check' : 'tag'} />{m.nom}</a>
            ))}
            {d.peutGererMarques && <Lien href="/brands/new"><Ic n="plus" />Ajouter une marque</Lien>}
          </>
        )}
        {panneau === 'modules' && (
          <>
            <strong>Tous les modules</strong>
            {toutes.filter((e) => e.plusSeulement).map((e) => <Lien key={e.cle} href={e.href!}><Ic n={e.icone} />{e.titre}</Lien>)}
          </>
        )}
      </div>

      <section className="notif glass memenu" id="memenu" hidden={panneau !== 'profil'} aria-label="Profil">
        {panneau === 'profil' && (
          <>
            <header className="nhd">
              <span className="me" style={{ width: 44, height: 44 }}>{d.utilisateur.initiales}</span>
              <div style={{ display: 'grid' }}>
                <strong style={{ font: '600 15px var(--sfd)' }}>{d.utilisateur.nom || d.utilisateur.email}</strong>
                <small className="faint">{d.utilisateur.email} · {d.utilisateur.role}</small>
              </div>
            </header>
            <div className="ngrp">{d.espaceNom}</div>
            <div className="nact" style={{ marginTop: 2 }}>
              {d.espace.some((e) => e.cle === 'reglages') && <Lien className="btn sm" href="/team"><Ic n="users" />Équipe</Lien>}
              {d.espace.some((e) => e.cle === 'reglages') && <Lien className="btn sm" href="/billing"><Ic n="spark" />Forfaits</Lien>}
              <Lien className="btn sm" href="/profile">Mon profil</Lien>
              <form action={d.deconnexion} style={{ marginLeft: 'auto' }}><button className="btn sm" type="submit">Se déconnecter</button></form>
            </div>
          </>
        )}
      </section>

      <section className="notif glass" id="notif" hidden={panneau !== 'notifs'} aria-label="Notifications">
        {panneau === 'notifs' && (
          <>
            <header className="nhd">
              <h2>Notifications</h2>
              {nonLues > 0 && <button className="btn sm" type="button" style={{ marginLeft: 'auto' }} onClick={() => void markAllNotificationsRead().then(() => { setNonLues(0); setNotifs((n) => n?.map((x) => ({ ...x, read: true })) ?? n); })}>Tout marquer comme lu</button>}
            </header>
            {notifs === null ? <p className="faint" role="status">Chargement…</p>
              : notifs.length === 0 ? <p className="faint">Aucune notification pour l’instant.</p>
              : notifs.map((n) => (
                <article key={n.id} className={n.read ? 'nit' : 'nit unread'}>
                  <div className="nbody">
                    <div className="nmeta"><span>{quand(n.createdAt)}</span></div>
                    <strong>{n.title}</strong>
                    {n.body && <p>{n.body}</p>}
                    {n.href && <div className="nact"><Lien className="btn sm pri" href={n.href} onClick={() => { if (!n.read) void markNotificationRead(n.id); }}>Ouvrir</Lien></div>}
                  </div>
                  {!n.read && <span className="ndot" aria-hidden="true" />}
                </article>
              ))}
          </>
        )}
      </section>

      {palette && (
        <div className="pal" id="pal" onClick={(e) => { if (e.target === e.currentTarget) setPalette(false); }}>
          <div className="box glass" role="dialog" aria-label="Rechercher">
            <input id="palin" ref={champPalette} placeholder="Rechercher une page, un projet, une action…" autoComplete="off" aria-label="Rechercher"
              value={requete} onChange={(e) => setRequete(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && destinations[0]?.href) naviguer(destinations[0].href); }} />
            <div className="res" id="palres">
              {destinations.length ? (
                <>
                  <span className="g">Pages</span>
                  {destinations.map((e) => (
                    <a key={e.cle} href={e.href!} data-palgo onClick={(ev) => { ev.preventDefault(); naviguer(e.href!); }}><Ic n={e.icone} />{e.titre}<small>{e.sous}</small></a>
                  ))}
                </>
              ) : <p className="faint" style={{ padding: 12 }}>Aucun résultat pour « {requete} »</p>}
            </div>
          </div>
        </div>
      )}

      <div className={toastMsg ? 'toast on' : 'toast'} id="toast" role="status" aria-live="polite">{toastMsg}</div>
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: SPRITE_SYMBOLES }} />
    </FournisseurSpatial>
  );
}
