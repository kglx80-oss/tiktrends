'use client';

import { Fragment, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  cheminPorte, etapesNouveauSpatial, infoEtapeNouveau, messageHorsLigneStudio, verifierNouveauProjet,
  DEPARTS_SPATIAL, JARVIS_NOUVEAU, LIVRABLES_SPATIAL, OBJECTIF_MAX, TITRE_NOUVEAU_PROJET_MAX, CHEMIN_PROJETS,
  type EtatNouveauProjet, type TypeNouveauProjet, type CleDepartSpatial,
} from '@tiktrends/core';
import { creerProjetDepuisContexte } from '../../../app/actions/studios/sources';
import { creerProjet } from '../../../app/actions/studios/projets';
import { setActiveBrand } from '../../../app/actions/brands';
import { EnTete, Ic, Lien, Vue } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import { Ornement } from './Ornement';
import { TuileVide } from './briques';

/**
 * « Nouveau projet » · `docs/spatial/reference/nouveau.html` (étape 1), balisage
 * à l'identique. Le parcours est le RÉEL : type et brief ici, création GRATUITE
 * du projet (`creerProjetDepuisContexte` quand un contexte est repris, sinon
 * `creerProjet`), puis le projet, où se décident le style et le format avec le
 * devis serveur annoncé avant toute génération. Rien n'est généré ni débité ici.
 *
 * Le bandeau Jarvis de la maquette vend un remplissage payant de l'étape · ce
 * service n'existe pas avant la création du projet. Le bandeau dit où Jarvis
 * propose vraiment (dans le projet, prix annoncé avant le clic), sans bouton.
 */

export interface PropsNouveauProjet {
  sous: string;
  etat: EtatNouveauProjet;
  marques: ReadonlyArray<{ id: string; nom: string; active: boolean }>;
  ajouterMarque: string | null;
  initial: { type: TypeNouveauProjet; titre: string; objectif: string; etape: 1 | 2 };
  /** Le titre proposé par type · remplace le titre tant que la personne ne l'a pas modifié. */
  titresParDefaut: Readonly<Record<TypeNouveauProjet, string>>;
  produits: ReadonlyArray<{ id: string; nom: string }>;
  notes: readonly string[];
  /** Ce qui est repris d'un lien (test Adsmap, annonce) · dit en clair. */
  repris: readonly string[];
  annonce: { ref: string } | null;
  retourVeille: { href: string; rv: string } | null;
}

