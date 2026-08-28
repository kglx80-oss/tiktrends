import { describe, it, expect } from 'vitest';
import { parseNaming, slugToken, buildName, buildUniqueNames } from '../src/naming';

describe('naming parser (§F2)', () => {
  it('extrait les dimensions', () => {
    const dims = parseNaming('acme_ugc_problem_v3', '{client}_{format}_{angle}_{v}');
    expect(dims).toEqual({ client: 'acme', format: 'ugc', angle: 'problem', v: 'v3' });
  });
  it('retourne null si le nom ne correspond pas', () => {
    expect(parseNaming('nope', '{client}_{format}')).toBeNull();
  });
});

describe('slugToken', () => {
  it('retire les accents et remplace le reste par des tirets', () => {
    expect(slugToken('Désir immédiat · gain')).toBe('Desir-immediat-gain');
  });

  it('ne laisse jamais passer un underscore', () => {
    // Le parser coupe les jetons sur l'underscore · un seul suffirait à rendre
    // le nom illisible, et l'ad invisible à la mesure quotidienne.
    expect(slugToken('avant_apres')).toBe('avant-apres');
  });

  it('coupe sur un tiret plutôt qu’au milieu d’un mot', () => {
    expect(slugToken('accroche chiffree pour maman debordee', 20)).toBe('accroche-chiffree');
  });

  it('tronque net quand aucun tiret ne tombe assez loin', () => {
    expect(slugToken('abcdefghijklmnopqrstuvwxyz', 10)).toBe('abcdefghij');
  });

  it('rend « x » plutôt que du vide', () => {
    expect(slugToken('   ·  ')).toBe('x');
    expect(slugToken('')).toBe('x');
  });
});

describe('buildName', () => {
  const motif = '{brand}_B{batch}_{concept}_{variant}_{variable}';

  it('compose le nom attendu', () => {
    expect(buildName(motif, { brand: 'TrueFords', batch: 12, concept: 'Listicle 3 erreurs', variant: 'v2', variable: 'hook' }))
      .toBe('TrueFords_B12_Listicle-3-erreurs_v2_hook');
  });

  it('se relit par parseNaming · c’est tout l’enjeu', () => {
    // Le rattachement quotidien des métriques dépend de cet aller-retour.
    const nom = buildName(motif, { brand: 'Marque à accents', batch: 3, concept: 'Avant / après', variant: 'v1', variable: 'opening_visual' });
    const relu = parseNaming(nom, motif);
    expect(relu).not.toBeNull();
    expect(relu!.batch).toBe('3');
    expect(relu!.variant).toBe('v1');
    expect(relu!.concept).toBe('Avant-apres');
  });

  it('remplace un jeton vide par « x » au lieu de le faire disparaître', () => {
    // Un trou décalerait tous les jetons suivants à la relecture.
    const nom = buildName(motif, { brand: 'M', batch: 1, concept: '', variant: 'v1', variable: null });
    expect(nom).toBe('M_B1_x_v1_x');
    expect(parseNaming(nom, motif)).not.toBeNull();
  });
});

describe('buildUniqueNames', () => {
  const motif = '{brand}_B{batch}_{concept}_{variant}_{variable}';

  it('laisse les noms déjà distincts intacts', () => {
    const noms = buildUniqueNames(motif, [
      { brand: 'M', batch: 1, concept: 'A', variant: 'v1', variable: 'hook' },
      { brand: 'M', batch: 1, concept: 'B', variant: 'v1', variable: 'hook' },
    ]);
    expect(noms).toEqual(['M_B1_A_v1_hook', 'M_B1_B_v1_hook']);
  });

  it('départage deux concepts de même titre sous deux angles', () => {
    // Cas réel du fichier TrueFords · deux concepts distincts en base, même
    // titre, donc même nom généré. Les deux ads resteraient sans mesure.
    const noms = buildUniqueNames(motif, [
      { brand: 'M', batch: 3, concept: '3 reasons why', variant: 'v1', variable: 'controle' },
      { brand: 'M', batch: 3, concept: '3 reasons why', variant: 'v1', variable: 'controle' },
    ]);
    expect(new Set(noms).size).toBe(2);
    expect(noms[1]).toContain('3-reasons-why-2');
  });

  it('reste relisible par le parser après désambiguïsation', () => {
    const noms = buildUniqueNames(motif, [
      { brand: 'M', batch: 3, concept: 'Même titre', variant: 'v1', variable: 'hook' },
      { brand: 'M', batch: 3, concept: 'Même titre', variant: 'v1', variable: 'hook' },
      { brand: 'M', batch: 3, concept: 'Même titre', variant: 'v1', variable: 'hook' },
    ]);
    expect(new Set(noms).size).toBe(3);
    for (const n of noms) expect(parseNaming(n, motif)).not.toBeNull();
  });

  it('est déterministe · le même ordre donne les mêmes noms', () => {
    const rows = [
      { brand: 'M', batch: 1, concept: 'X', variant: 'v1', variable: 'hook' },
      { brand: 'M', batch: 1, concept: 'X', variant: 'v1', variable: 'hook' },
    ];
    expect(buildUniqueNames(motif, rows)).toEqual(buildUniqueNames(motif, rows));
  });
});
