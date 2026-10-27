'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { COLLECTION_TOUTES, collectionsSauvegardes, dansCollection, verrouAction } from '@tiktrends/core';
import type { InspoAd } from '@tiktrends/integrations';
import { setSavedAdFolder, unsaveAd } from '../../../app/actions/inspo';
import { useSpatial } from '../../coquille/contexte';
import { Ic, Lien } from '../../communs';
import { Vignette } from './base';

/**
 * Les collections des Sauvegardes (`div.colls` de la maquette) · une
 * collection = un dossier RÉEL (`saved_ads.folder`). Ranger et retirer passent
 * par les actions existantes (`setSavedAdFolder`, `unsaveAd`) · l'écran ne
 * change qu'après le oui du serveur.
 */
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
}

export function CollectionsSauvegardes({ items: depart, creerProjet, initiale = COLLECTION_TOUTES }: { items: ReadonlyArray<SauvegardeDonnees>; creerProjet: string; initiale?: string }) {
  const [items, setItems] = useState(depart);
  const [actif, setActif] = useState(initiale);
  const [enCreation, setEnCreation] = useState<string | null>(null);
  const [saisie, setSaisie] = useState<string | null>(null);
  const collections = useMemo(() => {
    const c = collectionsSauvegardes(items);
    // Une collection nommée mais encore vide · elle existera en base dès qu'une créa y est rangée.
    if (enCreation && !c.some((x) => x.cle === `f:${enCreation}`)) c.splice(c.length - 1, 0, { cle: `f:${enCreation}`, libelle: enCreation, n: 0 });
    return c;
  }, [items, enCreation]);
  const visibles = items.filter((i) => dansCollection(i.folder, actif));
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
          <span className="faint" style={{ fontSize: '12.5px' }}>{visibles.length} créa{visibles.length > 1 ? 's' : ''}{actif === `f:${enCreation}` && visibles.length === 0 ? ` · range une créa dans « ${enCreation} » depuis son bouton « Gardée »` : ''}</span>
          <Lien className="btn pri sm" href={creerProjet} style={{ marginLeft: 'auto' }}>Créer un projet Studios</Lien>
        </div>
        <div className="vfeed" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
          {visibles.map((i) => (
            <CarteSauvegarde key={i.id} i={i} dossiers={dossiers}
              range={(folder) => setItems((l) => l.map((x) => (x.id === i.id ? { ...x, folder } : x)))}
              retire={() => setItems((l) => l.filter((x) => x.id !== i.id))} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CarteSauvegarde({ i, dossiers, range, retire }: { i: SauvegardeDonnees; dossiers: string[]; range: (f: string | null) => void; retire: () => void }) {
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
        {i.video && <span className="play"><Ic n="arrow" /></span>}
      </div>
      <div className="vmeta"><span>{i.meta[0]}</span><span>{i.meta[1]}</span></div>
      <div className="row">{i.pastilles.map((p) => <span key={p.libelle} className={`pill ${p.classe}`.trim()}>{p.libelle}</span>)}</div>
      <div className="acts">
        <button className="btn sm" type="button" aria-pressed="true" aria-expanded={menu} aria-haspopup="menu" disabled={attente} onClick={() => setMenu(!menu)}><Ic n="bookmark" />Gardée</button>
        <Lien className="btn sm" href={i.cloner}><Ic n="copy" />Cloner</Lien>
      </div>
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
