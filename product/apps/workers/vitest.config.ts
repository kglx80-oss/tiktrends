import { defineConfig } from 'vitest/config';

/**
 * Limites des tests du worker · MESURÉES, pas posées de tête.
 *
 * Sans configuration, vitest coupe un cas à 5 s et un crochet à 10 s. Plusieurs
 * cas font un vrai travail : ~90 tours du moteur Studios sur pglite
 * (`fa-worker-fal`, « 3 minutes de calcul » · l'horloge y est déjà simulée),
 * import à froid du point d'entrée (`e-worker-recette`), décodages et sonde
 * ffmpeg réels (`l7b-decodeur-video`), et chaque fichier pglite rejoue `initdb`
 * puis toutes les migrations dans son `beforeAll` (`test/pg-memoire.ts`). Rien
 * de cela ne se réduit sans changer ce qui est vérifié.
 *
 * Mesures du 2026-11-02, 4 vCPU, suite `apps/workers` complète, 10 passages
 * par colonne, durée du cas en ms (reporter JSON de vitest) :
 *
 * | cas                               | seul (charge 2-6) | 8 boucles CPU + autres sessions (charge 9-21) | 16 boucles CPU (charge 19-21) |
 * |-----------------------------------|-------------------|-----------------------------------------------|-------------------------------|
 * | fa-worker-fal · 3 minutes         | 985-1 278         | 5 085-10 033                                  | 5 363-6 368                   |
 * | e-worker-recette · import         | 898-1 129         | 3 087-6 846                                   | 3 932-4 625                   |
 * | l7b-decodeur-video · sonde réelle | 570-1 065         | 1 915-4 875                                   | 2 483-3 491                   |
 * | l7b-decodeur-video · décodages    | 202-406           | 990-3 980                                     | 1 025-2 001                   |
 * | crochet `pgMemoire()`             | 3 633             | 8 518-20 540                                  | ·                             |
 *
 * À 5 s, 8 boucles CPU (charge 11-29) coupaient « 3 minutes » 10 fois sur 10,
 * l'import 8 fois sur 10, la sonde réelle 5 fois sur 10.
 *
 * 30 s par cas laissent un facteur 3 sur la pire mesure (10,0 s) ; 60 s par
 * crochet, un facteur 2,9 sur 20,5 s. Mêmes valeurs que `apps/web`, retrouvées
 * ici par la mesure. Éprouvées par mutation : à 1 s, « 3 minutes » tombe
 * (« Test timed out in 1000ms ») ; à 50 ms, les crochets pglite et ffmpeg
 * tombent. Un crochet pglite ne rend la main qu'au chargement du WASM : à
 * 500 ms, un crochet de 3 s passe quand même · la limite des crochets ne mord
 * que sur ce qui rend la main, d'où la marge prise sur la mesure entière. Les
 * limites propres à un fichier (`gb-retouche-worker`, `e2-sonde-recette`)
 * restent prioritaires.
 */
export default defineConfig({ test: { testTimeout: 30_000, hookTimeout: 60_000 } });
