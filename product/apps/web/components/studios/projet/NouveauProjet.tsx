'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  LIBELLES_TYPE_PROJET, TYPES_NOUVEAU_PROJET, TITRE_NOUVEAU_PROJET_MAX, titreNouveauProjetParDefaut, verifierNouveauProjet,
  messageHorsLigneStudio, type EtatNouveauProjet, type TypeNouveauProjet,
} from '@tiktrends/core';
import { creerProjet } from '../../../app/actions/studios/projets';
import { Modal } from '../../Modal';
import { btn, btnGhost, input, lbl } from '../../ui';

const champ: CSSProperties = { ...input, fontSize: 16 };
const note: CSSProperties = { fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 };

/**
 * « Nouveau projet » · crée un projet vide pour la marque ACTIVE, puis l'ouvre.
 *
 * L'état proposé est décidé au noyau (`etatNouveauProjet`) · jamais de bouton
 * mort : en lecture seule, ou sans marque active, l'écran le DIT. Un refus du
 * serveur (rôle, marque hors portée, capacité coupée entre-temps) s'affiche tel
 * quel, et la saisie reste. Gratuit · aucune génération, aucun crédit.
 */
export function NouveauProjet({ etat }: { etat: EtatNouveauProjet }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [titre, setTitre] = useState('');
  const [type, setType] = useState<TypeNouveauProjet>('ads');
  const [encours, setEncours] = useState(false);
  const [erreur, setErreur] = useState<{ message: string; traceId?: string } | null>(null);

  if (etat.etat === 'lecture-seule') {
    return <p data-nouveau-projet="lecture-seule" style={{ ...note, maxWidth: 360 }}>{etat.message}</p>;
  }
  if (etat.etat === 'sans-marque') {
    return (
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
      <button type="button" data-nouveau-projet="pret" onClick={ouvrir} style={btn}>{etat.libelle}</button>
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
            <p role="alert" data-etat="refus" style={{ ...note, color: '#ff9db0' }}>
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
