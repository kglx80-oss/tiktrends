'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  lireDepartAssistant, listerDepartsAssistant, type ChoixDepartAssistant, type DepartAssistant, type OrigineDepartAssistant,
} from '../../../../app/actions/studios/departs-assistant';
import { epinglerProduit, lireProduitProjet } from '../../../../app/actions/studios/produit';
import type { VueProduit } from '../../../../lib/studios/produit/vue';
import { Ic } from '../../../communs';
import { ImportPhoto } from '../../projet/Produit';

/**
 * Les panneaux de l'assistant · la surcouche de la maquette (`.paywrap >
 * .paybox.glass`), modale, fermée par Échap ou « Fermer », focus piégé puis
 * rendu à l'élément d'origine. Un panneau ne fait que LIRE à l'ouverture · le
 * choix est relu au serveur, et rien n'est créé ni débité.
 */
export function PanneauAssistant({ titre, onFermer, children }: { titre: string; onFermer: () => void; children: ReactNode }) {
  const id = useId();
  const boite = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const precedent = document.activeElement as HTMLElement | null;
    boite.current?.querySelector<HTMLElement>('button:not(:disabled), select, input')?.focus();
    return () => { precedent?.focus?.(); };
  }, []);
  // Rendu dans `body` · la fenêtre `main.win` (verre dépoli) forme son propre empilement · le voile doit couvrir l'écran.
  return createPortal(
    <div className="paywrap" data-panneau-assistant="" onMouseDown={(e) => { if (e.target === e.currentTarget) onFermer(); }}>
      <div ref={boite} className="paybox glass" role="dialog" aria-modal="true" aria-labelledby={id}
        style={{ width: 'min(620px,100%)', maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto' }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onFermer(); return; }
          if (e.key !== 'Tab') return;
          const f = [...(boite.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), a[href]') ?? [])];
          const premier = f[0]; const dernier = f[f.length - 1];
          if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier?.focus(); }
          else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier?.focus(); }
        }}>
        <div className="sech" style={{ margin: 0 }}>
          <h2 id={id} style={{ margin: 0 }}>{titre}</h2>
          <button className="btn icon sm" type="button" aria-label="Fermer le panneau" style={{ marginLeft: 'auto', width: 36, minHeight: 36 }} onClick={onFermer}><Ic n="x" /></button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Choisir un départ (sauvegarde de la Veille, test gagnant) · lecture, puis relecture serveur du choix. */
export function DepartDepuisSource({ origine, onChoisir, onFermer }: {
  origine: OrigineDepartAssistant;
  onChoisir: (depart: DepartAssistant) => void;
  onFermer: () => void;
}) {
  const sequence = useRef(0);
  const [choix, setChoix] = useState<ChoixDepartAssistant[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  useEffect(() => {
    let ignore = false;
    sequence.current += 1;
    setChoix(null); setErreur(null); setOccupe(null);
    void listerDepartsAssistant(origine).then((r) => {
      if (ignore) return;
      if (r.ok) setChoix(r.choix); else setErreur(r.message);
    }).catch(() => { if (!ignore) setErreur('La liste n’a pas pu être lue. Ferme puis rouvre ce panneau.'); });
    return () => { ignore = true; sequence.current += 1; };
  }, [origine]);

  async function choisir(id: string) {
    if (occupe) return;
    const demande = sequence.current;
    setOccupe(id); setErreur(null);
    try {
      const r = await lireDepartAssistant(origine, id);
      if (demande !== sequence.current) return;
      if (r.ok) onChoisir(r.depart); else setErreur(r.message);
    } catch { if (demande === sequence.current) setErreur('Ce point de départ n’a pas pu être relu. Aucun projet n’a été créé.'); }
    finally { if (demande === sequence.current) setOccupe(null); }
  }

  return (
    <PanneauAssistant titre={origine === 'veille' ? 'Références depuis la Veille' : 'Itérer sur un test'} onFermer={onFermer}>
      <p className="muted" style={{ fontSize: '12.5px' }}>{origine === 'veille'
        ? 'Sauvegardes accessibles de la marque active. La source reste attachée au projet · aucun média concurrent n’est copié.'
        : 'Tests gagnants arbitrés avec apprentissages. Le verdict est revérifié à la sélection.'}</p>
      {erreur && <div className="banner" role="alert"><Ic n="x" /><span>{erreur}</span></div>}
      {choix === null && !erreur && <p className="faint" role="status" style={{ fontSize: '12.5px' }}>Lecture…</p>}
      {choix?.length === 0 && <p className="faint" role="status" style={{ fontSize: '12.5px' }}>{origine === 'veille' ? 'Aucune sauvegarde accessible pour cette marque.' : 'Aucun test éligible avec apprentissage pour cette marque.'}</p>}
      {!!choix?.length && (
        <div className="cards3" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr))' }}>
          {choix.map((c) => (
            <button key={c.id} type="button" className="pickc" data-depart-id={c.id} disabled={!!occupe} onClick={() => void choisir(c.id)}>
              {c.apercu && <img src={c.apercu} alt="" style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 14 }} />}
              <strong>{c.titre}</strong><small>{c.detail}</small>{occupe === c.id && <small>Vérification…</small>}
            </button>
          ))}
        </div>
      )}
      <div className="kc"><button className="btn sm" type="button" onClick={onFermer}>Annuler</button></div>
    </PanneauAssistant>
  );
}

