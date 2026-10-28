import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROUTES, ROUTES_HISTORIQUES, matchRoute } from '../lib/navigation';
import { ECRANS_SPATIAUX, lienNouveauProjet, lireContexteNouveauProjet } from '@tiktrends/core';
import { FEATURES } from '../lib/rbac';

describe('la carte décrit toutes les pages · sinon elle dérive', () => {
  /**
   * Le garde qui empêche le retour au désordre.
   *
   * La navigation avait divergé parce que rien ne reliait les écrans à leur
   * déclaration. Le fil d'Ariane de la coquille V5 est retiré avec elle (et la
   * garde « chaque page V5 a son entrée ») · la carte garde les libellés de
   * l'atelier d'un projet (`liensAtelierProjet`) et ne doit mener nulle part
   * dans le vide.
   */
  const pagesDe = (dir: string, prefixe = '', fichiers: readonly string[] = ['page.tsx']): string[] => {
    const out: string[] = [];
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) {
        // Les groupes entre parenthèses n'apparaissent pas dans l'URL.
        const seg = e.startsWith('(') && e.endsWith(')') ? '' : `/${e}`;
        out.push(...pagesDe(p, prefixe + seg, fichiers));
      } else if (fichiers.includes(e)) {
        out.push(prefixe || '/');
      }
    }
    return out;
  };

  /**
   * Le garde manquait dans l'autre sens.
   *
   * « Chaque page a son entrée » empêche d'ajouter un écran sans le déclarer.
   * Rien n'empêchait le contraire : supprimer un écran en laissant sa ligne
   * ici · le rail aurait continué de proposer un lien vers un 404, ce que
   * personne ne remarque avant de cliquer.
   */
  it('chaque entrée déclarée a sa page', () => {
    // Ici on balaie tout `app/`, pas seulement le groupe applicatif · un écran
    // déclaré peut légitimement vivre hors du rail (l'accueil d'onboarding),
    // ce qui compte est qu'il existe. Une route historique peut n'être plus
    // qu'une redirection serveur (route handler · `/analytics` → l'Accueil,
    // lot 19A) · elle mène quelque part, pas dans le vide.
    const reelles = new Set(pagesDe(join(process.cwd(), 'app'), '', ['page.tsx', 'route.ts']));
    // L'ancienne interface est retirée · un écran porté est servi par Spatial
    // (`app/(spatial)/sp`, le middleware le réécrit), il mène donc quelque part.
    for (const e of ECRANS_SPATIAUX) if (reelles.has(`/sp${e.chemin}`)) reelles.add(e.chemin);
    const fantomes = ROUTES.map((r) => r.path).filter((p) => !reelles.has(p));
    expect(fantomes, `Chemin(s) déclaré(s) sans page · le rail y mènerait dans le vide : ${fantomes.join(', ')}`)
      .toEqual([]);
  });

  it('chaque parent déclaré existe', () => {
    const connus = new Set(ROUTES.map((r) => r.path));
    const perdus = ROUTES.filter((r) => r.parent && !connus.has(r.parent)).map((r) => r.path);
    expect(perdus).toEqual([]);
  });

  it('aucun chemin déclaré deux fois', () => {
    const vus = ROUTES.map((r) => r.path);
    expect(new Set(vus).size).toBe(vus.length);
  });
});

describe('la résolution d’un chemin', () => {
  it('trouve un chemin littéral', () => {
    expect(matchRoute('/adsmap/suites')?.label).toBe('Suites');
  });

  it('trouve un chemin dynamique', () => {
    expect(matchRoute('/brands/abc-123')?.path).toBe('/brands/[id]');
  });

  it('le littéral l’emporte sur le dynamique · sinon « Nouvelle marque » serait une marque', () => {
    expect(matchRoute('/brands/new')?.label).toBe('Nouvelle marque');
  });

  it('rend null sur un chemin inconnu plutôt que de deviner', () => {
    expect(matchRoute('/nexistepas')).toBeNull();
    expect(matchRoute('/adsmap/inconnu')).toBeNull();
  });

  it('ne confond pas deux profondeurs', () => {
    expect(matchRoute('/brands/abc/competitors/nike')?.path).toBe('/brands/[id]/competitors/[name]');
  });

  it('expose le libellé d’un écran', () => {
    expect(matchRoute('/adsmap/radar')?.label).toBe('Radar de veille');
    expect(matchRoute('/radar')?.label).toBe('Radar créatif');
  });
});

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
