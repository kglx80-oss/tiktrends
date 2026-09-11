import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Composer } from '../components/Composer';
import { ICON_PATHS } from '../components/Icon';

/**
 * Les réglages de studio (la barre Composer, partagée par Pubs/Image/Vidéo)
 * affichaient une pastille par réglage, marquée d'un emoji (📦 👤 🎯 ⧉ ✦ ⬚ ⏱ ◐…).
 * On passe au jeu d'icônes au trait · le RÉSULTAT est prouvé par rendu (Composer
 * n'importe que React, donc il se rend ici), et l'absence de repli muet par un
 * scan des noms d'icône passés aux `controls` de chaque studio.
 */
describe('la pastille de réglage rend une icône au trait', () => {
  const html = renderToStaticMarkup(
    <Composer
      value="" onChange={() => {}} onGenerate={() => {}} busy={false}
      controls={[{ key: 'k', title: 'Format', icon: 'frame', options: [{ value: 'a', label: 'Carré' }], value: 'a', onChange: () => {} }]}
    />,
  );
  it('montre un <svg>, jamais l’emoji brut', () => {
    expect(html).toContain('<svg');
    expect(html, 'une pastille premium ne porte pas d’emoji').not.toMatch(/📦|👤|🎯|⧉|✦|⬚|⏱|◐|🎬/u);
  });
});

describe('chaque icône de réglage existe dans le jeu · jamais le repli grid', () => {
  const base = process.cwd();
  const STUDIOS = [
    'app/(app)/studio/ads/AdsStudio.tsx',
    'app/(app)/studio/image/ImageStudio.tsx',
    'app/(app)/studio/video/VideoStudioFull.tsx',
  ];
  it('les noms passés en `icon:` aux controls (et TEMPLATES) sont connus', () => {
    const introuvables: string[] = [];
    for (const rel of STUDIOS) {
      const src = readFileSync(join(base, rel), 'utf8');
      for (const m of src.matchAll(/icon: '([a-z]+)'/g)) {
        const name = m[1]!;
        if (!(name in ICON_PATHS)) introuvables.push(`${rel} · « ${name} »`);
      }
    }
    expect(introuvables, `Icône(s) de réglage absente(s) du jeu : ${introuvables.join(', ')}`).toEqual([]);
  });

  it('plus aucun emoji dans un champ `icon:`/`emoji:` de studio', () => {
    // Un ASCII-check · si un caractère non-ASCII se glisse dans un champ icône,
    // c'est un emoji qui revient. Les libellés (français, accents) ne sont pas
    // visés · on ne regarde que les valeurs de `icon:`/`emoji:`.
    const fautifs: string[] = [];
    for (const rel of STUDIOS) {
      const src = readFileSync(join(base, rel), 'utf8');
      for (const m of src.matchAll(/(?:icon|emoji): '([^']*)'/g)) {
        if (/[^\x00-\x7F]/.test(m[1]!)) fautifs.push(`${rel} · « ${m[1]} »`);
      }
    }
    expect(fautifs, `Emoji encore présent dans un champ icône : ${fautifs.join(', ')}`).toEqual([]);
  });
});
