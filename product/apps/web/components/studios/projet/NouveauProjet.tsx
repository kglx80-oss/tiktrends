'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { type EtatNouveauProjet } from '@tiktrends/core';
import { Icon } from '../../Icon';
import { btn, vide } from '../../ui';
import { ouvrirAssistantProjet } from '../../../app/actions/studios/assistant';
import { AssistantProjet, type ProprietesAssistantProjet } from './AssistantProjet';
import { FenetreAssistant } from './FenetreAssistant';

const note: CSSProperties = { fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 };

/** Le CTA ouvre le parcours du prototype sans quitter la liste. Son chargement
 * relit les droits ; aucune création ni dépense n'est déclenchée à l'ouverture. */
export function NouveauProjet({ etat, variante = 'bouton' }: { etat: EtatNouveauProjet; variante?: 'bouton' | 'carte' }) {
  const router = useRouter();
  const ouverture = useRef(false);
  const [ouvert, setOuvert] = useState(false);
  const [props, setProps] = useState<ProprietesAssistantProjet | null>(null);
  const [erreur, setErreur] = useState('');
  const ouvrir = useCallback(async () => {
    if (ouverture.current) return;
    ouverture.current = true;
    setOuvert(true); setErreur(''); setProps(null);
    try { const r = await ouvrirAssistantProjet(); if (r.ok) setProps(r.props); else setErreur(r.message); }
    catch { setErreur('Impossible d’ouvrir le projet. Réessaie.'); }
    finally { ouverture.current = false; }
  }, []);
  const fermer = () => { setOuvert(false); router.refresh(); };
  const fenetre = ouvert ? <FenetreAssistant onFermer={fermer}>{props ? <AssistantProjet {...props} onFermer={fermer} /> : <div style={{ padding: 32 }} role={erreur ? 'alert' : 'status'}>{erreur || 'Chargement…'}{erreur && <button onClick={() => void ouvrir()} style={btn}>Réessayer</button>}</div>}</FenetreAssistant> : null;
  const carte = variante === 'carte';
  const pret = etat.etat === 'pret';

  // Raccourci « N » (carte) · ignoré quand on tape dans un champ · mène au même
  // écran que le clic. Aucune écriture, une simple navigation.
  useEffect(() => {
    if (!carte || !pret) return;
    function surTouche(e: KeyboardEvent) {
      if (document.querySelector('dialog[open]')) return;
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const c = document.activeElement;
      if (c && (c.tagName === 'INPUT' || c.tagName === 'TEXTAREA' || c.tagName === 'SELECT' || (c as HTMLElement).isContentEditable)) return;
      e.preventDefault();
      void ouvrir();
    }
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [carte, pret, ouvrir]);

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

  if (carte) {
    return (
      <>{fenetre}<Link href="/studio/projets/nouveau" onClick={(e) => { e.preventDefault(); void ouvrir(); }} data-nouveau-projet="carte" aria-keyshortcuts="N"
        style={{ ...vide, background: 'transparent', cursor: 'pointer', textDecoration: 'none', padding: 16, minHeight: 180, display: 'grid', gap: 8, placeContent: 'center', justifyItems: 'center', textAlign: 'center', color: 'var(--ink-2)' }}>
        <span aria-hidden style={{ width: 44, height: 44, borderRadius: 999, background: 'var(--paper)', color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={20} /></span>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>Nouveau projet</span>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Brief → création, étape par étape</span>
        <span aria-hidden style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', padding: '2px 7px', borderRadius: 6, border: '1px solid var(--line-2)', background: 'var(--surface)' }}>N</span>
      </Link></>
    );
  }
  return (
    <>{fenetre}<Link href="/studio/projets/nouveau" onClick={(e) => { e.preventDefault(); void ouvrir(); }} data-nouveau-projet="pret" style={{ ...btn, gap: 8, textDecoration: 'none' }}>
      <Icon name="plus" size={16} />Nouveau projet
    </Link></>
  );
}
