import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { AssistantChat } from '../components/AssistantChat';

/**
 * CDC v7 · N08 · navigation mobile et formulaire assistant.
 *
 * À 360 px, le tiroir s'ouvrait mais Escape ne le fermait pas, son état n'était
 * pas annoncé, le focus restait au déclencheur ; le champ assistant n'avait pas
 * de libellé associé ; les liens actifs n'exposaient pas aria-current ; des
 * boutons ne se nommaient que « Déplier ».
 *
 * Le champ assistant se REND et se lit dans le HTML. La navigation (AppShell)
 * dépend du routeur pour se rendre · on tient son contrat par une garde de
 * source, comme les autres gardes du rail (rail-actif, rail-replie).
 */

describe('N08 · le champ assistant a un libellé PERSISTANT associé', () => {
  const html = renderToStaticMarkup(<AssistantChat ready />);

  it('un label est lié au champ (htmlFor ↔ id), pas un simple placeholder', () => {
    const idMatch = html.match(/<input[^>]*\sid="([^"]+)"/);
    expect(idMatch, 'le champ n’a pas d’id à associer').toBeTruthy();
    const id = idMatch![1];
    expect(html, 'aucun label n’est lié au champ').toContain(`for="${id}"`);
    expect(html).toContain('Ta question à l’assistant');
  });

  it('le champ ne coupe pas son anneau de focus au clavier', () => {
    expect(html, 'le champ supprime son indicateur de focus').not.toContain('outline:none');
  });
});

describe('N08 · le contrat de navigation mobile (garde de source)', () => {
  const shell = readFileSync(join(process.cwd(), 'components/AppShell.tsx'), 'utf8');

  it('le lien actif expose aria-current="page", pas seulement une teinte', () => {
    expect(shell).toMatch(/aria-current=\{active \? 'page' : undefined\}/);
  });

  it('les dépliants de section sont NOMMÉS (Déplier + le module), pas « Déplier » seul', () => {
    expect(shell).toMatch(/aria-label=\{`\$\{open \? 'Replier' : 'Déplier'\} \$\{b\.head\.label\}`\}/);
  });

  it('le déclencheur du tiroir annonce son état et sa cible', () => {
    expect(shell, 'le hamburger n’annonce pas ouvert/fermé').toMatch(/aria-expanded=\{drawer\}/);
    expect(shell, 'le hamburger ne pointe pas le panneau').toContain('aria-controls="nav-rail"');
    expect(shell, 'le tiroir n’a pas d’identifiant de panneau').toContain('id="nav-rail"');
  });

  it('Escape ferme le tiroir et rend le focus au déclencheur', () => {
    expect(shell, 'pas de gestion d’Escape sur le tiroir').toMatch(/e\.key === 'Escape'\) fermerTiroir\(\)/);
    expect(shell, 'la fermeture ne rend pas le focus au déclencheur').toMatch(/setDrawer\(false\); burgerRef\.current\?\.focus\(\)/);
    expect(shell, 'le focus n’entre pas dans le panneau à l’ouverture').toMatch(/railRef\.current\?\.querySelector<HTMLElement>\('a,button'\)\?\.focus\(\)/);
  });

  it('le tiroir mobile est une fenêtre modale nommée', () => {
    expect(shell).toMatch(/role: 'dialog' as const, 'aria-modal': true, 'aria-label': 'Navigation'/);
  });
});
