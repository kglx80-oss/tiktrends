import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ToastProvider, ToastLigne } from '../components/Toast';

/**
 * Le retour AFFICHE quelque chose, et l'affiche accessible · pas seulement « un
 * canal existe ». Même leçon que assistant-rendu : on lit le HTML rendu, pas la
 * présence d'un appel. (Le setup de test est du SSR statique · on vérifie donc
 * ce qui se rend, la région live et une ligne de toast, sans simuler le clic.)
 */

describe('la pile de toasts est une région live polie', () => {
  const html = renderToStaticMarkup(<ToastProvider><div /></ToastProvider>);

  it('annonce sans voler le focus', () => {
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });
});

describe('un toast montre son message et peut se fermer', () => {
  const html = renderToStaticMarkup(
    <ToastLigne t={{ id: 1, message: 'Synchro lancée', kind: 'ok' }} onClose={() => {}} />,
  );

  it('affiche le message, pas seulement le stocke', () => {
    expect(html).toContain('Synchro lancée');
  });

  it('offre une fermeture étiquetée pour le clavier et les lecteurs d’écran', () => {
    expect(html).toContain('aria-label="Fermer"');
  });
});

describe('le ton se lit dans le rendu, pas seulement dans les props', () => {
  const ok = renderToStaticMarkup(<ToastLigne t={{ id: 1, message: 'Fait', kind: 'ok' }} onClose={() => {}} />);
  const err = renderToStaticMarkup(<ToastLigne t={{ id: 2, message: 'Raté', kind: 'err' }} onClose={() => {}} />);

  it('succès et erreur ne rendent pas le même glyphe', () => {
    expect(ok).toContain('✓');
    expect(err).toContain('!');
    expect(ok).not.toEqual(err);
  });
});

describe('le fournisseur est monté au-dessus de l’app · sinon useToast jette', () => {
  // Un canal déclaré mais non monté est pire qu'absent · les composants
  // l'appelleraient et planteraient. Le layout applicatif DOIT l'enrober.
  const layout = readFileSync(join(process.cwd(), 'app/(app)/layout.tsx'), 'utf8');
  it('le layout (app) enrobe ses enfants dans ToastProvider', () => {
    expect(layout).toMatch(/import \{ ToastProvider \}/);
    expect(layout).toMatch(/<ToastProvider>[\s\S]*\{children\}[\s\S]*<\/ToastProvider>/);
  });
});
