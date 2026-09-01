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
 */
export function usePreflight(text: string): Preflight | null {
  const [line, setLine] = useState<Preflight | null>(null);

  useEffect(() => {
    if (text.trim().length < MIN_TEXT) { setLine(null); return; }

    let vivant = true;
    const t = setTimeout(async () => {
      const r = await preflightAction({ text });
      // La demande a été remplacée pendant l'attente · sa réponse ne concerne
      // plus ce que la personne a sous les yeux.
      if (vivant) setLine(r.line ?? null);
    }, 900);

    return () => { vivant = false; clearTimeout(t); };
  }, [text]);

  return line;
}
