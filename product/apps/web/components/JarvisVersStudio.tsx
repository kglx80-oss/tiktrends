'use client';
import { useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { surface as cadreSurface } from './ui';
import { preparerCreation } from '../app/actions/studios/sources';
import { lireEntreeJarvisVeille } from '../lib/veille-jarvis';
import { creerStudioDepuisJarvis } from '../app/actions/jarvis-veille-studio';

const bouton: CSSProperties = { color: 'var(--on-accent)', background: 'var(--accent)', border: 0, borderRadius: 12, padding: '12px 16px', minHeight: 44, font: 'inherit', cursor: 'pointer' };
const champ: CSSProperties = { width: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: 16, color: 'var(--ink)', background: 'var(--surface)', border: '1px solid var(--line-2)', borderRadius: 12, padding: 12 };

export function JarvisVersStudio({ params, brandId, proposition }: { params: Record<string, string>; brandId: string; proposition: string }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [brief, setBrief] = useState('');
  const [kind, setKind] = useState('image');
  const [styleIntent, setStyleIntent] = useState('');
  const [textes, setTextes] = useState('');
  const [format, setFormat] = useState('1:1');
  const [productId, setProductId] = useState('');
  const [produits, setProduits] = useState<Array<{ id: string; nom: string }>>([]);
  const [preparationErreur, setPreparationErreur] = useState('');
  async function ouvrir() {
    setBrief(proposition); setOuvert(true);
    const source = lireEntreeJarvisVeille(params);
    if (!source) return;
    try {
      const r = await preparerCreation({ sources: [source.source], brandId });
      if (!r.ok) { setPreparationErreur(r.message); return; }
      setProduits(r.produits.map(p => ({ id: p.id, nom: p.nom })));
    } catch { setPreparationErreur('Les produits n’ont pas pu être chargés. Tu pourras choisir le produit dans le Studio.'); }
  }
  const [charge, setCharge] = useState(false);
  const [erreur, setErreur] = useState('');
  const [incertain, setIncertain] = useState(false);
  const cle = useRef<string | null>(null);
  const verrou = useRef(false);
  async function creer() {
    if (verrou.current) return;
    verrou.current = true; setCharge(true); setErreur('');
    cle.current ??= crypto.randomUUID();
    try {
      const r = await creerStudioDepuisJarvis({ params, brandId, objectif: 'Créer une adaptation visuelle pour la marque cible à partir de la composition approuvée.', kind, cleClic: cle.current, productId: productId || undefined, directionVisuelle: { composition: brief, styleIntent, formats: [format], texts: textes.split('\n').map(t => t.trim()).filter(Boolean) } });
      if (!r.ok) { setErreur(r.message); if ('code' in r && r.code === 'INVALID_SCHEMA') setIncertain(false); return; }
      router.push(`/studio/projets/${r.projet.id}`);
    } catch { setIncertain(true); setErreur('Connexion interrompue. Réessaie avec ces mêmes choix : le Studio vérifiera si le projet a déjà été créé.'); }
    finally { verrou.current = false; setCharge(false); }
  }
  return <section aria-label="Passer au Studio" style={{ ...cadreSurface, display: 'grid', gap: 12, fontSize: 14, padding: 14, background: 'var(--surface)' }}>
    {!ouvert ? <button type="button" onClick={() => void ouvrir()} style={bouton}>Préparer cette création dans le Studio</button> : <>
      <label style={{ display: 'grid', gap: 8 }}>Composition à conserver et adaptations<textarea aria-label="Composition à transmettre au Studio" value={brief} disabled={charge || incertain} onChange={e => setBrief(e.target.value)} rows={6} style={champ} /></label>
      <p>{brief.length} / 2 000 caractères · garde uniquement les consignes pour ta marque, sans nom ni promesse du concurrent.</p>
      <label>Type de création <select style={champ} aria-label="Format de la création" value={kind} disabled={charge || incertain} onChange={e => setKind(e.target.value)}><option value="image">Image statique</option><option value="video">Vidéo</option></select></label>
      <label style={{ display: 'grid', gap: 8 }}>Style visuel <input aria-label="Style visuel" style={champ} value={styleIntent} maxLength={2000} disabled={charge || incertain} onChange={e => setStyleIntent(e.target.value)} placeholder="Ex. photo lumineuse, fond crème" /></label>
      <label style={{ display: 'grid', gap: 8 }}>Textes à afficher (une ligne par texte)<textarea aria-label="Textes à afficher" style={champ} rows={3} value={textes} disabled={charge || incertain} onChange={e => setTextes(e.target.value)} placeholder="Accroche validée pour ta marque" /></label>
      <p>Ces textes seront conservés dans le brief. Ajoute ensuite tes calques texte dans le Studio pour les afficher sur la création.</p>
      <label>Proportions <select aria-label="Proportions" style={champ} value={format} disabled={charge || incertain} onChange={e => setFormat(e.target.value)}>{['1:1', '4:5', '9:16', '16:9'].map(f => <option key={f}>{f}</option>)}</select></label>
      <label>Produit de ta marque <select aria-label="Produit de ta marque" style={champ} value={productId} disabled={charge || incertain} onChange={e => setProductId(e.target.value)}><option value="">Choisir dans le Studio</option>{produits.map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}</select></label>
      {preparationErreur && <p role="status">{preparationErreur}</p>}
      <p>Dans le Studio, sélectionne la photo du produit à utiliser. La référence et ce brief seront conservés dans le projet. Aucun appel IA ni rendu à cette étape. La génération demandera un devis et ta confirmation.</p>
      <button style={bouton} type="button" disabled={charge || !brief.trim() || brief.length > 2000} onClick={() => void creer()}>{charge ? 'Création du projet…' : 'Valider le brief et ouvrir le Studio'}</button>
      {erreur && <p role="alert">{erreur}</p>}
    </>}
  </section>;
}
