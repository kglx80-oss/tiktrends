import { describe, it, expect } from 'vitest';
import {
  normalizeMechanism, normalizeAwareness, normalizeDesireType,
  labelFingerprint, dedupeByLabel,
  cleanPersonas, cleanDesires, cleanAngles, cleanConcepts,
} from '../src/adsmap/proposal-taxonomy';

describe('normalisation', () => {
  it('accepte la valeur canonique et les variantes de forme', () => {
    expect(normalizeMechanism('problem_agitate')).toBe('problem_agitate');
    expect(normalizeMechanism('Problem Agitate')).toBe('problem_agitate');
    expect(normalizeMechanism('social-proof')).toBe('social_proof');
  });

  it('ramène les synonymes que les modèles produisent', () => {
    expect(normalizeMechanism('testimonial')).toBe('social_proof');
    expect(normalizeMechanism('myth busting')).toBe('reverse');
    expect(normalizeAwareness('aware of solution')).toBe('solution_aware');
    expect(normalizeDesireType('relief')).toBe('pain_relief');
  });

  it('rend null sur l’inconnu', () => {
    expect(normalizeMechanism('poétique')).toBeNull();
    expect(normalizeAwareness('')).toBeNull();
    expect(normalizeDesireType(null)).toBeNull();
  });
});

describe('labelFingerprint', () => {
  it('reconnaît deux écritures du même désir', () => {
    expect(labelFingerprint('Dormir mieux sans somnifère'))
      .toBe(labelFingerprint('Mieux dormir, sans somnifères'));
  });

  it('distingue deux désirs différents', () => {
    expect(labelFingerprint('Dormir mieux')).not.toBe(labelFingerprint('Manger mieux'));
  });

  it('rend une empreinte vide sur un libellé sans substance', () => {
    expect(labelFingerprint('de la et')).toBe('');
  });
});

describe('dedupeByLabel', () => {
  const l = (x: { label: string }) => x.label;

  it('écarte ce qui existe déjà', () => {
    const r = dedupeByLabel([{ label: 'Dormir mieux' }], l, ['mieux dormir']);
    expect(r.kept).toHaveLength(0);
    expect(r.duplicates).toHaveLength(1);
  });

  it('écarte aussi les répétitions internes', () => {
    const r = dedupeByLabel([{ label: 'Dormir mieux' }, { label: 'Mieux dormir' }], l);
    expect(r.kept).toHaveLength(1);
  });

  it('garde ce qui est nouveau', () => {
    const r = dedupeByLabel([{ label: 'Gagner du temps' }], l, ['Dormir mieux']);
    expect(r.kept).toHaveLength(1);
  });
});

describe('cleanPersonas', () => {
  it('écarte un avatar sans douleur ni désir · c’est une fiche vide', () => {
    expect(cleanPersonas([{ name: 'Maman pressée', description: 'x' }])).toHaveLength(0);
  });

  it('écarte un avatar sans nom', () => {
    expect(cleanPersonas([{ pains: ['fatigue'] }])).toHaveLength(0);
  });

  it('garde et borne un avatar complet', () => {
    const [p] = cleanPersonas([{ name: '  Maman pressée  ', pains: ['fatigue', ''], desires: ['calme'] }]);
    expect(p!.name).toBe('Maman pressée');
    expect(p!.pains).toEqual(['fatigue']);
  });
});

describe('cleanAngles', () => {
  it('rejette un angle sans mécanisme reconnu, au lieu de le compléter', () => {
    // Le mécanisme est ce qui rend un angle comparable · sans lui, l'angle n'est
    // pas incomplet, il est intestable.
    const r = cleanAngles([{ label: 'Un angle joli', mechanism: 'poétique' }]);
    expect(r.kept).toHaveLength(0);
    expect(r.rejected).toEqual(['Un angle joli']);
  });

  it('garde un angle dont le mécanisme est un synonyme connu', () => {
    const r = cleanAngles([{ label: 'Ce que disent les clientes', mechanism: 'testimonial' }]);
    expect(r.kept[0]!.mechanism).toBe('social_proof');
  });
});

describe('cleanDesires et cleanConcepts', () => {
  it('laisse type et conscience à null plutôt que de deviner', () => {
    const [d] = cleanDesires([{ label: 'Dormir mieux', type: 'inventé' }]);
    expect(d!.type).toBeNull();
    expect(d!.awareness).toBeNull();
  });

  it('écarte un concept sans accroche ni corps · c’est un titre, pas un concept', () => {
    expect(cleanConcepts([{ title: 'Un concept' }])).toHaveLength(0);
    expect(cleanConcepts([{ title: 'Un concept', hookOptions: ['3 erreurs que tu fais'] }])).toHaveLength(1);
  });
});
