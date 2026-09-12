import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La liste des marques donne à chaque marque une IDENTITÉ · l'avatar de site
 * (favicon/teinte propre), plus la pastille d'accent uniforme, la même pour
 * toutes. Le rendu de l'avatar est couvert par `avatar-site-rendu` · ici on
 * garde le câblage : la page l'adopte et a lâché l'ancienne pastille.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/brands/page.tsx'), 'utf8');

describe('la liste des marques porte une identité par marque', () => {
  it('l’avatar de site est adopté, avec le nom ET l’adresse', () => {
    expect(src, 'l’avatar de site n’est plus adopté').toMatch(/<AvatarSite nom=\{b\.name\} site=\{b\.url\}/);
  });

  it('l’ancienne pastille d’accent uniforme a disparu', () => {
    // La même `var(--grad-accent)` pour toutes les marques ne distinguait rien.
    expect(src, 'la pastille uniforme est encore là').not.toMatch(/background: 'var\(--grad-accent\)'[^}]*\}\}>\{initials/);
    expect(src, 'la fonction initials locale traîne encore').not.toMatch(/function initials/);
  });
});
