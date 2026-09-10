import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PartageGagnante, OUVRIR_PARTAGE } from '../app/(app)/adsmap/PartageGagnante';

/**
 * Proposer le partage au bon moment · quand une créa gagne, et seulement à qui
 * peut vraiment partager.
 *
 * On lit le RENDU · l'invite est là dans le bon cas, absente dans les autres.
 * Le composant ne dépend d'aucune action serveur, il est donc rendable ici (à la
 * différence du drawer qui l'accueille).
 */

describe('l’invite de partage n’apparaît qu’au bon moment', () => {
  it('créa gagnante ET droit de partager · l’invite et son bouton sont rendus', () => {
    const html = renderToStaticMarkup(<PartageGagnante gagnante peutPartager />);
    expect(html).toContain('Cette créa gagne');
    expect(html).toContain('Partager au client');
    expect(html).toContain('marque blanche');
  });

  it('créa perdante · rien, même avec le droit', () => {
    expect(renderToStaticMarkup(<PartageGagnante gagnante={false} peutPartager />)).toBe('');
  });

  it('sans droit de partager · rien, jamais un bouton muet', () => {
    // Le panneau de partage n'est monté que pour un admin · proposer « Partager »
    // à qui ne le peut pas ouvrirait sur rien.
    expect(renderToStaticMarkup(<PartageGagnante gagnante peutPartager={false} />)).toBe('');
  });

  it('l’événement d’ouverture est stable · le ShareButton s’y accroche', () => {
    expect(OUVRIR_PARTAGE).toBe('tt:ouvrir-partage');
  });
});

describe('les deux bouts de la ficelle sont noués', () => {
  // Le ShareButton tire SharePanel (actions serveur) · on ne peut pas le rendre
  // ici. On vérifie donc en source qu'il écoute bien l'événement · sans ça,
  // l'invite du drawer lancerait un signal que personne n'attrape.
  const SHARE = readFileSync(join(process.cwd(), 'app/(app)/adsmap/ShareButton.tsx'), 'utf8');
  it('le ShareButton écoute l’événement d’ouverture', () => {
    expect(SHARE).toContain('OUVRIR_PARTAGE');
    expect(SHARE).toMatch(/addEventListener\(OUVRIR_PARTAGE/);
  });
});
