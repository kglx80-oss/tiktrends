'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FILTRES_NOTIF, grouperNotifs, libelleNonLues, nonLuesParFiltre, notifDansFiltre, presentationNotif, quandNotif, type FiltreNotif,
} from '@tiktrends/core';
import { fetchNotifications, markAllNotificationsRead, markNotificationRead, type NotifItem } from '../../app/actions/notifications';
import { Ic, Lien } from '../communs/base';

/**
 * Le panneau Notifications de la maquette (`renderNotif` · fragment
 * `docs/spatial/reference/_notifications.html`), branché sur la VRAIE table
 * `notifications` (`fetchNotifications`, `markNotificationRead`,
 * `markAllNotificationsRead`). Règles (catégories, filtres, groupes, heure
 * relative) dans `@tiktrends/core` (`spatial/coquille/notifications`).
 *
 * Absents, faute de donnée ou d'action réelle · les préférences (bouton
 * `#nprefs`), la suppression d'une notification (`.nx`), l'étiquette
 * « Nouveauté ». Le libellé de l'action est « Ouvrir » · une notification réelle
 * porte une adresse, pas un verbe.
 */

const PILL = { background: 'linear-gradient(135deg,var(--acc),var(--acc2))', color: 'var(--on)', border: 0 } as const;

function Pastille({ type }: { type: string }) {
  const p = presentationNotif(type);
  return <span className={`nic ${p.teinte}`}>{p.icone ? <Ic n={p.icone} /> : 'J'}</span>;
}

function Element({ n, maintenant, onOuvrir, onMarquer }: { n: NotifItem; maintenant: Date; onOuvrir: (n: NotifItem) => void; onMarquer: (n: NotifItem) => void }) {
  const p = presentationNotif(n.type);
  const actions = !!n.href || !n.read;
  return (
    <article className={n.read ? 'nit' : 'nit un'} data-nid={n.id}>
      <Pastille type={n.type} />
      <div className="nbody">
        <div className="nmeta"><span>{p.libelle}</span><span>·</span><span>{quandNotif(n.createdAt, maintenant)}</span></div>
        <strong>{n.title}</strong>
        {n.body && <p>{n.body}</p>}
        {actions && (
          <div className="nact">
            {n.href && <Lien className="btn sm pri" href={n.href} data-nread={n.id} onClick={() => onOuvrir(n)}>Ouvrir</Lien>}
            {!n.read && <button className="btn sm" type="button" data-nmark={n.id} onClick={() => onMarquer(n)}>Marquer comme lu</button>}
          </div>
        )}
      </div>
      {!n.read && <span className="ndot" aria-hidden="true" />}
    </article>
  );
}

export interface VueNotificationsProps {
  items: NotifItem[] | null;
  nonLues: number;
  filtre: FiltreNotif;
  maintenant: Date;
  onFiltre: (f: FiltreNotif) => void;
  onToutLire: () => void;
  onOuvrir: (n: NotifItem) => void;
  onMarquer: (n: NotifItem) => void;
}

/** Le contenu du panneau `#notif` · présentationnel (rendu tel quel par la garde de parité). */
export function VueNotifications({ items, nonLues, filtre, maintenant, onFiltre, onToutLire, onOuvrir, onMarquer }: VueNotificationsProps) {
  const compte = nonLuesParFiltre(items ?? []);
  const liste = (items ?? []).filter((n) => notifDansFiltre(n, filtre));
  const { aujourdhui, plusTot } = grouperNotifs(liste, maintenant);
  const pill = libelleNonLues(nonLues);
  const el = (n: NotifItem) => <Element key={n.id} n={n} maintenant={maintenant} onOuvrir={onOuvrir} onMarquer={onMarquer} />;
  return (
    <>
      <header className="nhd">
        <h2 id="notiftt">Notifications</h2>
        {pill && <span className="pill" style={PILL}>{pill}</span>}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="btn sm" type="button" id="nall" disabled={!nonLues} onClick={onToutLire}><Ic n="check" />Tout lire</button>
        </span>
      </header>
      <div className="seg nseg" role="group" aria-label="Filtrer les notifications">
        {FILTRES_NOTIF.map((f) => (
          <button key={f.cle} type="button" data-nf={f.cle} aria-pressed={filtre === f.cle} onClick={() => onFiltre(f.cle)}>
            <span>{f.libelle}</span>{compte[f.cle] > 0 && <i className="nct">{compte[f.cle]}</i>}
          </button>
        ))}
      </div>
      <div className="nlist">
        {items === null ? <p className="faint" role="status">Chargement…</p>
          : liste.length ? (
            <>
              {aujourdhui.length > 0 && <><div className="ngrp">Aujourd’hui</div>{aujourdhui.map(el)}</>}
              {plusTot.length > 0 && <><div className="ngrp">Plus tôt</div>{plusTot.map(el)}</>}
            </>
          ) : (
            <div className="nempty">
              <span className="nic t-update"><Ic n="check" /></span>
              <strong>Tu es à jour</strong>
              <p className="faint">{items.length ? 'Rien de nouveau dans cette catégorie.' : 'Aucune notification pour l’instant.'}</p>
            </div>
          )}
      </div>
    </>
  );
}

