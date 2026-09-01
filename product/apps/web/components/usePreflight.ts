'use client';

import { useEffect, useState } from 'react';
import { MIN_TEXT, type Preflight } from '@tiktrends/core';
import { preflightAction } from '../app/actions/preflight';

/**
 * Ce que la mémoire dit pendant qu'on écrit.
 *
 * ── Pourquoi un délai, et pourquoi celui-là ──────────────────────────────────
 *
 * Interroger la mémoire à chaque caractère ferait une requête par frappe pour
 * une réponse qui, neuf fois sur dix, est le silence. On attend donc que la
 * saisie se pose · 900 ms, soit à peu près la pause qu'on fait en cherchant son
 * mot suivant.
 *
 * ── La réponse tardive ne s'affiche jamais ───────────────────────────────────
 *
 * Deux vérifications peuvent se croiser : celle d'un texte qu'on vient de
 * réécrire arrive parfois avant celle du texte précédent. Sans garde, la barre
 * afficherait une réserve qui porte sur une phrase effacée · on ne garde donc
 * que la réponse de la dernière demande.
 *
 * ── Le silence est gratuit ───────────────────────────────────────────────────
 *
 * Rien n'est appelé tant que le texte est trop court · le seuil vient du noyau,
 * l'écran n'invente pas le sien.
 *
 * ── Le reste du composeur compte aussi ───────────────────────────────────────
 *
 * On n'envoyait que la description. Les gabarits cochés juste au-dessus de la
 * barre sont pourtant ce qui permet de dire « ce gabarit-là n'a jamais rien
 * donné ici » · une réserve qu'on peut suivre, là où un profil d'accroche
 * moyen ne fait rien changer à personne.
 *
 * Ils entrent dans les dépendances : décocher un gabarit doit relancer la
 * vérification, sinon la barre parle d'un concept qu'on vient de modifier. La
 * clé est sérialisée pour que `useEffect` compare des valeurs et non l'identité
 * d'un tableau reconstruit à chaque rendu.
 */
export function usePreflight(text: string, opts?: { templates?: string[]; format?: 'static' }): Preflight | null {
  const [line, setLine] = useState<Preflight | null>(null);
  const templates = opts?.templates;
  const format = opts?.format;
  const cle = (templates ?? []).join(',');

  useEffect(() => {
    if (text.trim().length < MIN_TEXT) { setLine(null); return; }

    let vivant = true;
    const t = setTimeout(async () => {
      const r = await preflightAction({ text, templates: cle ? cle.split(',') : [], format });
      // La demande a été remplacée pendant l'attente · sa réponse ne concerne
      // plus ce que la personne a sous les yeux.
      if (vivant) setLine(r.line ?? null);
    }, 900);

    return () => { vivant = false; clearTimeout(t); };
  }, [text, cle, format]);

  return line;
}
