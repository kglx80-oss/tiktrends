import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La carte d'annonce donne une IDENTITÉ à l'annonceur, même sans logo plateforme.
 *
 * AdCard importe des actions serveur (via InspoButtons) · non rendable en test
 * isolé · on éprouve l'ADOPTION par la source, comme `inspo-boutons`. Le RÉSULTAT
 * de l'avatar (favicon/teinte/initiales) est déjà prouvé au rendu par
 * `avatar-site-rendu`. Ici on garde que la carte NE retombe PAS sur un nom nu
 * quand le logo manque · c'était le dernier endroit de l'outil sans avatar.
 */
const src = readFileSync(join(process.cwd(), 'components/AdCard.tsx'), 'utf8');

describe('l’annonceur a une identité, avec ou sans logo', () => {
  it('le logo plateforme est gardé quand il existe', () => {
    expect(src).toMatch(/ad\.advertiserLogo \? \(/);
    expect(src).toContain('src={ad.advertiserLogo}');
  });

  it('sans logo, un avatar de repli (favicon/teinte) remplace le nom nu', () => {
    expect(src, 'le repli d’identité a disparu').toMatch(
      /<AvatarSite nom=\{ad\.advertiserName \|\| 'Annonceur'\} site=\{ad\.landingDomain\}/,
    );
  });

  it('un nom d’annonceur long ne pousse pas le badge ni le bouton hors carte', () => {
    // Même classe de bug que les cartes concurrents · la rangée (enfant de
    // grille) et le nom (flex-item) doivent porter minWidth:0 pour que l'ellipsis
    // opère au lieu de déborder. AdCard tire des actions serveur → garde source.
    expect(src, 'la rangée annonceur ne peut pas rétrécir').toMatch(/gap: 8, minWidth: 0 \}\}>/);
    expect(src, 'le nom ne peut pas s’ellipser').toContain('flex: 1, minWidth: 0');
  });
});
