import { describe, it, expect } from 'vitest';
import { journey, whyBlocked, STEPS } from '../src/onboarding';

const fait = (...cles: string[]) => new Set(cles);

describe('le chemin est un graphe, pas une liste', () => {
  it('chaque dépendance déclarée existe', () => {
    const cles = new Set(STEPS.map((s) => s.key));
    const perdues = STEPS.flatMap((s) => s.needs).filter((n) => !cles.has(n));
    expect(perdues).toEqual([]);
  });

  it('aucun cycle · une étape ne peut pas dépendre d’elle-même par un détour', () => {
    const parCle = new Map(STEPS.map((s) => [s.key, s]));
    for (const dep of STEPS) {
      const vus = new Set<string>();
      const pile = [...dep.needs];
      while (pile.length) {
        const k = pile.pop()!;
        expect(k, `cycle via ${dep.key}`).not.toBe(dep.key);
        if (vus.has(k)) continue;
        vus.add(k);
        pile.push(...(parCle.get(k)?.needs ?? []));
      }
    }
  });

  it('sur un compte vierge, une seule étape est ouverte', () => {
    const j = journey(fait());
    const ouvertes = j.steps.filter((s) => s.status === 'now' && !s.optional);
    expect(ouvertes).toHaveLength(1);
    expect(ouvertes[0]!.key).toBe('brand');
  });

  it('les autres sont bloquées, et disent PAR QUOI', () => {
    const j = journey(fait());
    const meta = j.steps.find((s) => s.key === 'meta')!;
    expect(meta.status).toBe('blocked');
    expect(meta.blockedBy).toBeTruthy();
  });
});

describe('Meta se connecte APRÈS le premier lot', () => {
  it('reste bloqué tant qu’il n’y a rien à mesurer', () => {
    const j = journey(fait('brand', 'identity', 'generate', 'map'));
    expect(j.steps.find((s) => s.key === 'meta')!.status).toBe('blocked');
  });

  it('s’ouvre dès que le lot existe', () => {
    const j = journey(fait('brand', 'identity', 'generate', 'map', 'batch'));
    expect(j.steps.find((s) => s.key === 'meta')!.status).toBe('now');
  });

  it('la raison affichée parle de ce que ça débloque, pas de ce que ça demande', () => {
    const meta = STEPS.find((s) => s.key === 'meta')!;
    expect(meta.why).toContain('ne sert à rien');
  });
});

describe('une seule prochaine action', () => {
  it('la première étape bloquante ouverte, jamais une facultative', () => {
    // « brand » ouvre à la fois `identity` et les facultatives · c'est le cas
    // où l'on risquerait d'envoyer quelqu'un régler un détail.
    const j = journey(fait('brand'));
    expect(j.next!.key).toBe('identity');
    expect(j.next!.optional).toBeFalsy();
  });

  it('avance au fur et à mesure', () => {
    expect(journey(fait()).next!.key).toBe('brand');
    expect(journey(fait('brand', 'identity')).next!.key).toBe('generate');
    expect(journey(fait('brand', 'identity', 'generate')).next!.key).toBe('map');
  });

  it('null quand le chemin bloquant est terminé', () => {
    const tout = fait('brand', 'identity', 'generate', 'map', 'batch', 'meta', 'verdict', 'memory');
    const j = journey(tout);
    expect(j.next).toBeNull();
    expect(j.complete).toBe(true);
  });

  it('les facultatives ne comptent pas dans la progression', () => {
    const j = journey(fait('brand', 'prompt', 'competitors'));
    expect(j.doneCount).toBe(1);
    expect(j.totalRequired).toBe(STEPS.filter((s) => !s.optional).length);
  });

  it('une facultative faite ne suffit pas à terminer le parcours', () => {
    expect(journey(fait('prompt', 'competitors')).complete).toBe(false);
  });
});

describe('le résumé dit où l’on en est', () => {
  it('sur un compte vierge, il annonce la distance', () => {
    expect(journey(fait()).summary).toContain('Huit étapes');
  });

  it('en cours, il nomme ce qui reste et pourquoi', () => {
    expect(journey(fait('brand', 'identity')).summary).toContain('Jarvis apprenne');
  });

  it('terminé, il décrit le circuit plutôt que de féliciter', () => {
    const tout = fait('brand', 'identity', 'generate', 'map', 'batch', 'meta', 'verdict', 'memory');
    expect(journey(tout).summary).toContain('circuit complet');
  });
});

describe('pourquoi une étape est bloquée', () => {
  it('remonte toute la chaîne manquante', () => {
    const m = whyBlocked('memory', fait());
    expect(m).toContain('Créer ta marque');
    expect(m).toContain('Ouvrir un lot de test');
    expect(m).toContain('Connecter Meta');
  });

  it('dans l’ordre où on les fera', () => {
    const m = whyBlocked('meta', fait());
    expect(m[0]).toBe('Créer ta marque');
    expect(m[m.length - 1]).toBe('Ouvrir un lot de test');
  });

  it('n’énumère pas ce qui est déjà fait', () => {
    const m = whyBlocked('meta', fait('brand', 'map'));
    expect(m).not.toContain('Créer ta marque');
    expect(m).toContain('Ouvrir un lot de test');
  });

  it('rien à dire quand l’étape est ouverte', () => {
    expect(whyBlocked('brand', fait())).toEqual([]);
  });

  it('rien à dire sur une clé inconnue plutôt que de deviner', () => {
    expect(whyBlocked('nexistepas', fait())).toEqual([]);
  });
});
