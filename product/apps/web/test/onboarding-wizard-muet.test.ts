import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'onboarding ne finit pas en silence.
 *
 * ── Les deux défauts ─────────────────────────────────────────────────────────
 *
 * La dernière étape CRÉE la première marque. Le bouton « Démarrer » était
 * toujours actif : cliquer sans nom marquait le compte onboardé, ne créait
 * AUCUNE marque (l'action exige `brandName || url`), et renvoyait sur un
 * tableau de bord vide · après un écran qui promettait « on la crée pour toi ».
 *
 * Pire, `finish()` naviguait vers /dashboard quoi qu'il arrive · une erreur
 * serveur (ou un throw) laissait le bouton figé sur « Préparation… », sans un
 * mot, et le compte à moitié configuré.
 *
 * ── L'invariant ──────────────────────────────────────────────────────────────
 *
 * Le bouton refuse tant qu'il manque un nom, et il le dit. La navigation
 * n'arrive qu'APRÈS un succès serveur · l'échec est affiché là où l'on clique.
 */
const WIZARD = readFileSync(join(process.cwd(), 'app/onboarding/OnboardingWizard.tsx'), 'utf8');

describe('le bouton « Démarrer » exige un nom de marque', () => {
  it('la condition « peut finir » vient du nom saisi', () => {
    expect(WIZARD).toMatch(/peutFinir\s*=\s*!!brandName\.trim\(\)/);
  });

  it('la condition désactive vraiment le bouton', () => {
    expect(WIZARD).toMatch(/disabled=\{busy \|\| !peutFinir\}/);
  });

  it('et le clic refuse aussi, ceinture et bretelles', () => {
    expect(WIZARD).toMatch(/if \(busy \|\| !peutFinir\) return;/);
  });
});

describe('l’onboarding ne navigue pas sur un échec, et le dit', () => {
  it('l’erreur serveur est captée, pas ignorée', () => {
    expect(WIZARD).toMatch(/if \(r\.error\)\s*\{\s*setErr\(r\.error\)/);
  });

  it('un throw ne laisse pas le bouton figé · il y a un catch qui réarme', () => {
    expect(WIZARD).toMatch(/catch\s*\{[\s\S]*setErr\([\s\S]*setBusy\(false\)/);
  });

  it('la navigation n’arrive qu’APRÈS le contrôle d’erreur', () => {
    const iErr = WIZARD.indexOf('if (r.error)');
    const iNav = WIZARD.indexOf("router.push('/dashboard')");
    expect(iErr).toBeGreaterThan(-1);
    expect(iNav).toBeGreaterThan(iErr);
  });

  it('l’erreur est affichée, pas seulement calculée', () => {
    expect(WIZARD).toMatch(/\{err &&/);
  });
});
