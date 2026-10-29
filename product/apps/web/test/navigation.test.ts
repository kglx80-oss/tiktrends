import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTES_HISTORIQUES } from '../lib/navigation';
import { lienNouveauProjet, lireContexteNouveauProjet } from '@tiktrends/core';
import { FEATURES } from '../lib/rbac';

describe('les entrées de navigation (`FEATURES`, lues par la coquille Spatial) restent distinctes', () => {
  it('aucun libellé de rail n’apparaît deux fois · « Radar » l’a fait, et on ne savait plus lequel', () => {
    const labels = FEATURES.filter((f) => f.group !== 'account').map((f) => f.label);
    const doublons = labels.filter((l, i) => labels.indexOf(l) !== i);
    expect([...new Set(doublons)], `Libellé(s) en double : ${doublons.join(', ')}`).toEqual([]);
  });
});

describe('les CTA de deep-link portent un paramètre que la cible relit', () => {
  /**
   * Un CTA qui transmet `?inspo=` à un écran qui ne lit que `angle`/`mode`/`ref`
   * dépose un réglage perdu au chargement · le clic « marche » mais n'arme rien.
   * Le Radar en souffrait. Depuis le retrait des anciens studios (10/10), le CTA
   * du Radar mène à la préparation d'un projet (`lienNouveauProjet`) · on vérifie
   * que les clés qu'il émet sont parmi celles que cette page relit, et que
   * l'angle transmis arrive bien comme objectif proposé.
   */
  it('le CTA Radar → Studios émet un paramètre lu par la préparation d’un projet', () => {
    // Vague 4 · le Radar est servi par Spatial · le CTA de chaque créa notée vient du noyau (`ligneRadarCreatif`).
    const radar = readFileSync(join(process.cwd(), '..', '..', 'packages', 'core', 'src', 'spatial', 'veille', 'radar-creatif.ts'), 'utf8');
    const appels = [...radar.matchAll(/lienNouveauProjet\(\{([^}]*)\}\)/g)].map((m) => m[1]!);
    expect(appels.length, 'Le Radar doit garder un CTA vers les Studios').toBeGreaterThan(0);
    const emis = appels.flatMap((a) => [...a.matchAll(/(\w+):/g)].map((m) => m[1]!));
    // Vague 3 · la préparation d'un projet n'est plus servie que par Spatial.
    const page = readFileSync(join(process.cwd(), 'app', '(spatial)', 'sp', 'studio', 'projets', 'nouveau', 'page.tsx'), 'utf8');
    expect(page, 'la préparation d’un projet ne relit plus son adresse').toMatch(/lireContexteNouveauProjet\(await searchParams\)/);
    const lus = new Set(ROUTES_HISTORIQUES.find((r) => r.chemin === '/studio/projets/nouveau')?.params ?? []);
    const morts = emis.filter((p) => !lus.has(p));
    expect(morts, `Paramètre(s) émis par le Radar que la préparation ne relit pas : ${morts.join(', ')}`)
      .toEqual([]);
    // Le RÉSULTAT · l'angle émis par le Radar devient l'objectif proposé.
    const lien = lienNouveauProjet({ type: 'ads', angle: 'Hook témoignage' });
    const c = lireContexteNouveauProjet(Object.fromEntries(new URL(lien, 'http://local').searchParams));
    expect(c.type).toBe('ads');
    expect(c.objectif, 'l’angle transmis par le Radar est perdu à l’arrivée').toContain('Hook témoignage');
  });
});