export interface PhotoAssistantChoisie {
  projectId: string;
  version: { id: string; n: number };
  produit: { id: string; nom: string };
  photo: { assetId: string; apercu: string; position: number };
  produits: VueProduit['produits'];
}

/** La photo produit du projet créé · lecture à l'ouverture ; épinglage ou import seulement après un geste. */
export function PhotoProduitAssistant({ projectId, productId, onChoisie }: {
  projectId: string | null;
  productId?: string;
  onChoisie: (photo: PhotoAssistantChoisie) => void;
}) {
  const [vue, setVue] = useState<VueProduit | null>(null);
  const [choisi, setChoisi] = useState(productId ?? '');
  const [lecture, setLecture] = useState(false);
  const [importEnCours, setImportEnCours] = useState(false);
  const occupe = lecture || importEnCours;
  const [erreur, setErreur] = useState<string | null>(null);
  const [incertain, setIncertain] = useState(false);

  const relire = useCallback(async () => {
    if (!projectId) return null;
    const r = await lireProduitProjet({ projectId });
    if (!r.ok) { setErreur(r.message); return null; }
    setVue(r.vue); setIncertain(false); setErreur(null);
    return r.vue;
  }, [projectId]);

  useEffect(() => {
    let actif = true;
    setVue(null);
    if (projectId) void lireProduitProjet({ projectId }).then((r) => {
      if (!actif) return;
      if (r.ok) setVue(r.vue); else setErreur(r.message);
    }).catch(() => { if (actif) setErreur('Impossible de lire les photos. Recharge le catalogue.'); });
    return () => { actif = false; };
  }, [projectId]);

  function publier(v: VueProduit) {
    const e = v.epingle;
    const p = e && v.produits.find((x) => x.id === e.productId);
    const photo = p?.photos.find((f) => f.assetId === e?.photo.assetId);
    if (p && photo) onChoisie({ projectId: v.projet.id, version: v.version, produit: { id: p.id, nom: p.nom }, photo, produits: v.produits });
  }

  async function recharger(notifier: boolean) {
    setLecture(true);
    try { const v = await relire(); if (v && notifier) publier(v); }
    catch { setErreur('Impossible de relire le résultat. Recharge le catalogue avant de continuer.'); }
    finally { setLecture(false); }
  }

  async function epingler(photoId: string) {
    if (!vue || !vue.peutModifier || occupe || incertain) return;
    setLecture(true); setErreur(null);
    try {
      const r = await epinglerProduit({ projectId: vue.projet.id, baseVersionId: vue.version.id, productId: choisi, photoId, composants: vue.epingle?.composantsObligatoires ?? [], transformations: vue.epingle?.transformationsAutorisees ?? [] });
      if (!r.ok) { setErreur(r.message); return; }
      const v = await relire();
      if (v) publier(v);
    } catch { setIncertain(true); setErreur('Réponse interrompue · résultat inconnu. Recharge le catalogue avant un nouvel envoi.'); }
    finally { setLecture(false); }
  }

  if (!projectId) return <p className="muted" style={{ fontSize: '12.5px' }}>Enregistre le brief pour importer une photo dans ce projet. Aucun fichier n’est envoyé avant cette étape.</p>;
  const produit = vue?.produits.find((p) => p.id === choisi);
  return (
    <section aria-label="Photo produit du projet" style={{ display: 'grid', gap: 12 }}>
      {erreur && <div className="banner" role="alert"><Ic n="x" /><span>{erreur}</span></div>}
      <div className="kc"><button className="btn sm" type="button" disabled={occupe} onClick={() => void recharger(true)}>Recharger le catalogue du projet</button></div>
      {!vue ? <p className="faint" style={{ fontSize: '12.5px' }}>Catalogue du projet en attente.</p> : (
        <>
          <label className="field">Produit
            <select aria-label="Produit pour la photo" value={choisi} disabled={occupe || incertain} onChange={(e) => setChoisi(e.target.value)}>
              <option value="">Choisir un produit</option>
              {vue.produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </label>
          {produit && (
            <div className="cards3" style={{ gridTemplateColumns: 'repeat(3,minmax(0,1fr))' }}>
              {produit.photos.map((photo) => (
                <button key={photo.assetId} type="button" className="pickc" disabled={!vue.peutModifier || occupe || incertain} onClick={() => void epingler(photo.assetId)}>
                  <img src={photo.apercu} alt={`Photo ${photo.position} de ${produit.nom}`} style={{ width: '100%', height: 110, objectFit: 'contain' }} />
                  <small>Épingler la photo {photo.position}</small>
                </button>
              ))}
            </div>
          )}
          <ImportPhoto key={`${vue.version.id}:${choisi}`} projectId={vue.projet.id} versionId={vue.version.id} produit={produit ? { id: produit.id, nom: produit.nom } : null}
            composants={vue.epingle?.composantsObligatoires ?? []} transformations={vue.epingle?.transformationsAutorisees ?? []}
            occupe={occupe || incertain || !vue.peutModifier} onOccupe={setImportEnCours} onReussi={() => void recharger(true)} />
        </>
      )}
    </section>
  );
}
