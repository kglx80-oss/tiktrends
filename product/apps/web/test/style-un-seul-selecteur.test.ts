import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AD_DIRECTIONS } from '@tiktrends/core';

/**
 * Un seul sélecteur de direction artistique.
 *
 * ── Le défaut que ça répare ──────────────────────────────────────────────────
 *
 * Le rapport reçu, deux fois : « j'ai toujours aucune vue pour les univers
 * visuels ». Je l'ai lu comme un manque à construire. C'en était un ailleurs :
 * `UniversePicker` existait déjà, avec ses vignettes prises dans les créas de
 * la marque, ses filtres par famille, et son bouton d'aperçus payants au prix
 * écrit dessus.
 *
 * En écrivant l'assistant, j'ai recopié la liste des directions et rendu quinze
 * lignes de texte. Deux sélecteurs pour un même choix · celui qui montre, et
 * celui qu'on voit.
 *
 * ── Ce que le garde vérifie ──────────────────────────────────────────────────
 *
 * Que l'assistant ne réénumère pas les directions, et que le sélecteur lui
 * arrive. Une liste recopiée finit toujours par diverger de l'originale, et
 * c'est la copie que l'utilisateur a sous les yeux.
 */

const UI = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AssistantPub.tsx'), 'utf8');
const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('l’assistant ne refait pas le sélecteur de style', () => {
  it('l’étape « Style » rend le sélecteur qu’on lui donne', () => {
    expect(UI, 'l’étape de style ne rend plus le sélecteur reçu').toMatch(/return <>\{p\.selecteurStyle\}<\/>/);
    expect(STUDIO, 'le sélecteur n’est pas transmis à l’assistant').toMatch(/selecteurStyle=\{<UniversePicker/);
  });

  it('aucune direction n’est réénumérée à la main', () => {
    // C'est la même règle que pour les étapes · une seconde liste diverge, et
    // l'écran finit par proposer une direction que le serveur ignore.
    //
    // On cherche la CLÉ entre guillemets · c'est ce qu'une liste recopiée
    // contient, tandis qu'un libellé peut légitimement apparaître dans une
    // phrase.
    const coupables = AD_DIRECTIONS
      .map((d) => d.key)
      .filter((k) => new RegExp(`'${k}'`).test(UI));
    expect(coupables, `direction(s) réénumérées dans l’assistant : ${coupables.join(', ')}`).toEqual([]);
  });

  it('l’assistant reste rendable · aucun import de code serveur', () => {
    // C'est ce qui rend `assistant-rendu.test.tsx` possible · le sélecteur lit
    // les vignettes en base, l'importer ici ferait entrer `server-only` dans la
    // fenêtre et le garde qui vérifie qu'un échec s'affiche tomberait avec.
    //
    // La prop coûte une ligne. Le garde vaut plus.
    expect(UI, 'un composant à dépendances serveur est importé dans la fenêtre').not.toMatch(/from '.*components\/UniversePicker'/);
    expect(UI, 'une action serveur est importée dans la fenêtre').not.toMatch(/from '.*app\/actions\//);
  });
});
