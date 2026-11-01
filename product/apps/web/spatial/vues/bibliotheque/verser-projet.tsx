'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  versementSelection, messageVersement, messageCreationVersement, raisonVersement, titreNouveauProjetParDefaut,
  ROLES_VERSEMENT, PORTEES_REFERENCE, LIBELLES_ROLE, LIBELLES_PORTEE, EFFET_ROLE, LIBELLES_TYPE_PROJET, TYPES_NOUVEAU_PROJET, KIND_CONCEPT_DEFAUT,
  type DonneesDrive, type ErreurStudio, type EtatNouveauProjet, type ModeVersement, type PorteeReference, type RoleReference, type TypeNouveauProjet,
} from '@tiktrends/core';
import { creerProjetEtVerser, projetsPourVersement, verserSelectionDansProjet, type ProjetVersement } from '../../../app/actions/studios/versement';
import { Ic, Lien } from '../../communs';
import { useSpatial } from '../../coquille/contexte';
import { DialogueSpatial } from '../marque/interactifs';

/**
 * Bibliothèque · la fenêtre « Utiliser dans un projet », ouverte depuis la
 * barre de sélection ou depuis l'aperçu d'un fichier. Ce qui part et ce qui est
 * écarté (et pourquoi) est décidé au noyau (`versementSelection`) · la liste
 * des projets est celle de la page Studios (`projetsPourVersement`), lue à
 * l'ouverture · le rôle et la portée sont choisis, jamais déduits · le
 * versement est UNE action serveur, tout ou rien (`verserSelectionDansProjet`).
 *
 * « Nouveau projet » · proposé seulement quand la page Studios le propose
 * (`etatNouveauProjet` · droit, marque active) ; la création canonique puis le
 * même versement (`creerProjetEtVerser`). Si le versement échoue après la
 * création, le projet reste, l'écran le dit, et il devient le projet choisi
 * pour réessayer le seul versement. Après succès, un lien mène aux références
 * du projet.
 */

function texteErreur(r: ErreurStudio): string {
  if (r.code === 'VERSION_CONFLICT') return 'Le projet a changé pendant le versement · rien n’a été écrasé. Recommence.';
  if (r.violations?.length) return [...new Set(r.violations.map((v) => v.raison))].join(' · ');
  return r.message;
}

type Projets = { etat: 'attente' } | { etat: 'pret'; liste: ProjetVersement[]; creation: EtatNouveauProjet | null } | { etat: 'refus'; texte: string };
type Retour = { etat: 'succes' | 'partiel'; texte: string; href: string } | { etat: 'erreur'; texte: string };

const CHAMP = { padding: '10px 14px', borderRadius: 14, background: 'var(--glass2)', border: '1px solid var(--edge)', color: 'var(--fg)', font: '500 13px var(--sf)' } as const;

