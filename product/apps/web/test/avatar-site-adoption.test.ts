import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'avatar de site est la SEULE implémentation · favicon/teinte au même endroit.
 *
 * Son rendu est couvert par `avatar-site-rendu` · ici on garde la convergence :
 * la carte de concurrent et l'en-tête de la page concurrent l'adoptent, au lieu
 * de recopier chacun sa pastille. Un retour à une pastille locale ferait tomber
 * ce garde.
 */
const lire = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const SWITCHER = lire('components/BrandSwitcher.tsx');

describe('l’avatar de site est adopté partout', () => {


  // CDC v8 · favicon des marques · le sélecteur (haut à gauche) et le profil
  // portent la favicon du site de la marque, via le MÊME AvatarSite · pas de
  // favicon recopiée en dur, pas de pastille dégradée nue à la place.
  it('le sélecteur de marques montre la favicon · marque active ET chaque ligne', () => {
    expect(SWITCHER, 'la marque active ne délègue pas à AvatarSite').toMatch(/<AvatarSite nom=\{active\.name\} site=\{active\.url\}/);
    expect(SWITCHER, 'les lignes de marque ne délèguent pas à AvatarSite').toMatch(/<AvatarSite nom=\{b\.name\} site=\{b\.url\}/);
    expect(SWITCHER, 'le sélecteur recopie la favicon en dur au lieu de déléguer').not.toContain('s2/favicons');
  });

});
