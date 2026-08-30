import { describe, it, expect } from 'vitest';
import {
  chatSystemPrompt, trimThread, starters, MAX_TOURS, MAX_CARS_MESSAGE,
  type ChatContext, type ChatMessage,
} from '../src/adsmap/jarvis-chat';

const ctx = (o: Partial<ChatContext> = {}): ChatContext => ({
  brandName: 'TrueFords', memory: '', measuredAds: 0, canAdsmap: true, ...o,
});

describe('la consigne dit ce que Jarvis a le droit d’affirmer', () => {
  it('pose la règle qui prime · citer ou admettre', () => {
    const p = chatSystemPrompt(ctx());
    expect(p).toContain('ou tu admets que tu n’en as pas');
    expect(p).toContain('N’invente JAMAIS');
  });

  it('interdit nommément le conseil de blog', () => {
    const p = chatSystemPrompt(ctx());
    expect(p).toContain('article de blog');
    expect(p).toContain('3 premières secondes');
  });

  it('autorise explicitement la contradiction', () => {
    const p = chatSystemPrompt(ctx());
    expect(p).toContain('commence par la contradiction');
    expect(p).toContain('Pas de flatterie');
  });

  it('sépare le mesuré du marché · une part d’usage n’est pas un taux', () => {
    const p = chatSystemPrompt(ctx());
    expect(p).toContain('jamais un taux de réussite');
  });

  it('porte le nom de la marque', () => {
    expect(chatSystemPrompt(ctx())).toContain('TrueFords');
  });
});

describe('une mémoire vide se dit, elle ne se comble pas', () => {
  it('l’annonce explicitement quand rien n’est mesuré', () => {
    const p = chatSystemPrompt(ctx());
    expect(p).toContain('AUCUN chiffre');
    expect(p).toContain('Ne compense pas par des généralités');
  });

  it('injecte la mémoire quand elle existe', () => {
    const p = chatSystemPrompt(ctx({ memory: 'listicle : 3/8 concluantes', measuredAds: 20 }));
    expect(p).toContain('listicle : 3/8');
    expect(p).not.toContain('AUCUN chiffre');
  });

  it('borne la mémoire · on ne paie pas pour ce qui ne sera pas lu', () => {
    const p = chatSystemPrompt(ctx({ memory: 'x'.repeat(30000), measuredAds: 50 }));
    expect(p.length).toBeLessThan(16000);
  });
});

describe('la prudence suit ce qui a réellement été mesuré', () => {
  it('sans test, rien ne peut être affirmé', () => {
    expect(chatSystemPrompt(ctx({ measuredAds: 0 }))).toContain('Aucun test mesuré');
  });

  it('peu de tests · tendances, jamais règles', () => {
    const p = chatSystemPrompt(ctx({ measuredAds: 6, memory: 'x' }));
    expect(p).toContain('6 test(s) mesuré(s) seulement');
    expect(p).toContain('jamais de règles');
  });

  it('assez de tests · on peut être affirmatif, avec l’effectif', () => {
    const p = chatSystemPrompt(ctx({ measuredAds: 120, memory: 'x' }));
    expect(p).toContain('120 tests mesurés');
    expect(p).toContain('affirmatif');
  });

  it('le seuil intermédiaire existe et se distingue', () => {
    const p = chatSystemPrompt(ctx({ measuredAds: 25, memory: 'x' }));
    expect(p).toContain('tendances solides');
  });
});

describe('les règles maison priment, et passent en dernier', () => {
  it('sont injectées quand elles existent', () => {
    const p = chatSystemPrompt(ctx({ rules: 'Jamais de compte à rebours.' }));
    expect(p).toContain('Jamais de compte à rebours.');
    expect(p).toContain('elles priment sur tes préférences');
  });

  it('ferment la consigne · un modèle retient mieux la fin', () => {
    const p = chatSystemPrompt(ctx({ rules: 'REGLE_MAISON_UNIQUE', memory: 'MEMOIRE_ICI', measuredAds: 12 }));
    expect(p.indexOf('REGLE_MAISON_UNIQUE')).toBeGreaterThan(p.indexOf('MEMOIRE_ICI'));
  });

  it('rien n’est ajouté quand il n’y a pas de règle', () => {
    expect(chatSystemPrompt(ctx())).not.toContain('RÈGLES MAISON');
  });
});

describe('les écrans ne sont nommés que s’ils sont accessibles', () => {
  it('cités quand ADSMAP est ouvert', () => {
    const p = chatSystemPrompt(ctx({ canAdsmap: true }));
    expect(p).toContain('Suites ·');
    expect(p).toContain('Radar ·');
  });

  it('tus quand il ne l’est pas · envoyer vers une porte fermée est pire que se taire', () => {
    expect(chatSystemPrompt(ctx({ canAdsmap: false }))).not.toContain('OÙ ENVOYER');
  });
});

describe('le fil envoyé au modèle', () => {
  const m = (role: ChatMessage['role'], content: string): ChatMessage => ({ role, content });

  it('garde la FIN, pas le début · c’est elle qui porte le sujet', () => {
    const longue = Array.from({ length: MAX_TOURS + 10 }, (_, i) =>
      m(i % 2 === 0 ? 'user' : 'assistant', `msg${i}`));
    const fil = trimThread(longue);
    expect(fil.length).toBeLessThanOrEqual(MAX_TOURS);
    expect(fil[fil.length - 1]!.content).toBe(`msg${MAX_TOURS + 9}`);
  });

  it('commence toujours par un message utilisateur · l’API l’exige', () => {
    const fil = trimThread([m('assistant', 'bonjour'), m('user', 'salut')]);
    expect(fil[0]!.role).toBe('user');
  });

  it('écarte les messages vides', () => {
    expect(trimThread([m('user', '   '), m('user', 'vrai')])).toHaveLength(1);
  });

  it('borne la taille d’un message', () => {
    const fil = trimThread([m('user', 'x'.repeat(MAX_CARS_MESSAGE + 5000))]);
    expect(fil[0]!.content.length).toBe(MAX_CARS_MESSAGE);
  });

  it('un fil entièrement non conforme rend un fil vide plutôt qu’un fil cassé', () => {
    expect(trimThread([m('assistant', 'a'), m('assistant', 'b')])).toEqual([]);
  });
});

describe('les entrées proposées', () => {
  it('sur une marque vierge, elles portent sur le démarrage', () => {
    const s = starters({ measuredAds: 0, hasMarket: false });
    expect(s.join(' ')).toContain('commence');
    expect(s.join(' ')).toContain('hypothèse');
  });

  it('sur une marque mesurée, elles portent sur les chiffres', () => {
    const s = starters({ measuredAds: 30, hasMarket: false });
    expect(s.join(' ')).toContain('sur combien de tests');
  });

  it('le marché n’est proposé que s’il existe', () => {
    expect(starters({ measuredAds: 30, hasMarket: true }).join(' ')).toContain('marché');
    expect(starters({ measuredAds: 30, hasMarket: false }).join(' ')).not.toContain('marché');
  });
});
