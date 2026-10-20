'use client';

import { useEffect, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { CHEMIN_NOUVEAU_CONCEPT, type EtatNouveauProjet } from '@tiktrends/core';
import { Icon } from '../../Icon';
import { btn, vide } from '../../ui';

const note: CSSProperties = { fontSize: 12.5, color: 'var(--ink-2)', margin: 0, lineHeight: 1.5 };

/**
 * « Nouveau concept créatif » (vocabulaire CLIENT, mandat Kevin du 20/10) · le
 * CTA de la liste des Studios. Un « concept créatif » EST un projet studio ·
 * seul le mot change à l'écran, jamais l'objet ni la table.
 *
 * Le geste n'ouvre plus la modale Titre/Type · il NAVIGUE vers l'écran de
 * création conversationnelle (`CHEMIN_NOUVEAU_CONCEPT`), qui n'écrit rien et
 * n'appelle rien au rendu. La création réelle démarre au premier message, hors
 * de ce composant. L'écriture canonique (`creerProjet`) n'a pas bougé.
 *
 * L'état proposé est décidé au noyau (`etatNouveauProjet`) · jamais de porte
 * morte : en lecture seule, ou sans marque active, l'écran le DIT. Le libellé
 * vient du noyau (`etat.libelle`), jamais en dur ici.
 *
 * Deux déclencheurs : `variante='bouton'` (en-tête) et `variante='carte'`
 * (dernière tuile de la grille, raccourci N). La carte ne s'affiche que si l'état
 * est « prêt » · sinon l'en-tête porte déjà la raison, on ne double pas une tuile
 * morte.
 */
export function NouveauProjet({ etat, variante = 'bouton' }: { etat: EtatNouveauProjet; variante?: 'bouton' | 'carte' }) {
  const router = useRouter();
  const carte = variante === 'carte';
  const pret = etat.etat === 'pret';

  // Raccourci « N » (carte) · ignoré quand on tape dans un champ · mène au même
  // écran que le clic. Aucune écriture, une simple navigation.
  useEffect(() => {
    if (!carte || !pret) return;
    function surTouche(e: KeyboardEvent) {
      if (e.key !== 'n' && e.key !== 'N') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const c = document.activeElement;
      if (c && (c.tagName === 'INPUT' || c.tagName === 'TEXTAREA' || c.tagName === 'SELECT' || (c as HTMLElement).isContentEditable)) return;
      e.preventDefault();
      router.push(CHEMIN_NOUVEAU_CONCEPT);
    }
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [carte, pret, router]);

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
      <a href={CHEMIN_NOUVEAU_CONCEPT} data-nouveau-projet="carte" aria-keyshortcuts="N"
        style={{ ...vide, background: 'transparent', cursor: 'pointer', textDecoration: 'none', padding: 16, minHeight: 180, display: 'grid', gap: 8, placeContent: 'center', justifyItems: 'center', textAlign: 'center', color: 'var(--ink-2)' }}>
        <span aria-hidden style={{ width: 44, height: 44, borderRadius: 999, background: 'var(--paper)', color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="plus" size={20} /></span>
        <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>{etat.libelle}</span>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>Décris ce que tu veux créer, en conversation</span>
        <span aria-hidden style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-2)', padding: '2px 7px', borderRadius: 6, border: '1px solid var(--line-2)', background: 'var(--surface)' }}>N</span>
      </a>
    );
  }
  return (
    <a href={CHEMIN_NOUVEAU_CONCEPT} data-nouveau-projet="pret" style={{ ...btn, gap: 8, textDecoration: 'none' }}>
      <Icon name="plus" size={16} />{etat.libelle}
    </a>
  );
}
