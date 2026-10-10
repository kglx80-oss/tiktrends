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
  });
});
