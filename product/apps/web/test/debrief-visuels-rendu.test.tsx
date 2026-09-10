import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DebriefVisuelsStrip } from '../components/DebriefVisuels';
import { debriefVisuels } from '@tiktrends/core';

/**
 * Le débrief du lot de visuels se VOIT · on rend la bande et on lit le HTML. La
 * logique de comptage est prouvée par mutation dans `debrief-visuels` (core) ;
 * ici, le rendu du résumé + le câblage du studio (fichier gros client, non
 * rendable · lecture source).
 */

describe('la bande de débrief se rend', () => {
  it('affiche le résumé du lot jugé', () => {
    const d = debriefVisuels(['up', 'down'])!;
    const html = renderToStaticMarkup(<DebriefVisuelsStrip d={d} />);
    expect(html).toContain(d.resume);
    expect(html).toContain('retenu');
  });
});

describe('le studio Image branche le débrief', () => {
  const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/image/ImageStudio.tsx'), 'utf8');
  it('agrège les notes des visuels et rend la bande', () => {
    expect(STUDIO).toContain('debriefVisuels(');
    expect(STUDIO).toContain('<DebriefVisuelsStrip');
    expect(STUDIO).toMatch(/im\.rating \?\? null/);
  });
});