export function FenetreVersement({ ouvert, fermer, donnees, fichiers }: { ouvert: boolean; fermer: () => void; donnees: DonneesDrive; fichiers: ReadonlyArray<{ id: string }> }) {
  const { toast } = useSpatial();
  const [projets, setProjets] = useState<Projets>({ etat: 'attente' });
  const [mode, setMode] = useState<ModeVersement>('existant');
  const [projectId, setProjectId] = useState('');
  const [type, setType] = useState<TypeNouveauProjet>(KIND_CONCEPT_DEFAUT);
  const [titreSaisi, setTitreSaisi] = useState<string | null>(null);
  const [role, setRole] = useState<RoleReference | ''>('');
  const [scope, setScope] = useState<PorteeReference | ''>('');
  const [occupe, setOccupe] = useState(false);
  const [retour, setRetour] = useState<Retour | null>(null);
  const v = useMemo(() => versementSelection(donnees, fichiers), [donnees, fichiers]);

  useEffect(() => {
    if (!ouvert) return;
    setRetour(null);
    let vivant = true;
    projetsPourVersement()
      .then((r) => {
        if (!vivant) return;
        if (!r.ok) { setProjets({ etat: 'refus', texte: texteErreur(r) }); return; }
        const creation = r.creation ?? null;
        setProjets({ etat: 'pret', liste: r.projets, creation });
        // Aucun projet actif et la création est possible · la fenêtre s'ouvre sur « Nouveau projet ».
        if (!r.projets.length && creation?.etat === 'pret') setMode('nouveau');
      })
      .catch(() => { if (vivant) setProjets({ etat: 'refus', texte: 'La liste des projets n’a pas pu être lue · réessaie.' }); });
    return () => { vivant = false; };
  }, [ouvert]);

  const creation = projets.etat === 'pret' ? projets.creation : null;
  const marque = creation?.etat === 'pret' ? creation.marque : null;
  const modeEffectif: ModeVersement = mode === 'nouveau' && marque ? 'nouveau' : 'existant';
  const titre = titreSaisi ?? (marque ? titreNouveauProjetParDefaut(type, marque.nom) : '');
  const raison = raisonVersement({ occupe, selection: v, mode: modeEffectif, projectId, creation: { marque: !!marque, titre, type }, role, scope });
  const effacer = () => setRetour(null);

  async function verser() {
    if (raison || !role || !scope) return;
    setOccupe(true); setRetour(null);
    const ids = v.versables.map((f) => f.id);
    try {
      if (modeEffectif === 'nouveau' && marque) {
        const r = await creerProjetEtVerser({ brandId: marque.id, titre, type, ids, role, scope });
        if (!r.ok) { setRetour({ etat: 'erreur', texte: texteErreur(r) }); return; }
        // Le projet existe · il rejoint la liste et devient le projet choisi (un nouvel essai ne le recrée pas).
        const cree: ProjetVersement = { id: r.projet.id, titre: r.projet.titre, marque: marque.nom };
        setProjets((p) => (p.etat === 'pret' ? { ...p, liste: [cree, ...p.liste.filter((x) => x.id !== cree.id)] } : p));
        setProjectId(cree.id); setMode('existant'); setTitreSaisi(null);
        const w = r.versement;
        const texte = messageCreationVersement(r.projet.titre, w.ok ? { ok: true, ajoutes: w.ajoutes, dejaPresents: w.dejaPresents, role } : { ok: false, raison: texteErreur(w) });
        setRetour({ etat: w.ok ? 'succes' : 'partiel', texte, href: w.ok ? w.projet.href : r.projet.href });
        toast(texte);
        return;
      }
      const r = await verserSelectionDansProjet({ projectId, ids, role, scope });
      if (r.ok) {
        const texte = messageVersement(r.ajoutes, r.dejaPresents, r.projet.titre, role);
        setRetour({ etat: 'succes', texte, href: r.projet.href });
        toast(texte);
      } else setRetour({ etat: 'erreur', texte: texteErreur(r) });
    } catch {
      setRetour({ etat: 'erreur', texte: modeEffectif === 'nouveau'
        ? 'La connexion a été interrompue · le projet a peut-être été créé. Ouvre Studios pour vérifier avant de recommencer.'
        : 'La connexion a été interrompue · le versement a peut-être abouti. Ouvre le projet pour vérifier avant de recommencer.' });
    } finally { setOccupe(false); }
  }

  const n = v.versables.length;
  const libelleBouton = modeEffectif === 'nouveau'
    ? (n ? `Créer et verser ${n} image${n > 1 ? 's' : ''}` : 'Créer et verser')
    : (n ? `Verser ${n} image${n > 1 ? 's' : ''}` : 'Verser');
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
        {marque && (
          <div className="seg" role="group" aria-label="Projet existant ou nouveau projet">
            <button type="button" data-versement="mode-existant" aria-pressed={modeEffectif === 'existant'} disabled={occupe} onClick={() => { setMode('existant'); effacer(); }}>Projet existant</button>
            <button type="button" data-versement="mode-nouveau" aria-pressed={modeEffectif === 'nouveau'} disabled={occupe} onClick={() => { setMode('nouveau'); effacer(); }}><Ic n="plus" />Nouveau projet</button>
          </div>
        )}
        {projets.etat === 'pret' && projets.liste.length === 0 && (
          <p className="faint" data-versement="sans-projet" style={{ fontSize: '12.5px', margin: 0 }}>
            {marque ? 'Aucun projet actif dans ton espace · crée-le ici.' : <>Aucun projet actif dans ton espace · <Lien href="/studio/projets">crée-en un depuis Studios</Lien>.</>}
          </p>
        )}
        {creation && creation.etat !== 'pret' && (
          <p className="faint" data-versement="creation-fermee" style={{ fontSize: '11.5px', margin: 0 }}>
            {creation.message}{creation.etat === 'sans-marque' && <> · <Lien href={creation.lien.href}>{creation.lien.libelle}</Lien></>}
          </p>
        )}
        {modeEffectif === 'existant' ? (
          <select className="dsort" data-versement="projet" aria-label="Projet" value={projectId} disabled={projets.etat !== 'pret' || !projets.liste.length || occupe} onChange={(e) => { setProjectId(e.target.value); effacer(); }}>
            <option value="" disabled>{projets.etat === 'attente' ? 'Chargement des projets…' : 'Choisis un projet…'}</option>
            {projets.etat === 'pret' && projets.liste.map((p) => <option key={p.id} value={p.id}>{p.titre} · {p.marque}</option>)}
          </select>
        ) : (
          <div data-versement="nouveau" style={{ display: 'grid', gap: 8 }}>
            <input data-versement="titre" aria-label="Titre du projet" value={titre} maxLength={200} disabled={occupe} onChange={(e) => { setTitreSaisi(e.target.value); effacer(); }} placeholder="Titre du projet" style={CHAMP} />
            <select className="dsort" data-versement="type" aria-label="Type de projet" value={type} disabled={occupe} onChange={(e) => { setType(e.target.value as TypeNouveauProjet); effacer(); }}>
              {TYPES_NOUVEAU_PROJET.map((t) => <option key={t} value={t}>{LIBELLES_TYPE_PROJET[t] ?? t}</option>)}
            </select>
            <small className="faint" data-versement="marque" style={{ fontSize: '11.5px' }}>Projet de la marque {marque!.nom} · son brief reste à préciser dans le projet.</small>
          </div>
        )}
        <select className="dsort" data-versement="role" aria-label="Rôle des images" value={role} disabled={occupe} onChange={(e) => { setRole(e.target.value as RoleReference); effacer(); }}>
          <option value="" disabled>Rôle des images…</option>
          {ROLES_VERSEMENT.map((r) => <option key={r} value={r}>{LIBELLES_ROLE[r]}</option>)}
        </select>
        {role && <small className="faint" data-versement="effet" style={{ fontSize: '11.5px' }}>{EFFET_ROLE[role]}</small>}
        <select className="dsort" data-versement="portee" aria-label="Portée des images" value={scope} disabled={occupe} onChange={(e) => { setScope(e.target.value as PorteeReference); effacer(); }}>
          <option value="" disabled>Portée…</option>
          {PORTEES_REFERENCE.map((p) => <option key={p} value={p}>{LIBELLES_PORTEE[p]}</option>)}
        </select>
        {retour && (retour.etat === 'erreur'
          ? <div className="banner" data-versement="erreur" style={{ margin: 0 }}><Ic n="warn" /><span>{retour.texte}</span></div>
          : <div className="banner" data-versement={retour.etat} style={{ margin: 0 }}><Ic n={retour.etat === 'succes' ? 'check' : 'warn'} /><span>{retour.texte}</span><Lien className="btn sm" href={retour.href}>Ouvrir le projet</Lien></div>)}
        <div className="pbtns">
          <button className="btn" type="button" onClick={fermer}>Fermer</button>
          <button className="btn pri" type="button" data-versement="verser" disabled={raison !== null} title={raison ?? undefined} onClick={() => void verser()}>
            <Ic n="brush" />{libelleBouton}
          </button>
        </div>
      </div>
    </DialogueSpatial>
  );
}
