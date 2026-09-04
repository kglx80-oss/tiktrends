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
    // On cherche `bloquant ||` dans le pied, pas une ligne entière · le garde
    // a cassé le jour où un troisième motif de refus (le plafond) s'est ajouté
    // devant, alors que la règle qu'il défend n'avait pas bougé. Un garde qui
    // tombe sur une virgule apprend à le contourner.
    const pied = UI.slice(UI.indexOf('function Pied('), UI.indexOf('/* -------------------------------- Les étapes'));
    expect(pied, 'le refus n’affiche plus ce qui manque').toMatch(/bloquant \|\|/);
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

/**
 * Les balises du fichier, dans l'ordre · assez pour dire qui contient qui.
 *
 * On ne parse pas du JSX en général : on répond à une seule question, « ce
 * composant est-il sous un ancêtre masqué ». Deux précautions suffisent ·
 *
 * - un `<` précédé d'un caractère d'identifiant est un générique
 *   (`useState<Etape>`), pas une balise ;
 * - les accolades et les chaînes sont sautées pendant qu'on cherche le `>`,
 *   sinon un attribut comme `style={{ a: '>' }}` couperait la balise en deux ;
 * - les commentaires sont retirés d'abord · le premier essai de ce garde a
 *   échoué sur le fichier CORRIGÉ, parce que le commentaire qui explique le
 *   défaut cite `<div hidden={…}>` en toutes lettres. Un ancêtre masqué
 *   imaginaire, né d'une phrase.
 */
function sansCommentaires(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function balisesDe(source: string): { nom: string; attrs: string; fermante: boolean; auto: boolean }[] {
  const src = sansCommentaires(source);
  const out: { nom: string; attrs: string; fermante: boolean; auto: boolean }[] = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '<') continue;
    if (/[A-Za-z0-9_$\])]/.test(src[i - 1] ?? ' ')) continue;
    let j = i + 1;
    const fermante = src[j] === '/';
    if (fermante) j++;
    const debut = j;
    while (j < src.length && /[A-Za-z0-9_.]/.test(src[j]!)) j++;
    const nom = src.slice(debut, j);
    // Les balises JSX commencent par une majuscule ou sont du HTML en
    // minuscules · `a < b` ne produit pas de balise.
    if (!nom || !/^[A-Za-z]/.test(nom) || (nom === nom.toLowerCase() && !BALISES_HTML.has(nom))) continue;
    let prof = 0, k = j, auto = false, fin = -1;
    for (; k < src.length; k++) {
      const c = src[k]!;
      if (c === '{') prof++;
      else if (c === '}') prof--;
      else if (prof === 0 && (c === '"' || c === '\'' || c === '`')) { const q = c; k++; while (k < src.length && src[k] !== q) k++; }
      else if (prof === 0 && c === '>') { auto = src[k - 1] === '/'; fin = k; break; }
    }
    if (fin < 0) continue;
    out.push({ nom, attrs: src.slice(j, fin), fermante, auto });
    i = fin;
  }
  return out;
}

const BALISES_HTML = new Set([
  'div', 'span', 'p', 'a', 'b', 'i', 'ul', 'li', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5',
  'button', 'input', 'textarea', 'select', 'option', 'label', 'form', 'img', 'br',
  'code', 'pre', 'section', 'header', 'footer', 'nav', 'table', 'tr', 'td', 'th', 'small', 'strong',
]);

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

  it('l’assistant n’est enfant d’aucun panneau repliable', () => {
    // ── Le vrai défaut, celui que le garde précédent laissait passer ──────
    //
    // « setAssistant apparaît dans un onClick » était vrai, et sans rapport.
    // Le bandeau posait bien `assistant = true` · mais `<AssistantPub>` était
    // monté SOUS `<div hidden={!avance}>`. Son ancêtre restait masqué, donc la
    // fenêtre ne s'affichait pas. Le clic semblait mort.
    //
    // `position: fixed` n'y change rien : un ancêtre en `display: none` ne
    // rend pas ses descendants, où qu'ils se croient placés.
    //
    // Ce garde vérifie la CONTENANCE, pas la présence d'un appel · c'est la
    // différence entre « le code existe » et « on peut le voir ».
    const pile: { nom: string; masque: boolean }[] = [];
    let vu = false;
    for (const b of balisesDe(STUDIO)) {
      if (b.fermante) { pile.pop(); continue; }
      const masque = /\bhidden=\{/.test(b.attrs);
      if (b.nom === 'AssistantPub') {
        const tiroir = pile.find((p) => p.masque);
        expect(
          tiroir,
          `l’assistant est monté sous <${tiroir?.nom} hidden={…}> · il ne s’affichera jamais`,
        ).toBeUndefined();
        vu = true;
      }
      if (!b.auto) pile.push({ nom: b.nom, masque });
    }
    expect(vu, 'l’assistant n’est plus monté du tout').toBe(true);
  });

  it('la fenêtre montre l’échec qu’elle a provoqué', () => {
    // ── Le troisième défaut de la même famille ────────────────────────────
    //
    // L'écran savait dire pourquoi le lot avait échoué · `applyResult` posait
    // `error`, et le bandeau rouge s'affichait sur la page. Sauf que la page
    // est SOUS cette fenêtre, qui recouvre tout l'écran. Le lot échouait, le
    // bouton cessait de dire « Génération… », et il ne se passait plus rien.
    //
    // « Les images ne se génèrent pas, aucun résultat » décrit exactement ça :
    // un échec expliqué à un endroit qu'on ne peut pas regarder.
    //
    // La règle : ce qui déclenche une dépense doit afficher le refus de cette
    // dépense, là où on a cliqué.
    expect(UI, 'la fenêtre reçoit l’échec sans jamais l’afficher').toMatch(/\{p\.erreur &&/);
  });

  it('l’écran transmet à la fenêtre ce qu’elle doit montrer', () => {
    // Ces deux-là ne se voient QUE d'ici · le rendu de la fenêtre, lui, est
    // vérifié dans `assistant-rendu.test.tsx`, en lisant le HTML produit.
    //
    // Ce garde ne dit pas que l'information s'affiche · seulement qu'elle
    // arrive. Croire qu'une mention suffit est exactement l'erreur qui a laissé
    // passer les trois défauts précédents.
    expect(STUDIO, 'l’échec n’est pas transmis à la fenêtre').toMatch(/erreur=\{error\}/);
    expect(STUDIO, 'le plafond n’est pas transmis à la fenêtre').toMatch(/budget=\{budget\}/);
  });

  it('se ferme seulement quand le lot a produit quelque chose', () => {
    // Se fermer sur un échec emporterait le seul endroit où l'erreur s'affiche
    // · c'est le défaut déjà corrigé sur le démarrage rapide.
    expect(STUDIO).toMatch(/producedSomething\(out\)\) setAssistant\(false\)/);
  });
});
