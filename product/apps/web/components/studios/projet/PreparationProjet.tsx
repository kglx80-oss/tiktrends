'use client';

import { useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import {
  LIBELLES_TYPE_PROJET, TYPES_NOUVEAU_PROJET, TITRE_NOUVEAU_PROJET_MAX, OBJECTIF_MAX, CIBLE_TACTILE_MIN, CHEMIN_PROJETS,
  verifierNouveauProjet, messageHorsLigneStudio, type EtatNouveauProjet, type TypeNouveauProjet,
} from '@tiktrends/core';
import { creerProjetDepuisContexte } from '../../../app/actions/studios/sources';
import { creerProjet } from '../../../app/actions/studios/projets';
import { btn, btnGhost, input, lbl, surface } from '../../ui';

const champ: CSSProperties = { ...input, fontSize: 16 };
const note: CSSProperties = { fontSize: 13, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 };
const lien: CSSProperties = { color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', minHeight: CIBLE_TACTILE_MIN };

export interface ProprietesPreparationProjet {
  etat: EtatNouveauProjet;
  initial: { type: TypeNouveauProjet; titre: string; objectif: string };
  /** L'annonce sauvegardée relue dans la portée · deviendra la source du projet. */
  annonce: { ref: string; annonceur: string } | null;
  /** Le brief d'un test Adsmap gagnant est repris dans l'objectif. */
  iterationReprise: boolean;
  /** Ce qui n'a pas pu être repris, dit en clair. */
  notes: string[];
  retourVeille: { href: string; rv: string } | null;
}

/**
 * La préparation d'un projet · le contexte d'un lien repris, modifiable, et UN
 * geste qui écrit : « Créer le projet ». Gratuit · aucune génération, aucun
 * crédit, aucun appel modèle. Le serveur revérifie tout (portée, droits,
 * capacité, idempotence par clé de clic).
 */
export function PreparationProjet(p: ProprietesPreparationProjet) {
  const router = useRouter();
  const [type, setType] = useState<TypeNouveauProjet>(p.initial.type);
  const [titre, setTitre] = useState(p.initial.titre);
  const [objectif, setObjectif] = useState(p.initial.objectif);
  const [cleClic] = useState(() => `prep-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`);
  const [encours, setEncours] = useState(false);
  const [erreur, setErreur] = useState<{ message: string; traceId?: string } | null>(null);

  if (p.etat.etat !== 'pret') {
    return (
      <section data-zone="preparation-projet" data-etat={p.etat.etat} style={{ ...surface, background: 'var(--surface)', padding: 20, display: 'grid', gap: 10, maxWidth: 720 }}>
        <p style={note}>{p.etat.message}{p.etat.etat === 'sans-marque' && <> <a href={p.etat.lien.href} style={lien}>{p.etat.lien.libelle}</a></>}</p>
        <Notes notes={p.notes} />
        <a href={CHEMIN_PROJETS} style={lien}>Voir les projets</a>
      </section>
    );
  }
  const marque = p.etat.marque;

  async function creer() {
    const v = verifierNouveauProjet({ titre, type });
    if (!v.ok) { setErreur({ message: v.message }); return; }
    setEncours(true);
    setErreur(null);
    try {
      const r = p.annonce || objectif.trim()
        ? await creerProjetDepuisContexte({ brandId: marque.id, kind: v.type, titre: v.titre, objectif: objectif.trim(), ref: p.annonce?.ref ?? null, retourVeille: p.retourVeille?.rv ?? null, cleClic })
        : await creerProjet({ brandId: marque.id, kind: v.type, title: v.titre });
      if (!r.ok) { setEncours(false); setErreur({ message: r.message, traceId: r.traceId }); return; }
      router.push(`/studio/projets/${r.projet.id}`);
    } catch {
      setEncours(false);
      setErreur({ message: messageHorsLigneStudio('creation') });
    }
  }

  return (
    <section data-zone="preparation-projet" data-etat="pret" style={{ ...surface, background: 'var(--surface)', padding: 20, display: 'grid', gap: 14, maxWidth: 720 }}>
      <p style={note}>Marque : <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{marque.nom}</b></p>

      {(p.annonce || p.iterationReprise) && (
        <div data-champ="repris" style={{ display: 'grid', gap: 4 }}>
          {p.annonce && <p data-source="sauvegarde" style={note}>Source jointe au projet · l’annonce sauvegardée de <b style={{ color: 'var(--ink)', fontWeight: 600 }}>{p.annonce.annonceur}</b>.</p>}
          {p.iterationReprise && <p data-source="iteration" style={note}>Le brief du test Adsmap gagnant est repris dans l’objectif.</p>}
        </div>
      )}
      <Notes notes={p.notes} />

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={lbl}>Type de projet</span>
        <select data-champ="type" value={type} onChange={(e) => setType(e.target.value as TypeNouveauProjet)} style={champ}>
          {TYPES_NOUVEAU_PROJET.map((t) => <option key={t} value={t}>{LIBELLES_TYPE_PROJET[t]}</option>)}
        </select>
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={lbl}>Titre</span>
        <input data-champ="titre" value={titre} maxLength={TITRE_NOUVEAU_PROJET_MAX} onChange={(e) => setTitre(e.target.value)} style={champ} />
      </label>
      <label style={{ display: 'grid', gap: 6 }}>
        <span style={lbl}>Objectif</span>
        <textarea data-champ="objectif" value={objectif} maxLength={OBJECTIF_MAX} rows={5} onChange={(e) => setObjectif(e.target.value)} placeholder="Ce que ce projet doit produire ou vérifier · facultatif" style={{ ...champ, resize: 'vertical', lineHeight: 1.5 }} />
      </label>

      {erreur && <p role="alert" data-etat="erreur" style={{ margin: 0, color: '#ff9db0', fontSize: 13.5 }}>{erreur.message}{erreur.traceId ? ` · identifiant support : ${erreur.traceId}` : ''}</p>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" data-bouton="creer-projet" onClick={creer} disabled={encours} style={{ ...btn, minHeight: CIBLE_TACTILE_MIN, opacity: encours ? 0.6 : 1 }}>
          {encours ? 'Création…' : 'Créer le projet'}
        </button>
        <a href={CHEMIN_PROJETS} style={{ ...btnGhost, textDecoration: 'none' }}>Voir les projets</a>
        {p.retourVeille && <a href={p.retourVeille.href} data-lien="retour-veille" style={lien}>Revenir à la Veille</a>}
      </div>
      <p style={{ ...note, fontSize: 12.5 }}>Gratuit · le projet garde le contexte, rien n’est généré tant que tu ne lances rien.</p>
    </section>
  );
}

function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <div role="status" data-champ="notes-contexte" style={{ display: 'grid', gap: 6, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--line)', background: 'var(--rail)' }}>
      <p style={{ ...note, color: 'var(--ink)', fontWeight: 600 }}>Non repris de ton lien</p>
      <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 4 }}>{notes.map((n) => <li key={n} style={note}>{n}</li>)}</ul>
    </div>
  );
}
