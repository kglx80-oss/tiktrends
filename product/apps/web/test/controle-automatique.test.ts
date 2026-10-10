import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La relecture part toute seule, et ne coûte pas le prix d'une analyse.
 *
 * ── Le défaut que ça répare ──────────────────────────────────────────────────
 *
 * Le contrôle de copie a été branché sur la note Jarvis, parce que celle-ci
 * regardait déjà l'image et que ça ne coûtait donc rien de plus. C'était juste,
 * et ça a produit une mesure qui n'existait que sur le papier : la note est
 * MANUELLE et payante, une publicité à la fois.
 *
 * Un lot de quatre repartait sans qu'aucune n'ait été relue. Les deux questions
 * qui décident si le mode « entière » est utilisable — a-t-il écrit nos mots,
 * a-t-il gardé notre produit — restaient sans réponse sauf à payer quatre
 * analyses, une par une.
 *
 * ── Les deux choses que ces gardes tiennent ──────────────────────────────────
 *
 * Que la relecture parte à la GÉNÉRATION, et qu'elle reste bon marché. Le
 * second point n'est pas un détail : un contrôle au prix d'une analyse serait
 * éteint au premier relevé de dépense, et on aurait construit une mesure que
 * personne n'allume.
 */

const RACINE = join(process.cwd(), '..', '..');
const CONTROLE = readFileSync(join(RACINE, 'packages/ai/src/controle-pub.ts'), 'utf8');

describe('elle reste bon marché', () => {
  it('elle passe par le modèle le moins cher', () => {
    expect(CONTROLE).toMatch(/CONTROLE_MODEL[^\n]*haiku/);
  });

  it('elle ne demande qu’un constat, jamais un jugement', () => {
    // `scoreCreative` coûte des crédits et un modèle cher · la relecture ne fait
    // que regarder, et c'est ce qui la rend automatisable.
    //
    // Le premier garde écrit ici cherchait « score|verdict|note » dans tout le
    // fichier · il tombait sur mes propres commentaires, qui expliquent
    // justement qu'on ne demande NI note NI verdict. Un garde qui lit la prose
    // au lieu du code.
    //
    // On regarde donc ce que l'outil DÉCLARE · c'est ça, le contrat avec le
    // modèle. Cinq champs, tous des constats · ce qui est écrit, ce qui diffère
    // du produit, et si le texte publicitaire se lit. Aucune note, aucun verdict.
    const schema = CONTROLE.slice(CONTROLE.indexOf('input_schema:'), CONTROLE.indexOf('required:'));
    const champs = [...schema.matchAll(/^ {6}(\w+): \{$/gm)].map((m) => m[1]);
    expect(champs.sort()).toEqual(['ecartsProduit', 'problemesLisibilite', 'produitFidele', 'texteLisible', 'texteLu']);
  });
});

describe('le constat ne conclut que ce qu’il a vu', () => {
  it('sans référence produit, on ne conclut rien', () => {
    // Répondre « identique » par défaut transformerait une absence de
    // vérification en garantie · c'est le mensonge le plus facile à écrire.
    expect(CONTROLE).toMatch(/produitFidele: avecRef && typeof v\.produitFidele === 'boolean' \? v\.produitFidele : null/);
  });
});
