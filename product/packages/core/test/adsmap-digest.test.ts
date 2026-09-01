import { describe, it, expect } from 'vitest';
import { buildDigest, worthSending, digestText, MAX_LINES, type DigestFacts } from '../src/adsmap/digest';

const faits = (o: Partial<DigestFacts> = {}): DigestFacts => ({
  brandName: 'Klorea',
  verdictsWeek: 0, winnersWeek: 0, createdWeek: 0, pending: 0,
  radarFindings: 0, radarUnexplored: 0, newlyConclusive: [], iterationsReady: 0,
  ...o,
});

describe('on n’envoie pas une lettre pour dire qu’il n’y a rien', () => {
  /**
   * Trois semaines de « rien de neuf » et plus personne ne l'ouvre · le jour où
   * elle porte quelque chose, elle est déjà morte.
   */
  it('une semaine vide ne part pas', () => {
    expect(worthSending(faits())).toBe(false);
  });

  it('un verdict suffit', () => {
    expect(worthSending(faits({ verdictsWeek: 1 }))).toBe(true);
  });

  it('une trouvaille du radar suffit', () => {
    expect(worthSending(faits({ radarFindings: 1 }))).toBe(true);
  });

  it('une dimension qui vient de trancher suffit', () => {
    expect(worthSending(faits({ newlyConclusive: ['listicle'] }))).toBe(true);
  });

  /**
   * « Rien appris » et « rien à faire » sont deux choses différentes · une
   * marque avec un stock non jugé n'a rien appris ET a tout à faire.
   */
  it('un stock qui dort part, même sans rien de neuf', () => {
    expect(worthSending(faits({ pending: 12 }))).toBe(true);
  });

  it('une créa ou deux en attente ne réveillent personne', () => {
    expect(worthSending(faits({ pending: 2 }))).toBe(false);
  });

  it('produire beaucoup sans rien trancher ne suffit pas · c’est le stock qui parle', () => {
    expect(worthSending(faits({ createdWeek: 20, pending: 0 }))).toBe(false);
  });
});

describe('l’accroche porte le fait le plus lourd', () => {
  it('un gagnant passe devant tout', () => {
    const d = buildDigest(faits({ verdictsWeek: 4, winnersWeek: 2, radarUnexplored: 9 }));
    expect(d.headline).toContain('2 gagnante(s)');
  });

  it('sans gagnant, la mémoire qui tranche passe devant les tests perdus', () => {
    const d = buildDigest(faits({ newlyConclusive: ['listicle'], verdictsWeek: 3, winnersWeek: 0 }));
    expect(d.headline).toContain('listicle');
  });

  it('des tests tranchés sans gagnant ne sont pas présentés comme un échec', () => {
    const d = buildDigest(faits({ verdictsWeek: 3, winnersWeek: 0 }));
    expect(d.headline).toContain('c\'est une information, pas un échec');
  });

  it('le marché informe, il ne tranche pas · il vient en dernier', () => {
    const d = buildDigest(faits({ radarFindings: 4 }));
    expect(d.headline).toContain('confirment ce que tu fais déjà');
  });
});

describe('chaque ligne vient d’un compte, et aucune ne dit zéro', () => {
  it('une ligne dont le compte est nul n’existe pas', () => {
    const d = buildDigest(faits({ verdictsWeek: 2, winnersWeek: 1 }));
    expect(d.lines.join(' ')).not.toContain('0 créa');
    expect(d.lines.join(' ')).not.toContain('Radar');
  });

  it('le taux affiché découle des deux comptes, il n’est pas inventé', () => {
    const d = buildDigest(faits({ verdictsWeek: 4, winnersWeek: 1 }));
    expect(d.lines.join(' ')).toContain('25 %');
  });

  it('jamais plus de quatre lignes · au-delà c’est un tableau de bord', () => {
    const d = buildDigest(faits({
      createdWeek: 9, verdictsWeek: 5, winnersWeek: 2, pending: 7,
      radarFindings: 3, radarUnexplored: 1,
    }));
    expect(d.lines.length).toBeLessThanOrEqual(MAX_LINES);
  });

  it('le radar dit quand ses trouvailles ne sont que des confirmations', () => {
    const d = buildDigest(faits({ radarFindings: 3, radarUnexplored: 0 }));
    expect(d.lines.join(' ')).toContain('déjà connues');
  });
});

describe('un seul geste, et c’est la boucle du produit qui le choisit', () => {
  /**
   * L'ordre n'est pas un goût · on ne fabrique pas avant d'avoir tranché, et on
   * ne tranche pas ce qui n'existe pas.
   */
  it('trancher passe avant itérer', () => {
    const d = buildDigest(faits({ pending: 9, iterationsReady: 4 }));
    expect(d.action?.key).toBe('lots');
  });

  it('itérer passe avant le radar', () => {
    const d = buildDigest(faits({ iterationsReady: 2, radarUnexplored: 5 }));
    expect(d.action?.key).toBe('suites');
  });

  it('le radar passe après les suites, mais avant la mémoire', () => {
    expect(buildDigest(faits({ radarUnexplored: 1, newlyConclusive: ['ugc'] })).action?.key).toBe('radar');
  });

  it('la mémoire qui s’allume passe avant le studio', () => {
    expect(buildDigest(faits({ newlyConclusive: ['ugc'] })).action?.key).toBe('jarvis');
  });

  it('sans rien produit ni rien en attente, on conseille de fabriquer', () => {
    const d = buildDigest(faits({ radarFindings: 2 }));
    expect(d.action?.key).toBe('studio');
  });

  it('le geste dit POURQUOI, avec le chiffre qui le porte', () => {
    const d = buildDigest(faits({ pending: 9 }));
    expect(d.action?.why).toContain('9');
  });

  it('il n’y a jamais deux gestes', () => {
    const d = buildDigest(faits({ pending: 9, iterationsReady: 4, radarUnexplored: 3 }));
    expect(d.action).not.toBeNull();
    expect(Array.isArray(d.action)).toBe(false);
  });

  it('une semaine calme avec du stock modeste ne conseille rien plutôt que n’importe quoi', () => {
    const d = buildDigest(faits({ createdWeek: 1, pending: 1 }));
    expect(d.action).toBeNull();
  });
});

describe('le rendu texte sert le courriel comme la notification', () => {
  it('il porte l’accroche, les lignes et le geste', () => {
    const t = digestText(buildDigest(faits({ verdictsWeek: 2, winnersWeek: 1, pending: 6 })));
    expect(t).toContain('1 gagnante(s)');
    expect(t).toContain('6 créa(s) attendent');
    expect(t).toContain('→ Faire trancher');
  });

  it('sans geste, il ne laisse pas de flèche orpheline', () => {
    const t = digestText(buildDigest(faits({ createdWeek: 1, pending: 1 })));
    expect(t).not.toContain('→');
  });
});
