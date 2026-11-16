import { describe, expect, it } from 'vitest';
import { desechapperHtml, echapperHtml } from '../src';

describe('echapperHtml · les cinq caractères d’un fragment HTML', () => {
  it('& < > " \' deviennent des entités, & d’abord', () => {
    expect(echapperHtml('<a href="x?a=1&b=2">L\'offre</a>')).toBe('&lt;a href=&quot;x?a=1&amp;b=2&quot;&gt;L&#39;offre&lt;/a&gt;');
    expect(echapperHtml('&lt;')).toBe('&amp;lt;');
  });
  it('un texte ordinaire est rendu tel quel · null et nombres', () => {
    expect(echapperHtml('Maison Légitime · Été 2026 👋')).toBe('Maison Légitime · Été 2026 👋');
    expect(echapperHtml(null)).toBe('');
    expect(echapperHtml(undefined)).toBe('');
    expect(echapperHtml(42)).toBe('42');
  });
  it('desechapperHtml est l’inverse exact, en une passe', () => {
    for (const s of ['<a href="x?a=1&b=2">L\'offre</a>', '&lt;', '&amp;amp;', 'rien']) expect(desechapperHtml(echapperHtml(s))).toBe(s);
    expect(desechapperHtml('&amp;lt;')).toBe('&lt;');
  });
});
