import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ETAPES } from '@tiktrends/core';

/**
 * L'assistant montre les règles du noyau · il n'en invente aucune.
 *
 * ── L'invariant ──────────────────────────────────────────────────────────────
 *
 * « On ne passe pas à l'étape suivante tant que ce n'est pas fait » est une
 * règle de produit. Écrite dans une condition d'affichage, elle se découvre
 * cassée en cliquant ; écrite dans le noyau, un test l'exerce.
 *
 * Ce garde vérifie que l'écran la LIT au lieu de la réécrire · une deuxième
 * définition finirait par diverger de la première, et l'assistant laisserait
 * passer ce que le serveur refuse.
 */

const UI = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AssistantPub.tsx'), 'utf8');
const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('l’assistant lit le noyau', () => {
  it('prend l’ordre, la complétion et le manque du noyau', () => {
    for (const nom of ['ETAPES', 'etapeComplete', 'manque', 'peutGenerer', 'etapeSuivante']) {
      expect(UI, `${nom} n’est plus lu · la règle a été réécrite dans l’écran`).toContain(nom);
    }
  });

  it('n’écrit aucune liste d’étapes en dur', () => {
    // Une seconde liste finirait par diverger · c'est ainsi qu'un écran finit
    // par proposer une étape que le serveur ignore.
    for (const e of ETAPES) {
      expect(UI.includes(`'${e}',`), `« ${e} » semble ré-énuméré dans l’écran`).toBe(false);
    }
  });

  it('le bouton final est gouverné par `peutGenerer`', () => {
    // Pas par « on est sur le dernier écran » · toutes les étapes comptent, y
    // compris celles qu'on a traversées avant de revenir en arrière.
    expect(UI).toMatch(/derniere \? peutGenerer\(p\.etat\)/);
  });

  it('un refus nomme toujours ce qui manque', () => {
    // C'est le défaut qu'on vient de corriger un cran plus bas · le refaire
    // ici serait apprendre à l'envers.
    expect(UI).toMatch(/\{\(bloquant \|\|/);
    expect(UI, 'le dernier écran ne dit pas quelle étape antérieure bloque').toMatch(/premiereIncomplete\(p\.etat\)/);
  });

  it('annonce la durée DANS le pied, avant et pendant', () => {
    // « Le bouton ne fonctionne pas » était « il travaille depuis cinq minutes
    // et rien ne me le dit ».
    //
    // Le garde regarde le PIED, pas le fichier entier · une occurrence restée
    // dans un autre écran suffisait à le laisser vert quand la seule qui
    // compte disparaissait. Vérifié en la supprimant.
    const pied = UI.slice(UI.indexOf('function Pied('), UI.indexOf('/* -------------------------------- Les étapes'));
    expect(pied, 'le pied ne calcule plus de durée').toMatch(/dureeAttendue\(/);
    expect(pied, 'la durée n’est pas montrée avant de lancer').toMatch(/\{duree\}/);
    expect(pied, 'rien n’est dit pendant la génération').toMatch(/p\.busy &&/);
  });
});

describe('le studio ouvre l’assistant', () => {
  it('« Composeur complet » l’ouvre', () => {
    expect(STUDIO).toMatch(/setAssistant\(true\)/);
    expect(STUDIO).toMatch(/<AssistantPub/);
  });

  it('l’assistant reçoit un état, pas des règles', () => {
    // Il ne doit rien décider · il montre ce que le noyau tranche.
    expect(STUDIO).toMatch(/etat=\{etatAssistant\}/);
  });

  it('chaque panneau a un moyen de l’ouvrir', () => {
    // ── Le défaut que ça répare ──────────────────────────────────────────
    //
    // En branchant l'assistant sur le bandeau « Composeur complet », j'ai
    // remplacé le seul clic qui ouvrait le composeur à plat. Il est resté dans
    // le code, rendu derrière `hidden={!avance}`, sans plus aucun moyen de
    // mettre `avance` à vrai · un panneau injoignable, et je l'ai annoncé
    // comme conservé.
    //
    // Rien ne compile mal, rien ne plante. Ça se découvre en cliquant.
    for (const panneau of ['setAvance', 'setAssistant']) {
      const clics = STUDIO.match(new RegExp(`onClick=\\{[^}]*${panneau}\\(`, 'g')) ?? [];
      expect(clics.length, `« ${panneau} » n’est plus atteignable depuis un clic`).toBeGreaterThan(0);
    }
  });

  it('l’assistant et le composeur à plat ne partagent pas un bouton', () => {
    // Les confondre est précisément ce qui a fait disparaître le second.
    const partage = /onClick=\{[^}]*setAssistant\(true\)[^}]*setAvance\(/.test(STUDIO);
    expect(partage, 'un même clic pilote les deux panneaux').toBe(false);
  });

  it('se ferme seulement quand le lot a produit quelque chose', () => {
    // Se fermer sur un échec emporterait le seul endroit où l'erreur s'affiche
    // · c'est le défaut déjà corrigé sur le démarrage rapide.
    expect(STUDIO).toMatch(/producedSomething\(out\)\) setAssistant\(false\)/);
  });
});
