import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Modal } from '../components/Modal';

/**
 * Le clavier et les lecteurs d'écran comptent · on le vérifie, on ne l'espère pas.
 *
 * Trois défauts d'accessibilité silencieux : le focus clavier rendu invisible
 * par des `outline: none` inline ; des fenêtres sans sémantique `dialog` ni
 * piège à focus (le Tab s'échappe derrière) ; des contrôles sans nom accessible.
 */

describe('la fenêtre modale est une vraie boîte de dialogue', () => {
  const html = renderToStaticMarkup(
    <Modal open onClose={() => {}} title="Confirmer la suppression">corps</Modal>,
  );

  it('porte le rôle et les attributs ARIA d’un dialog', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Confirmer la suppression"');
  });

  it('reste focalisable pour y porter le focus à l’ouverture', () => {
    expect(html).toContain('tabindex="-1"');
  });

  it('offre une fermeture étiquetée', () => {
    expect(html).toContain('aria-label="Fermer"');
  });
});

describe('le focus clavier est visible partout', () => {
  const css = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8');

  it('un :focus-visible en !important reprend la main sur les outline:none inline', () => {
    // `!important` est le SEUL moyen pour une feuille de style de battre un style
    // inline · sans lui, les dizaines d'`outline:none` inline gagnent au clavier.
    expect(css).toMatch(/:focus-visible\s*\{[^}]*outline:[^;]*!important/);
  });

  it('les animations se coupent quand l’utilisateur les a réduites', () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});

describe('le piège à focus et la restitution existent', () => {
  const modal = readFileSync(join(process.cwd(), 'components/Modal.tsx'), 'utf8');

  it('le Tab ne s’échappe pas derrière la fenêtre', () => {
    expect(modal).toMatch(/e\.key === 'Tab'/);
  });

  it('le focus est rendu à l’élément d’origine à la fermeture', () => {
    expect(modal).toMatch(/rendreA\?\.focus/);
  });
});

describe('la palette de commandes est aussi un dialog nommé', () => {
  const cmd = readFileSync(join(process.cwd(), 'components/CommandPalette.tsx'), 'utf8');

  it('porte role=dialog et aria-modal', () => {
    expect(cmd).toMatch(/role="dialog"/);
    expect(cmd).toMatch(/aria-modal="true"/);
  });

  it('son champ de recherche a un nom accessible', () => {
    expect(cmd).toMatch(/aria-label="Rechercher/);
  });
});
