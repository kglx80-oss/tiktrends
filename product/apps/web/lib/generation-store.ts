'use client';

import { useSyncExternalStore } from 'react';

/**
 * Les générations EN COURS, au niveau de l'application.
 *
 * ── Le manque ────────────────────────────────────────────────────────────────
 *
 * L'état « ça tourne » vivait dans le composant du studio (un `busy` local).
 * Dès qu'on quittait la page du formulaire, ce composant se démontait et
 * l'information disparaissait · impossible de savoir, ailleurs dans l'app, que
 * des créas étaient encore en fabrication. Or la génération est un `await` qui
 * SURVIT au démontage (une promesse ne s'annule pas parce qu'un composant part) ·
 * seul l'affichage se perdait.
 *
 * Ce store vit au niveau MODULE · il survit au démontage du studio et aux
 * changements de route (le shell de l'app ne se remonte pas). Le studio y
 * DÉCLARE une génération au départ et la RETIRE dans son `finally` — qui
 * s'exécute quoi qu'il arrive, même après qu'on a quitté la page. Un indicateur
 * dans le shell lit le store et reste visible partout tant que ça tourne.
 *
 * La logique de données (déclarer / retirer / compter) est pure et testable ·
 * l'abonnement React n'est qu'un branchement par-dessus.
 */

export interface JobGeneration {
  id: number;
  /** Combien de visuels ce lot fabrique · pour dire « 3 visuels en cours ». */
  count: number;
  /** De quoi il s'agit · « Pubs IA », « Clone »… */
  label: string;
  startedAt: number;
}

let jobs: JobGeneration[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Déclare une génération en cours · rend son identifiant, à passer à `terminerGeneration`. */
export function demarrerGeneration(count: number, label: string): number {
  const id = ++seq;
  jobs = [...jobs, { id, count: Math.max(1, count), label, startedAt: Date.now() }];
  emit();
  return id;
}

/** Retire une génération · idempotent, un id inconnu ne casse rien. */
export function terminerGeneration(id: number): void {
  const avant = jobs.length;
  jobs = jobs.filter((j) => j.id !== id);
  if (jobs.length !== avant) emit();
}

/** Les générations en cours · l'instantané partagé. */
export function generationsActives(): JobGeneration[] {
  return jobs;
}

/** Le nombre de VISUELS en cours (somme des lots) · c'est ce qu'on montre. */
export function nbVisuelsEnCours(): number {
  return jobs.reduce((n, j) => n + j.count, 0);
}

/** S'abonner aux changements · rend la fonction de désabonnement. */
export function sabonnerGenerations(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

const VIDE: JobGeneration[] = [];

/** Le hook pour le shell · côté serveur, aucun job (rendu neutre au premier paint). */
export function useGenerationsActives(): JobGeneration[] {
  return useSyncExternalStore(sabonnerGenerations, generationsActives, () => VIDE);
}
