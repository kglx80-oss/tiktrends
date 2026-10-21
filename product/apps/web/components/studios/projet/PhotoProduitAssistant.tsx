'use client';

import { useCallback, useEffect, useState } from 'react';
import { lireProduitProjet, epinglerProduit } from '../../../app/actions/studios/produit';
import type { VueProduit } from '../../../lib/studios/produit/vue';
import { ImportPhotoProduit } from '../produit/ImportPhotoProduit';
import css from './AssistantProjet.module.css';

export interface PhotoAssistantChoisie {
  projectId: string;
  version: { id: string; n: number };
  produit: { id: string; nom: string };
  photo: { assetId: string; apercu: string; position: number };
  produits: VueProduit['produits'];
}

/** Lecture à l'ouverture. Épinglage/import uniquement après geste explicite. */
export function PhotoProduitAssistant({ projectId, productId, onChoisie }: {
  projectId: string | null;
  productId?: string;
  onChoisie: (photo: PhotoAssistantChoisie) => void;
}) {
  const [vue, setVue] = useState<VueProduit | null>(null);
  const [choisi, setChoisi] = useState(productId ?? '');
  const [lectureOuEpinglage, setOccupe] = useState(false);
  const [importEnCours, setImportEnCours] = useState(false);
  const occupe = lectureOuEpinglage || importEnCours;
  const [erreur, setErreur] = useState<string | null>(null);
  const [incertain, setIncertain] = useState(false);

  const relire = useCallback(async () => {
    if (!projectId) return null;
    const r = await lireProduitProjet({ projectId });
    if (!r.ok) { setErreur(r.message); return null; }
    setVue(r.vue);
    setIncertain(false);
    setErreur(null);
    return r.vue;
  }, [projectId]);

  useEffect(() => {
    let active = true;
    setVue(null);
    if (projectId) void lireProduitProjet({ projectId }).then((r) => {
      if (!active) return;
      if (r.ok) setVue(r.vue); else setErreur(r.message);
    }).catch(() => { if (active) setErreur('Impossible de lire les photos. Rechargez le catalogue.'); });
    return () => { active = false; };
  }, [projectId]);

  function publier(v: VueProduit) {
    const e = v.epingle;
    const p = e && v.produits.find((p) => p.id === e.productId);
    const photo = p?.photos.find((f) => f.assetId === e?.photo.assetId);
    if (p && photo) onChoisie({ projectId: v.projet.id, version: v.version, produit: { id: p.id, nom: p.nom }, photo, produits: v.produits });
  }

  async function recharger(notifier: boolean) {
    setOccupe(true);
    try { const v = await relire(); if (v && notifier) publier(v); }
    catch { setErreur('Impossible de relire le résultat. Rechargez le catalogue avant de continuer.'); }
    finally { setOccupe(false); }
  }

  async function epingler(photoId: string) {
    if (!vue || !vue.peutModifier || occupe || incertain) return;
    setOccupe(true); setErreur(null);
    try {
      const r = await epinglerProduit({ projectId: vue.projet.id, baseVersionId: vue.version.id, productId: choisi, photoId, composants: vue.epingle?.composantsObligatoires ?? [], transformations: vue.epingle?.transformationsAutorisees ?? [] });
      if (!r.ok) { setErreur(r.message); return; }
      const v = await relire();
      if (v) publier(v);
    } catch { setIncertain(true); setErreur('Réponse interrompue : résultat inconnu. Rechargez le catalogue avant un nouvel envoi.'); }
    finally { setOccupe(false); }
  }

  if (!projectId) return <p className={css.note}>Enregistrez le brief pour importer une photo dans ce projet. Aucun fichier n’est envoyé avant cette étape.</p>;
  const produit = vue?.produits.find((p) => p.id === choisi);
  return <section aria-label="Photo produit du projet">
    {erreur && <p role="alert">{erreur}</p>}
    <button type="button" disabled={occupe} onClick={() => void recharger(true)}>Recharger le catalogue du projet</button>
    {!vue ? <p className={css.note}>Catalogue du projet en attente.</p> : <>
      <label className={css.field}><span>Produit</span><select aria-label="Produit pour la photo" value={choisi} disabled={occupe || incertain} onChange={(e) => setChoisi(e.target.value)}><option value="">Choisir un produit</option>{vue.produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}</select></label>
      {produit && <div className={css.wtiles}>{produit.photos.map((photo) => <button type="button" key={photo.assetId} className={css.wtile} disabled={!vue.peutModifier || occupe || incertain} onClick={() => void epingler(photo.assetId)}><img src={photo.apercu} alt={`Photo ${photo.position} de ${produit.nom}`} style={{ width: '100%', height: 120, objectFit: 'contain' }} /><span>Épingler la photo {photo.position}</span></button>)}</div>}
      <ImportPhotoProduit key={`${vue.version.id}:${choisi}`} projectId={vue.projet.id} versionId={vue.version.id} produit={produit ? { id: produit.id, nom: produit.nom } : null} composants={vue.epingle?.composantsObligatoires ?? []} transformations={vue.epingle?.transformationsAutorisees ?? []} peutModifier={vue.peutModifier} occupe={occupe || incertain} onOccupe={setImportEnCours} onReussi={() => void recharger(true)} />
    </>}
  </section>;
}
