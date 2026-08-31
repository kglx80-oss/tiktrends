'use client';

import { useCallback, useEffect, useState } from 'react';
import { rankScenes, sceneAdvice, type ScenePerf } from '@tiktrends/core';
import { listPresetsAction, savePresetAction } from '../app/actions/presets';
import type { ComposerScene } from './Composer';

/**
 * Les scènes enregistrées, là où l'on écrit.
 *
 * Elles vivaient dans un écran à part (« Tes prompts »). Écrire sa direction
 * artistique demandait donc de quitter le studio, de la nommer, puis de revenir
 * · trois gestes pour une chose qu'on veut faire pendant qu'on compose.
 *
 * Ce qui est gardé, c'est leur bilan. « 3 gagnantes sur 9 tests tranchés » est
 * la seule chose qu'un générateur d'images ne saura jamais dire d'un prompt, et
 * ce n'était pas une raison de lui consacrer un écran entier.
 *
 * Le chargement est différé et silencieux · une barre de composition qui
 * attendrait ses scènes pour s'afficher ferait payer à tout le monde une
 * fonction que la plupart n'ouvriront pas.
 */
export function useScenes(kind: 'image' | 'video') {
  const [scenes, setScenes] = useState<ComposerScene[]>([]);
  const [perfs, setPerfs] = useState<ScenePerf[]>([]);
  const [erreur, setErreur] = useState('');

  const charger = useCallback(async () => {
    const r = await listPresetsAction();
    if (!r.view) return;
    const garde = (k: string) => k === kind || k === 'both';
    const miennes = r.view.mine.filter((p) => garde(p.kind));

    // Le classement est calculé dans le noyau · ce qui a gagné devant, ce qu'on
    // ne sait pas ensuite, ce qui a perdu derrière. On ne cache rien, on ordonne.
    const classees = rankScenes(miennes.map((p) => ({ id: p.id, name: p.name, performance: p.performance })));
    setPerfs(classees);
    const parId = new Map(miennes.map((p) => [p.id, p]));

    setScenes([
      ...classees.map((c) => ({
        id: c.id, name: c.name, prompt: parId.get(c.id)!.prompt,
        // `used === 0` donne « Jamais utilisé. » · on ne l'affiche pas, une
        // scène qu'on vient d'écrire n'a pas à s'excuser de n'avoir rien prouvé.
        summary: c.performance && c.performance.used > 0 ? c.performance.summary : null,
      })),
      // Les univers fournis · gardés parce qu'ils dépannent quand on part de
      // rien, placés après parce qu'ils ne sont plus le seul choix.
      ...(kind === 'image'
        ? r.view.builtin.map((p) => ({ id: p.id, name: p.name, prompt: p.prompt, summary: null }))
        : []),
    ]);
  }, [kind]);

  useEffect(() => { void charger(); }, [charger]);

  /** Enregistre la scène courante puis recharge · le bilan vient du serveur. */
  const enregistrer = useCallback(async (name: string, prompt: string) => {
    setErreur('');
    const r = await savePresetAction({ name, prompt, kind });
    if (r.error) { setErreur(r.error); return; }
    await charger();
  }, [charger, kind]);

  /**
   * Ce qu'on dit sur la scène choisie · vide quand on n'a rien de mieux à
   * proposer. Une phrase affichée à chaque choix devient un bruit qu'on cesse
   * de lire au bout de trois jours.
   */
  const conseil = useCallback((sceneId: string) => sceneAdvice(sceneId || null, perfs), [perfs]);

  return { scenes, enregistrer, erreur, conseil };
}
