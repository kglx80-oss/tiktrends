import { describe, expect, it } from 'vitest';
import { desechapperHtml, echapperHtml, neutraliserAdresses } from '../src';

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

describe('neutraliserAdresses · un nom qui ressemble à une adresse ne devient pas un lien', () => {
  it('point suivi d’une lettre ou d’un chiffre, et « :// »', () => {
    expect(neutraliserAdresses('piege.com')).toBe('piege.&#8203;com');
    expect(neutraliserAdresses('https://piege.com/x')).toBe('https:&#8203;//piege.&#8203;com/x');
    expect(neutraliserAdresses('www.piege.co.uk')).toBe('www.&#8203;piege.&#8203;co.&#8203;uk');
  });
  it('un nom ordinaire est rendu tel quel · fin de phrase comprise', () => {
    for (const s of ['Maison Ordinaire', 'L&#39;Atelier &amp; Co', 'Fin.', 'A. B']) expect(neutraliserAdresses(s)).toBe(s);
  });
  it('le texte brut garde une espace de largeur nulle, jamais l’entité', () => {
    expect(desechapperHtml(neutraliserAdresses('piege.com'))).toBe('piege.\u200bcom');
  });
});
