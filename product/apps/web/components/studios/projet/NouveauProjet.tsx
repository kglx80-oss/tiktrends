'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  LIBELLES_TYPE_PROJET, TYPES_NOUVEAU_PROJET, TITRE_NOUVEAU_PROJET_MAX, titreNouveauProjetParDefaut, verifierNouveauProjet,
  messageHorsLigneStudio, type EtatNouveauProjet, type TypeNouveauProjet,
} from '@tiktrends/core';
import { creerProjet } from '../../../app/actions/studios/projets';
import { Modal } from '../../Modal';
import { Icon } from '../../Icon';
import { btn, btnGhost, input, lbl, vide } from '../../ui';

const champ: CSSProperties = { ...input, fontSize: 16 };
const note: CSSProperties = { fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 };

/**
 * « Nouveau projet » · crée un projet vide pour la marque ACTIVE, puis l'ouvre.
 *
 * L'état proposé est décidé au noyau (`etatNouveauProjet`) · jamais de bouton
 * mort : en lecture seule, ou sans marque active, l'écran le DIT. Un refus du
 * serveur (rôle, marque hors portée, capacité coupée entre-temps) s'affiche tel
 * quel, et la saisie reste. Gratuit · aucune génération, aucun crédit.
 *
 * Deux déclencheurs, UNE modale : `variante='bouton'` (en-tête) et
 * `variante='carte'` (dernière tuile de la grille, raccourci N, alignement V5).
 * La carte ne s'affiche que si l'état est « prêt » · sinon l'en-tête porte déjà
 * la raison, on ne double pas une tuile morte.
 */
export function NouveauProjet({ etat, variante = 'bouton' }: { etat: EtatNouveauProjet; variante?: 'bouton' | 'carte' }) {
  const router = useRouter();
  const carte = variante === 'carte';
  const [ouvert, setOuvert] = useState(false);
  const [titre, setTitre] = useState('');
  const [type, setType] = useState<TypeNouveauProjet>('ads');
  const [encours, setEncours] = useState(false);
  const [erreur, setErreur] = useState<{ message: string; traceId?: string } | null>(null);

  // Raccourci « N » (carte) · ignoré quand on tape dans un champ ou qu'une
  // modale est déjà ouverte · ouvre la même création.
  const pret = etat.etat === 'pret';
  useEffect(() => {
    if (!carte || !pret) return;
    function surTouche(e: KeyboardEvent) {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const c = document.activeElement;
      if (c && (c.tagName === 'INPUT' || c.tagName === 'TEXTAREA' || c.tagName === 'SELECT' || (c as HTMLElement).isContentEditable)) return;
      e.preventDefault();
      ouvrir();
    }
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carte, pret]);

  if (etat.etat === 'lecture-seule') {
    return carte ? null : <p data-nouveau-projet="lecture-seule" style={{ ...note, maxWidth: 360 }}>{etat.message}</p>;
  }
  if (etat.etat === 'sans-marque') {
    return carte ? null : (
      <p data-nouveau-projet="sans-marque" style={{ ...note, maxWidth: 360 }}>
        {etat.message} <a href={etat.lien.href} style={{ color: 'var(--accent-strong)' }}>{etat.lien.libelle}</a>
      </p>
    );
  }
  const marque = etat.marque;

  function ouvrir() {
    setOuvert(true);
    setErreur(null);
    setType('ads');
    setTitre(titreNouveauProjetParDefaut('ads', marque.nom));
  }

  async function creer() {
    const v = verifierNouveauProjet({ titre, type });
    if (!v.ok) { setErreur({ message: v.message }); return; }
    setEncours(true);
    setErreur(null);
    let r: Awaited<ReturnType<typeof creerProjet>>;
    try {
      r = await creerProjet({ brandId: marque.id, kind: v.type, title: v.titre });
    } catch {
      setEncours(false);
      setErreur({ message: messageHorsLigneStudio('creation') });
      return;
    }
    if (!r.ok) { setEncours(false); setErreur({ message: r.message, traceId: r.traceId }); return; }
    router.push(`/studio/projets/${r.projet.id}`);
  }

  return (
    <>
      {carte ? (
        <button type="button" data-nouveau-projet="carte" onClick={ouvrir} aria-keyshortcuts="N"
          style={{ ...vide, background: 'transparent', cursor: 'pointer', padding: 16, minHeight: 180, display: 'grid', gap: 8, placeContent: 'center', justifyItems: 'center', textAlign: 'center', color: 'var(--ink-2)' }}>
          <span aria-hidden style={{ width: 44, height: 44, borderRadius: 999, background: 'var(--paper)', color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={20} /></span>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Nouveau projet</span>
          <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Brief → création, étape par étape</span>
          <span aria-hidden style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', padding: '2px 7px', borderRadius: 6, border: '1px solid var(--line-2)', background: 'var(--surface)' }}>N</span>
        </button>
      ) : (
        <button type="button" data-nouveau-projet="pret" onClick={ouvrir} style={btn}>{etat.libelle}</button>
      )}
      <Modal open={ouvert} onClose={() => { if (!encours) setOuvert(false); }} title="Nouveau projet" maxWidth={520} pleinEcranTelephone
        subtitle={`Un projet vide pour ${marque.nom} · tu y ajoutes ensuite produit, sources et brief.`}>
        <form data-formulaire="nouveau-projet" onSubmit={(e) => { e.preventDefault(); void creer(); }} style={{ display: 'grid', gap: 14, padding: 20 }}>
          <div>
            <label htmlFor="np-titre" style={lbl}>Titre</label>
            <input id="np-titre" value={titre} maxLength={TITRE_NOUVEAU_PROJET_MAX} disabled={encours} onChange={(e) => setTitre(e.target.value)} style={champ} />
          </div>
          <div>
            <label htmlFor="np-type" style={lbl}>Type</label>
            <select id="np-type" value={type} disabled={encours} onChange={(e) => setType(e.target.value as TypeNouveauProjet)} style={champ}>
              {TYPES_NOUVEAU_PROJET.map((k) => <option key={k} value={k}>{LIBELLES_TYPE_PROJET[k]}</option>)}
            </select>
          </div>
          {erreur && (
            <p role="alert" data-etat="refus" style={{ ...note, color: 'var(--err-text)' }}>
              {erreur.message}{erreur.traceId ? ` · identifiant support : ${erreur.traceId}` : ''}
            </p>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="submit" disabled={encours} style={{ ...btn, opacity: encours ? 0.6 : 1 }}>
              {encours ? 'Création…' : `Créer le projet pour ${marque.nom}`}
            </button>
            <button type="button" disabled={encours} onClick={() => setOuvert(false)} style={btnGhost}>Annuler</button>
            <span style={{ ...note, color: 'var(--muted)' }}>Gratuit · aucune génération, aucun crédit.</span>
          </div>
        </form>
      </Modal>
    </>
  );
}