/** Le bandeau d'arrivée (`#nban`) · une VRAIE notification non lue, arrivée depuis l'ouverture de la page. */
export function BandeauNotification({ n, maintenant, onOuvrir, onTout, onFermer }: { n: NotifItem; maintenant: Date; onOuvrir: (n: NotifItem) => void; onTout: () => void; onFermer: () => void }) {
  const p = presentationNotif(n.type);
  return (
    <div className="nban glass in" id="nban" role="status" aria-live="polite">
      <Pastille type={n.type} />
      <div className="nbody">
        <div className="nmeta"><span>{p.libelle}</span><span>·</span><span>{quandNotif(n.createdAt, maintenant)}</span></div>
        <strong>{n.title}</strong>
        {n.body && <p>{n.body}</p>}
        <div className="nact">
          {n.href && <Lien className="btn sm pri" href={n.href} data-nread={n.id} onClick={() => onOuvrir(n)}>Ouvrir</Lien>}
          <button className="btn sm" type="button" id="nbanall" onClick={onTout}>Toutes les notifications</button>
        </div>
      </div>
      <button className="nx" type="button" id="nbanx" aria-label="Fermer" onClick={onFermer}><Ic n="x" /></button>
    </div>
  );
}

/** Intervalle de relecture · une lecture en base (20 lignes), jamais un appel payant. */
const RELECTURE_MS = 45_000;
const BANDEAU_MS = 8_000;

/**
 * L'état réel des notifications · lu au montage puis toutes les 45 s (page
 * visible), comme la cloche V5. Une non lue apparue depuis l'ouverture de la
 * page pose le bandeau (8 s) · celles déjà là au premier chargement, jamais.
 */
export function useNotifications(nonLuesInitiales: number) {
  const [items, setItems] = useState<NotifItem[] | null>(null);
  const [nonLues, setNonLues] = useState(nonLuesInitiales);
  const [bandeau, setBandeau] = useState<NotifItem | null>(null);
  const vues = useRef<Set<string> | null>(null);
  const minuteur = useRef<ReturnType<typeof setTimeout> | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await fetchNotifications();
      setItems(r.items); setNonLues(r.unread);
      if (vues.current) {
        const neuve = r.items.find((n) => !n.read && !vues.current!.has(n.id));
        if (neuve) {
          setBandeau(neuve);
          if (minuteur.current) clearTimeout(minuteur.current);
          minuteur.current = setTimeout(() => setBandeau(null), BANDEAU_MS);
        }
      }
      vues.current = new Set([...(vues.current ?? []), ...r.items.map((n) => n.id)]);
    } catch { setItems((x) => x ?? []); }
  }, []);

  useEffect(() => {
    void charger();
    const id = setInterval(() => { if (document.visibilityState === 'visible') void charger(); }, RELECTURE_MS);
    return () => { clearInterval(id); if (minuteur.current) clearTimeout(minuteur.current); };
  }, [charger]);

  const marquer = useCallback((n: NotifItem) => {
    if (n.read) return;
    setItems((l) => l?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? l);
    setNonLues((u) => Math.max(0, u - 1));
    void markNotificationRead(n.id).catch(() => {});
  }, []);

  const toutLire = useCallback(() => {
    setItems((l) => l?.map((x) => ({ ...x, read: true })) ?? l);
    setNonLues(0);
    void markAllNotificationsRead().catch(() => {});
  }, []);

  return { items, nonLues, bandeau, fermerBandeau: () => setBandeau(null), charger, marquer, toutLire };
}
