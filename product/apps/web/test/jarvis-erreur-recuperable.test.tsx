import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import JarvisError from '../app/(app)/jarvis/error';

/**
 * S01 du cahier des charges · une panne de Jarvis reste RÉCUPÉRABLE. On rend
 * l'enveloppe d'erreur du segment et on lit le HTML · le message rassurant, les
 * trois issues (réessayer, revenir au travail, support) et la référence
 * technique copiable quand elle existe. Le tout est annoncé (role=alert).
 */
const reset = () => {};

describe('Jarvis · l’erreur est récupérable, jamais une impasse', () => {
  it('affiche le message d’indisponibilité et rassure sur les dossiers', () => {
    const html = renderToStaticMarkup(<JarvisError error={new Error('boom')} reset={reset} />);
    expect(html).toContain('Jarvis est momentanément indisponible');
    expect(html).toContain('dossiers restent accessibles');
    expect(html, 'une panne ne doit pas être une impasse muette').toContain('role="alert"');
  });

  it('offre les trois issues · réessayer, Adsmap, support', () => {
    const html = renderToStaticMarkup(<JarvisError error={new Error('boom')} reset={reset} />);
    expect(html).toContain('Réessayer');
    expect(html, 'retour au travail').toContain('href="/adsmap"');
    expect(html, 'joindre le support').toContain('href="/support"');
  });

  it('la référence technique est présente et copiable quand un digest existe', () => {
    const avec = renderToStaticMarkup(<JarvisError error={Object.assign(new Error('x'), { digest: 'ref-123abc' })} reset={reset} />);
    expect(avec).toContain('Référence technique');
    expect(avec).toContain('ref-123abc');
    // Sans digest · on n'invente pas de référence vide.
    const sans = renderToStaticMarkup(<JarvisError error={new Error('x')} reset={reset} />);
    expect(sans).not.toContain('Référence technique');
  });
});
