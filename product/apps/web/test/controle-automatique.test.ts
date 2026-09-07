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
const ACTIONS = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');
const CONTROLE = readFileSync(join(RACINE, 'packages/ai/src/controle-pub.ts'), 'utf8');
const JOINTE = readFileSync(join(process.cwd(), 'lib/image-jointe.ts'), 'utf8');
const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');
const ASSISTANT = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AssistantPub.tsx'), 'utf8');

/** Le corps de `composeBatch` · c'est là que la relecture doit vivre. */
const LOT = ACTIONS.slice(ACTIONS.indexOf('async function composeBatch('), ACTIONS.indexOf('/** Références de pubs gagnantes'));

describe('la relecture part sans qu’on la demande', () => {
  it('elle est déclenchée pendant la génération du lot', () => {
    // Pas depuis l'écran, pas sur un clic · c'est tout l'objet du changement.
    expect(LOT, 'la relecture n’est plus dans le lot').toMatch(/controlePubEntiere\(/);
  });

  it('uniquement en mode « entière »', () => {
    // En composé, c'est nous qui écrivons les textes · les relire reviendrait à
    // vérifier notre propre travail, et à payer pour ça.
    expect(LOT).toMatch(/if \(o\.mode === 'entiere'\) \{/);
  });

  it('un échec de relecture ne fait pas échouer le lot', () => {
    // Une publicité produite mais non relue reste une publicité produite. Faire
    // tomber quatre images parce qu'une vérification n'a pas abouti coûterait
    // quatre images pour rien.
    expect(LOT).toMatch(/logFailure\('ads:controle'/);
    expect(JOINTE, 'une image irrécupérable remonte au lieu de rendre null').toMatch(/catch \{\s*\n?\s*return null;/);
  });
});

describe('elle reste bon marché', () => {
  it('elle passe par le modèle le moins cher', () => {
    expect(CONTROLE).toMatch(/CONTROLE_MODEL[^\n]*haiku/);
  });

  it('l’image est réduite avant d’être envoyée', () => {
    // Chaque pixel envoyé est facturé, et rien de ce qu'on demande n'a besoin
    // du plein format.
    expect(JOINTE).toMatch(/LARGEUR_MAX = \d{3}/);
    expect(JOINTE).toMatch(/\.resize\(LARGEUR_MAX/);
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
    // modèle. Trois champs, tous des constats.
    const schema = CONTROLE.slice(CONTROLE.indexOf('input_schema:'), CONTROLE.indexOf('required:'));
    const champs = [...schema.matchAll(/^ {6}(\w+): \{$/gm)].map((m) => m[1]);
    expect(champs.sort()).toEqual(['ecartsProduit', 'produitFidele', 'texteLu']);
  });

  it('le coût est annoncé avant de lancer', () => {
    // Rien ne se dépense sans le dire · c'est la règle, même pour trois pour
    // cent.
    expect(ASSISTANT).toMatch(/relecture automatique incluse/);
  });
});

describe('le constat se voit sans cliquer', () => {
  it('la grille reçoit le verdict de chaque pub', () => {
    expect(ACTIONS).toMatch(/copieResume: rec\.copieConforme\?\.resume/);
    expect(STUDIO, 'la carte reçoit le constat sans jamais l’afficher').toMatch(/<ControleBadge c=\{a\.controle\} \/>/);
  });

  it('un produit modifié écarte la pub des vignettes d’exemple', () => {
    // C'est le critère éliminatoire n° 1 du mode entière · une publicité au
    // packaging inventé ne représente pas sa direction artistique, elle
    // représente une génération manquée.
    expect(ACTIONS).toMatch(/rec\.produitFidele === false/);
  });

  it('sans référence produit, on ne conclut rien', () => {
    // Répondre « identique » par défaut transformerait une absence de
    // vérification en garantie · c'est le mensonge le plus facile à écrire.
    expect(CONTROLE).toMatch(/produitFidele: avecRef && typeof v\.produitFidele === 'boolean' \? v\.produitFidele : null/);
  });
});
