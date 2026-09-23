'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Monte ses enfants sur `document.body`, quel que soit l'endroit d'où on l'appelle.
 *
 * ── Pourquoi ─────────────────────────────────────────────────────────────────
 *
 * Un overlay plein écran (`position: fixed; inset: 0`) vise l'ÉCRAN. Mais un
 * `position: fixed` placé sous un ancêtre `transform` / `filter` / `perspective`
 * n'est plus relatif à l'écran · il est confiné à cet ancêtre, son voile ne
 * couvre plus la page et un élément de page à z-index positionné le perce.
 * C'est le défaut qui a cassé la fenêtre « Nouvelle marque » au premier clic.
 *
 * Un overlay n'a aucune raison d'hériter du contexte d'empilement de son point
 * d'ouverture. `Portail` le monte au niveau racine (`<body>`), une fois pour
 * toutes · immunise la classe entière, présente et future, contre les pièges
 * d'empilement. Les tokens de thème vivent sur `:root` · le style est conservé.
 *
 * SSR-safe · `document` n'existe pas côté serveur, et `createPortal` en a besoin.
 * On rend donc les enfants EN PLACE au premier rendu (serveur et première passe
 * client identiques · pas d'écart d'hydratation, et un rendu statique reste
 * lisible), puis, une fois monté côté client, on les DÉPLACE sur `<body>` via le
 * portail. Le décalage d'une frame est imperceptible · l'enfant qui apparaît est
 * déjà le bon, seul son contexte d'empilement bascule au niveau racine.
 *
 * Prouvé au RÉSULTAT dans `test/portail.test.tsx` · monté sous un ancêtre
 * transformé, l'enfant atterrit bien sur `<body>`, hors du piège.
 */
export function Portail({ children }: { children: ReactNode }) {
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  if (!monte) return <>{children}</>;
  return createPortal(children, document.body);
}
