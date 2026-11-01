'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  versementSelection, messageVersement, ROLES_VERSEMENT, PORTEES_REFERENCE, LIBELLES_ROLE, LIBELLES_PORTEE, EFFET_ROLE,
  type DonneesDrive, type ErreurStudio, type PorteeReference, type RoleReference,
} from '@tiktrends/core';
import { projetsPourVersement, verserSelectionDansProjet, type ProjetVersement } from '../../../app/actions/studios/versement';
import { Ic, Lien } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import { DialogueSpatial } from '../marque/interactifs';

/**
 * Bibliothèque · la fenêtre « Utiliser dans un projet », ouverte depuis la
 * barre de sélection. Ce qui part et ce qui est écarté (et pourquoi) est décidé
 * au noyau (`versementSelection`) · la liste des projets est celle de la page
 * Studios (`projetsPourVersement`), lue à l'ouverture · le rôle et la portée
 * sont choisis, jamais déduits · le versement est UNE action serveur, tout ou
 * rien (`verserSelectionDansProjet`). Après succès, un lien mène aux
 * références du projet.
 */

function texteErreur(r: ErreurStudio): string {
  if (r.code === 'VERSION_CONFLICT') return 'Le projet a changé pendant le versement · rien n’a été écrasé. Recommence.';
  if (r.violations?.length) return [...new Set(r.violations.map((v) => v.raison))].join(' · ');
  return r.message;
}

type Projets = { etat: 'attente' } | { etat: 'pret'; liste: ProjetVersement[] } | { etat: 'refus'; texte: string };

export function FenetreVersement({ ouvert, fermer, donnees, fichiers }: { ouvert: boolean; fermer: () => void; donnees: DonneesDrive; fichiers: ReadonlyArray<{ id: string }> }) {
  const { toast } = useSpatial();
  const [projets, setProjets] = useState<Projets>({ etat: 'attente' });
  const [projectId, setProjectId] = useState('');
  const [role, setRole] = useState<RoleReference | ''>('');
  const [scope, setScope] = useState<PorteeReference | ''>('');
  const [occupe, setOccupe] = useState(false);
  const [retour, setRetour] = useState<{ ok: true; texte: string; href: string } | { ok: false; texte: string } | null>(null);
  const v = useMemo(() => versementSelection(donnees, fichiers), [donnees, fichiers]);

  useEffect(() => {
    if (!ouvert) return;
    setRetour(null);
    let vivant = true;
    projetsPourVersement()
      .then((r) => { if (vivant) setProjets(r.ok ? { etat: 'pret', liste: r.projets } : { etat: 'refus', texte: texteErreur(r) }); })
      .catch(() => { if (vivant) setProjets({ etat: 'refus', texte: 'La liste des projets n’a pas pu être lue · réessaie.' }); });
    return () => { vivant = false; };
  }, [ouvert]);

  const raison = occupe ? 'Versement en cours…'
    : !v.versables.length ? v.phrase
      : !projectId ? 'Choisis un projet.'
        : !role ? 'Choisis un rôle · aucun rôle n’est déduit du fichier.'
          : !scope ? 'Choisis une portée.' : null;

  async function verser() {
    if (raison || !role || !scope) return;
    setOccupe(true); setRetour(null);
    try {
      const r = await verserSelectionDansProjet({ projectId, ids: v.versables.map((f) => f.id), role, scope });
      if (r.ok) {
        const texte = messageVersement(r.ajoutes, r.dejaPresents, r.projet.titre, role);
        setRetour({ ok: true, texte, href: r.projet.href });
        toast(texte);
      } else setRetour({ ok: false, texte: texteErreur(r) });
    } catch {
      setRetour({ ok: false, texte: 'La connexion a été interrompue · le versement a peut-être abouti. Ouvre le projet pour vérifier avant de recommencer.' });
    } finally { setOccupe(false); }
  }

  const n = v.versables.length;
  return (
    <DialogueSpatial titre="Utiliser dans un projet" ouvert={ouvert} fermer={fermer}>
      <div data-versement="" style={{ display: 'grid', gap: 10 }}>
        <p className="muted" data-versement="phrase" style={{ fontSize: 13, margin: 0 }}>{v.phrase}</p>
        {v.ecartes.length > 0 && (
          <ul data-versement="ecartes" style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 2 }}>
            {v.ecartes.map((e) => <li key={e.id} className="faint" style={{ fontSize: '11.5px' }}>{e.nom} · {e.raison}</li>)}
          </ul>
        )}
        {projets.etat === 'refus' && <div className="banner" data-versement="refus-projets" style={{ margin: 0 }}><Ic n="warn" /><span>{projets.texte}</span></div>}
        {projets.etat === 'pret' && projets.liste.length === 0 && (
          <p className="faint" data-versement="sans-projet" style={{ fontSize: '12.5px', margin: 0 }}>Aucun projet actif dans ton espace · <Lien href="/studio/projets">crée-en un depuis Studios</Lien>.</p>
        )}
        <select className="dsort" data-versement="projet" aria-label="Projet" value={projectId} disabled={projets.etat !== 'pret' || !projets.liste.length || occupe} onChange={(e) => { setProjectId(e.target.value); setRetour(null); }}>
          <option value="" disabled>{projets.etat === 'attente' ? 'Chargement des projets…' : 'Choisis un projet…'}</option>
          {projets.etat === 'pret' && projets.liste.map((p) => <option key={p.id} value={p.id}>{p.titre} · {p.marque}</option>)}
        </select>
        <select className="dsort" data-versement="role" aria-label="Rôle des images" value={role} disabled={occupe} onChange={(e) => { setRole(e.target.value as RoleReference); setRetour(null); }}>
          <option value="" disabled>Rôle des images…</option>
          {ROLES_VERSEMENT.map((r) => <option key={r} value={r}>{LIBELLES_ROLE[r]}</option>)}
        </select>
        {role && <small className="faint" data-versement="effet" style={{ fontSize: '11.5px' }}>{EFFET_ROLE[role]}</small>}
        <select className="dsort" data-versement="portee" aria-label="Portée des images" value={scope} disabled={occupe} onChange={(e) => { setScope(e.target.value as PorteeReference); setRetour(null); }}>
          <option value="" disabled>Portée…</option>
          {PORTEES_REFERENCE.map((p) => <option key={p} value={p}>{LIBELLES_PORTEE[p]}</option>)}
        </select>
        {retour && (retour.ok
          ? <div className="banner" data-versement="succes" style={{ margin: 0 }}><Ic n="check" /><span>{retour.texte}</span><Lien className="btn sm" href={retour.href}>Ouvrir le projet</Lien></div>
          : <div className="banner" data-versement="erreur" style={{ margin: 0 }}><Ic n="warn" /><span>{retour.texte}</span></div>)}
        <div className="pbtns">
          <button className="btn" type="button" onClick={fermer}>Fermer</button>
          <button className="btn pri" type="button" data-versement="verser" disabled={raison !== null} title={raison ?? undefined} onClick={() => void verser()}>
            <Ic n="brush" />{n ? `Verser ${n} image${n > 1 ? 's' : ''}` : 'Verser'}
          </button>
        </div>
      </div>
    </DialogueSpatial>
  );
}
