import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le contrôle de copie est branché, et ne coûte pas un appel de plus.
 *
 * ── Ce que ces gardes défendent ──────────────────────────────────────────────
 *
 * La règle de comparaison vit dans le noyau et y est testée sur treize cas. Ce
 * qui ne se teste que d'ici, c'est le CÂBLAGE : que la transcription soit
 * demandée, qu'elle soit comparée, que le verdict soit rangé avec la note et
 * relu depuis le cache, et surtout qu'aucun second appel de vision n'ait été
 * ajouté au passage.
 *
 * Ce dernier point est le plus facile à perdre de vue · un contrôle qui double
 * le prix d'une analyse serait désactivé au premier relevé de dépense, et on
 * aurait construit une mesure que personne n'allume.
 */

const AI = readFileSync(join(process.cwd(), '../../packages/ai/src/critique.ts'), 'utf8');
const ACTIONS = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');
const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('on demande une transcription, pas un avis', () => {
  it('l’outil de notation sait rendre le texte lu', () => {
    expect(AI, 'le champ de transcription a disparu du schéma').toMatch(/texteLu:\s*\{\s*\n\s*type: 'array'/);
    expect(AI, 'la consigne ne demande plus de recopier').toMatch(/RECOPIE/);
  });

  it('la transcription n’est pas corrigée en chemin', () => {
    // La corriger effacerait exactement la faute qu'on cherche à mesurer. Le
    // seul traitement admis est de retirer les lignes vides et de borner la
    // longueur.
    const retour = AI.slice(AI.indexOf('texteLu: aVu &&'), AI.indexOf('texteLu: aVu &&') + 260);
    expect(retour).toMatch(/\.filter\(/);
    expect(retour, 'la transcription est retouchée avant comparaison').not.toMatch(/toLowerCase|normalize|replace/);
  });

  it('rien n’est relu hors du mode « entière »', () => {
    // En mode composé, c'est nous qui écrivons les textes · les « relire » dans
    // l'image reviendrait à vérifier notre propre travail, et à signaler des
    // écarts là où le compositeur ne peut pas se tromper.
    expect(AI).toMatch(/texteLu: aVu && creative\.texteDansImage/);
    expect(ACTIONS).toMatch(/texteAttenduDansImage\(r\.mode\)\s*\n?\s*\?\s*verifieCopie\(/);
  });
});

describe('le verdict survit à la page', () => {
  it('il est rangé avec la note', () => {
    expect(ACTIONS, 'le verdict n’est pas enregistré').toMatch(/copieConforme: copie/);
  });

  it('il est relu depuis le cache, sans repayer', () => {
    // Sans ça, rouvrir une publicité déjà analysée perd le constat · et le seul
    // moyen de le retrouver serait de repayer une analyse.
    expect(ACTIONS).toMatch(/copie: r\.copieConforme \?\? null, cost: 0, cached: true/);
  });

  it('l’écran le reçoit et l’affiche', () => {
    expect(STUDIO).toMatch(/copie=\{copieData\}/);
    expect(STUDIO, 'le verdict arrive à la carte sans jamais s’afficher').toMatch(/\{copie && copie\.resume &&/);
  });

  it('une accroche réécrite plafonne la note', () => {
    // Publier 72 sur 100 sous une publicité qui ne dit plus ce qu'on voulait,
    // c'est afficher la note et enterrer le constat · c'est le défaut déjà
    // corrigé pour les ratés de fabrication.
    expect(ACTIONS).toMatch(/plafonner\(score\.score, vd\.grave \|\| !!copie\?\.grave\)/);
  });
});

describe('le contrôle ne coûte pas un appel de plus', () => {
  it('aucun second appel de vision n’a été ajouté', () => {
    // La transcription voyage dans la note qui regardait DÉJÀ l'image · quelques
    // jetons de sortie, pas une seconde image envoyée. Un `scoreCreative` de
    // plus, ou un appel Anthropic dédié, doublerait le prix d'une analyse.
    const appels = (ACTIONS.match(/await scoreCreative\(/g) ?? []).length;
    expect(appels, 'plus d’un appel de notation dans le fichier').toBe(1);
    expect(ACTIONS, 'un appel de vision dédié a été ajouté').not.toMatch(/messages\.create\(/);
  });
});
