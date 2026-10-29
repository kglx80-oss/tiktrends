import type { PreferenceTheme } from '@tiktrends/core';
import { ChoixTheme } from '../../coquille/Surcouches';

/**
 * La section « Apparence » des Réglages (`/settings`) et de « Mon profil »
 * (`/profile`, ouvert à toute session) · le même choix Sombre · Clair · Auto
 * que la pop-up profil (`ChoixTheme`, mécanisme `appliquerTheme`). Pas de
 * fragment de maquette · composée comme ses voisines (`.tile`, `.lbl`, `.nprefs`
 * de boutons `.npr.rolebtn`). `theme` · la préférence lue dans le cookie au
 * rendu serveur, pour que le HTML servi montre déjà le bon choix pressé.
 * `idGroupe` distinct de la pop-up · les deux peuvent coexister à l'écran.
 * `id="apparence"` · l'adresse des commandes de thème de la palette.
 */
export function SectionApparence({ theme }: { theme: PreferenceTheme }) {
  return (
    <section className="tile" id="apparence" data-geste="apparence" style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
      <div><div className="lbl" style={{ margin: 0 }}>Apparence</div><h2 style={{ margin: '4px 0 0' }}>Clair, sombre ou auto</h2></div>
      <p className="muted" style={{ fontSize: 13, margin: 0 }}>Gardé sur ce navigateur · « Auto » suit le réglage clair ou sombre de ton appareil, et change avec lui. Aussi dans ton menu profil et dans la recherche.</p>
      <ChoixTheme initiale={theme} idGroupe="ngrp-theme-apparence" />
    </section>
  );
}
