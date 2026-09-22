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
const CARTE = lire('components/CarteConcurrent.tsx');
const PAGE = lire('app/(app)/brands/[id]/competitors/[name]/page.tsx');
const SWITCHER = lire('components/BrandSwitcher.tsx');
const PROFIL = lire('app/(app)/brands/[id]/page.tsx');

describe('l’avatar de site est adopté partout', () => {
  it('la carte de concurrent délègue son avatar à AvatarSite', () => {
    expect(CARTE, 'la carte ne délègue plus à AvatarSite').toMatch(/<AvatarSite nom=\{nom\} site=\{nom\}/);
    // Plus de favicon recopiée en dur dans la carte · l'avatar est unique.
    expect(CARTE, 'la carte recopie encore la favicon en dur').not.toMatch(/s2\/favicons/);
  });

  it('l’en-tête de la page concurrent adopte AvatarSite, plus la pastille plate', () => {
    expect(PAGE, 'l’en-tête n’adopte pas AvatarSite').toMatch(/<AvatarSite nom=\{name\} site=\{site\}/);
    expect(PAGE, 'la pastille plate #1b1420 traîne encore').not.toContain("background: '#1b1420'");
  });

  // CDC v8 · favicon des marques · le sélecteur (haut à gauche) et le profil
  // portent la favicon du site de la marque, via le MÊME AvatarSite · pas de
  // favicon recopiée en dur, pas de pastille dégradée nue à la place.
  it('le sélecteur de marques montre la favicon · marque active ET chaque ligne', () => {
    expect(SWITCHER, 'la marque active ne délègue pas à AvatarSite').toMatch(/<AvatarSite nom=\{active\.name\} site=\{active\.url\}/);
    expect(SWITCHER, 'les lignes de marque ne délèguent pas à AvatarSite').toMatch(/<AvatarSite nom=\{b\.name\} site=\{b\.url\}/);
    expect(SWITCHER, 'le sélecteur recopie la favicon en dur au lieu de déléguer').not.toContain('s2/favicons');
  });

  it('l’en-tête du profil de marque adopte AvatarSite (favicon), plus la pastille d’initiales', () => {
    expect(PROFIL, 'le profil n’adopte pas AvatarSite').toMatch(/<AvatarSite nom=\{b\.name\} site=\{b\.url\}/);
    expect(PROFIL, 'le profil recopie la favicon en dur au lieu de déléguer').not.toContain('s2/favicons');
  });
});
