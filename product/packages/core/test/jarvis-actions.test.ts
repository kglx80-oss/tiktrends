import { describe, it, expect } from 'vitest';
import {
  parseAnswer, visibleWhileStreaming, actionsPromptBlock,
  JARVIS_ACTIONS, MAX_ACTIONS, MAX_INTENT,
} from '../src/adsmap/jarvis-actions';

describe('le marqueur sort du texte affiché', () => {
  it('retire le marqueur et garde la réponse', () => {
    const r = parseAnswer('Ton listicle gagne 3 fois sur 8.\n\n[[ACTION:suites]]');
    expect(r.text).toBe('Ton listicle gagne 3 fois sur 8.');
    expect(r.actions).toEqual([{ key: 'suites', intent: null }]);
  });

  it('lit l’intention passée à draft', () => {
    const r = parseAnswer('Voilà.\n[[ACTION:draft|Une créa qui ouvre sur le désordre]]');
    expect(r.actions[0]).toEqual({ key: 'draft', intent: 'Une créa qui ouvre sur le désordre' });
    expect(r.text).toBe('Voilà.');
  });

  it('retire un marqueur posé au milieu d’une phrase', () => {
    // Le modèle n'est pas censé le faire · s'il le fait, on ne laisse pas la
    // convention fuir dans le texte lu.
    expect(parseAnswer('Regarde [[ACTION:carte]] la carte.').text).toBe('Regarde  la carte.');
  });

  it('une réponse sans marqueur ne propose rien', () => {
    const r = parseAnswer('Je n’ai aucun chiffre sur cette dimension.');
    expect(r.actions).toEqual([]);
    expect(r.text).toBe('Je n’ai aucun chiffre sur cette dimension.');
  });
});

describe('le vocabulaire est fermé · l’échec par défaut est le silence', () => {
  it('une clé inventée est ignorée ET retirée du texte', () => {
    const r = parseAnswer('Texte. [[ACTION:supprimer_tout]]');
    expect(r.actions).toEqual([]);
    expect(r.text).not.toContain('supprimer_tout');
  });

  it('un marqueur mal formé reste du texte · on ne devine pas', () => {
    const r = parseAnswer('Texte. [[ACTION suites]]');
    expect(r.actions).toEqual([]);
    expect(r.text).toContain('[[ACTION suites]]');
  });

  it('la même action deux fois n’en fait qu’une', () => {
    const r = parseAnswer('a [[ACTION:lots]] b [[ACTION:lots]]');
    expect(r.actions).toHaveLength(1);
  });

  it('au-delà de deux, on a remplacé une réponse par un menu', () => {
    const r = parseAnswer('[[ACTION:lots]][[ACTION:radar]][[ACTION:carte]][[ACTION:studio]]');
    expect(r.actions).toHaveLength(MAX_ACTIONS);
  });

  it('une intention trop longue est coupée, pas refusée', () => {
    const r = parseAnswer(`[[ACTION:draft|${'x'.repeat(500)}]]`);
    expect(r.actions[0]!.intent).toHaveLength(MAX_INTENT);
  });

  it('une intention vide vaut pas d’intention', () => {
    expect(parseAnswer('[[ACTION:draft|   ]]').actions[0]!.intent).toBeNull();
  });
});

describe('rien ne fuit pendant que la réponse s’écrit', () => {
  it('coupe à la première ouverture · « [[ACTI » ne s’affiche pas', () => {
    expect(visibleWhileStreaming('Ma réponse.\n\n[[ACTI')).toBe('Ma réponse.\n\n');
  });

  it('laisse passer un texte sans marqueur', () => {
    expect(visibleWhileStreaming('Ma réponse.')).toBe('Ma réponse.');
  });
});

describe('la consigne dit qu’il n’a rien fait', () => {
  const bloc = actionsPromptBlock();

  it('interdit la fausse confirmation · c’est la règle qui compte', () => {
    expect(bloc).toContain('Tu ne DÉCLENCHES rien');
    expect(bloc).toContain('c’est la personne qui clique');
    expect(bloc).toContain('je viens de créer');
  });

  it('énumère toutes les clés existantes · une clé absente serait inutilisable', () => {
    for (const k of Object.keys(JARVIS_ACTIONS)) expect(bloc).toContain(`- ${k} ·`);
  });

  it('interdit d’en proposer sans raison', () => {
    expect(bloc).toContain('n’a aucun geste à proposer');
  });
});

describe('chaque action dit ce qu’elle fait et ce qu’elle coûte', () => {
  it('une seule action coûte, et elle l’annonce', () => {
    const payantes = Object.values(JARVIS_ACTIONS).filter((a) => a.cost !== null);
    expect(payantes.map((a) => a.key)).toEqual(['draft']);
  });

  it('toute action gratuite mène quelque part · sinon le clic ne fait rien', () => {
    for (const a of Object.values(JARVIS_ACTIONS)) {
      if (a.cost === null) expect(a.href, `${a.key} ne mène nulle part`).toBeTruthy();
    }
  });

  it('chaque action dit son effet avant le clic', () => {
    for (const a of Object.values(JARVIS_ACTIONS)) expect(a.effect.length).toBeGreaterThan(20);
  });
});