export function NouveauProjet(p: PropsNouveauProjet) {
  const router = useRouter();
  const { toast } = useSpatial();
  const [etape, setEtape] = useState<1 | 2>(p.initial.etape);
  const [type, setType] = useState<TypeNouveauProjet>(p.initial.type);
  const [titre, setTitre] = useState(p.initial.titre);
  const titreTouche = useRef(p.initial.titre !== p.titresParDefaut[p.initial.type]);
  const [objectif, setObjectif] = useState(p.initial.objectif);
  const [productId, setProductId] = useState('');
  const [cleClic] = useState(() => `sp-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
  const [encours, setEncours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const verrou = useRef(false);

  if (p.etat.etat !== 'pret') {
    return (
      <Vue>
        <EnTete titre="Nouveau projet" sous={p.sous} />
        <TuileVide titre={p.etat.etat === 'sans-marque' ? 'Choisis une marque' : 'Lecture seule'} texte={p.etat.message}
          action={<Lien className="btn sm" href={p.etat.etat === 'sans-marque' ? p.etat.lien.href : CHEMIN_PROJETS} style={{ marginTop: 12 }}>{p.etat.etat === 'sans-marque' ? p.etat.lien.libelle : 'Voir les projets'}</Lien>} />
      </Vue>
    );
  }
  const marque = p.etat.marque;
  const aller = (href: string) => { if (cheminPorte(href)) router.push(href); else window.location.assign(href); };

  function choisirType(t: TypeNouveauProjet) {
    setType(t);
    if (!titreTouche.current) setTitre(p.titresParDefaut[t]);
  }

  function depart(cle: CleDepartSpatial, href: string | null) {
    if (cle === 'zero') { setEtape(2); return; }
    if (href) aller(href);
  }

  async function changerMarque(id: string) {
    try { await setActiveBrand(id); router.refresh(); }
    catch { toast('La marque n’a pas pu être changée. Réessaie.'); }
  }

  async function creer() {
    if (verrou.current) return;
    const v = verifierNouveauProjet({ titre, type });
    if (!v.ok) { setErreur(v.message); return; }
    if (productId && !objectif.trim() && !p.annonce) { setErreur('Précise ton objectif pour préparer le brief de ce produit.'); return; }
    verrou.current = true; setEncours(true); setErreur(null);
    try {
      const r = p.annonce || objectif.trim() || productId
        ? await creerProjetDepuisContexte({ brandId: marque.id, kind: v.type, titre: v.titre, objectif: objectif.trim(), ...(productId ? { productId } : {}), ref: p.annonce?.ref ?? null, retourVeille: p.retourVeille?.rv ?? null, cleClic })
        : await creerProjet({ brandId: marque.id, kind: v.type, title: v.titre });
      if (!r.ok) { setErreur(r.traceId ? `${r.message} · identifiant support : ${r.traceId}` : r.message); return; }
      aller(`/studio/projets/${r.projet.id}`);
    } catch {
      setErreur(messageHorsLigneStudio('creation'));
    } finally { verrou.current = false; setEncours(false); }
  }

  const etapes = etapesNouveauSpatial(etape);
  return (
    <Vue>
      <EnTete titre="Nouveau projet" sous={p.sous} />
      <nav className="steps" aria-label="Étapes">
        {etapes.map((e, i) => (
          <Fragment key={e.n}>
            {i > 0 && <span className="sep" />}
            {e.classe === 'done'
              ? <button type="button" className="done" onClick={() => setEtape(e.n as 1 | 2)}><b>✓</b>{e.libelle}</button>
              : <button type="button" className={e.classe} disabled><b>{e.n}</b>{e.libelle}</button>}
          </Fragment>
        ))}
      </nav>
      <section className="jfill">
        <span className="orb">J</span>
        <div className="jft"><strong>{JARVIS_NOUVEAU.titre}</strong><small>{JARVIS_NOUVEAU.sous}</small></div>
      </section>
      {etape === 1 ? (
        <div className="wz">
          <section>
            <h2 style={{ marginBottom: 10 }}>Marque</h2>
            <div className="kc">
              {p.marques.map((m) => m.active
                ? <span key={m.id} className="opt2 on">{m.nom}</span>
                : <span key={m.id} className="opt2" role="button" tabIndex={0} onClick={() => void changerMarque(m.id)}
                  onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); void changerMarque(m.id); } }}>{m.nom}</span>)}
              {p.ajouterMarque && <Lien className="opt2" href={p.ajouterMarque}><Ic n="plus" />Ajouter une marque</Lien>}
            </div>
          </section>
          <section>
            <h2 style={{ marginBottom: 10 }}>Livrable</h2>
            <div className="cards3">
              {LIVRABLES_SPATIAL.map((l) => (
                <button key={l.type} type="button" className="pickc" data-wliv={l.type} aria-pressed={type === l.type} onClick={() => choisirType(l.type)}>
                  <span className="ico"><Ic n={l.icone} s={false} /></span><strong>{l.titre}</strong><small>{l.sous}</small>
                </button>
              ))}
            </div>
          </section>
          <section>
            <h2 style={{ marginBottom: 10 }}>Point de départ</h2>
            <div className="cards3" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
              {DEPARTS_SPATIAL.map((d) => (
                <button key={d.cle} type="button" className="pickc" data-wfrom={d.cle} aria-pressed={d.cle === 'zero'} onClick={() => depart(d.cle, d.href)}>
                  <span className="ico"><Ic n={d.icone} s={false} /></span><strong>{d.titre}</strong><small>{d.sous}</small>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="wz">
          {[...p.repris, ...p.notes].map((n) => <div className="banner" key={n}><Ic n="spark" /><span>{n}</span></div>)}
          <div className="coach"><span className="orb">J</span><p>Le projet appartient à <b>{marque.nom}</b>. Le créer est gratuit · le style, les formats et le devis se choisissent ensuite dans le projet.</p></div>
          <section>
            <h2 style={{ marginBottom: 10 }}>Titre</h2>
            <label className="field">
              <input value={titre} maxLength={TITRE_NOUVEAU_PROJET_MAX} aria-label="Titre du projet"
                onChange={(e) => { titreTouche.current = true; setTitre(e.target.value); }} />
            </label>
          </section>
          <section>
            <h2 style={{ marginBottom: 10 }}>Objectif</h2>
            <textarea className="ta" value={objectif} maxLength={OBJECTIF_MAX} aria-label="Objectif du projet"
              placeholder="Ce que ce projet doit produire ou vérifier · facultatif" onChange={(e) => setObjectif(e.target.value)} />
          </section>
          {p.produits.length > 0 && (
            <section>
              <h2 style={{ marginBottom: 10 }}>Produit</h2>
              <div className="kc">
                <button type="button" className="chip" aria-pressed={productId === ''} onClick={() => setProductId('')}>Sans produit pour le moment</button>
                {p.produits.map((x) => <button key={x.id} type="button" className="chip" aria-pressed={productId === x.id} onClick={() => setProductId(x.id)}>{x.nom}</button>)}
              </div>
            </section>
          )}
          {erreur && <div className="banner" role="alert"><Ic n="x" /><span>{erreur}</span></div>}
        </div>
      )}
      <Ornement>
        {etape === 1
          ? <Lien className="btn" href={CHEMIN_PROJETS}>Annuler</Lien>
          : <button className="btn icon" type="button" aria-label="Étape précédente" onClick={() => setEtape(1)}><Ic n="back" s={false} /></button>}
        <span className="info">{infoEtapeNouveau(etape)}</span>
        {etape === 1
          ? <button className="btn pri" type="button" onClick={() => setEtape(2)}>Écrire le brief</button>
          : <button className="btn pri" type="button" disabled={encours} onClick={() => void creer()}>{encours ? 'Création…' : 'Créer le projet'}</button>}
      </Ornement>
    </Vue>
  );
}
