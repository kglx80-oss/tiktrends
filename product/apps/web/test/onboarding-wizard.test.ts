import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * L'accueil en quatre écrans · une question par écran, et le droit de partir.
 *
 * Le wizard dépend du routeur (`useRouter`) pour se rendre · on tient son
 * contrat par une garde de SOURCE, comme les autres écrans routeur-dépendants
 * (n08 · AppShell). On vérifie les exigences du parcours, chacune mutable :
 * retirer « Passer » ou le renvoi vers /jarvis fait tomber la garde.
 */
const src = readFileSync(join(process.cwd(), 'app/onboarding/OnboardingWizard.tsx'), 'utf8');

describe('Accueil · quatre écrans, progression, Retour, Passer, fin → Jarvis', () => {
  it('quatre écrans · une question par écran (usage, pub, objectif, marque)', () => {
    expect(src).toMatch(/const TOTAL = 4/);
    expect(src).toContain('step === 0'); // usage / profil
    expect(src).toContain('step === 1'); // expérience publicitaire
    expect(src).toContain('step === 2'); // objectif
    expect(src).toContain('step === 3'); // marque
  });

  it('l’écran 2 porte la question sur la PUBLICITÉ, pas l’IA', () => {
    expect(src).toContain('Où en es-tu avec la publicité ?');
    expect(src, 'l’ancienne question IA ne doit plus être là').not.toContain("Où en es-tu avec l'IA");
  });

  it('la progression est dite en toutes lettres · X/4', () => {
    expect(src).toMatch(/Étape \{step \+ 1\}\/\{TOTAL\}/);
  });

  it('Retour revient d’un écran', () => {
    expect(src).toMatch(/setStep\(\(n\) => n - 1\)/);
    expect(src).toContain('Retour');
  });

  it('Passer est toujours accessible et ouvre Jarvis sans finir', () => {
    expect(src).toContain('Passer');
    expect(src).toMatch(/async function passer\(\)/);
    // Il enregistre ce qui a été répondu (marque le compte onboardé) puis ouvre Jarvis.
    expect(src).toMatch(/async function passer\(\)[\s\S]*saveOnboardingAction\([\s\S]*router\.push\('\/jarvis'\)/);
  });

  it('la fin ouvre Jarvis (orienté par l’objectif), pas le tableau de bord', () => {
    expect(src).toMatch(/async function finish\(\)[\s\S]*router\.push\('\/jarvis'\)/);
    expect(src, 'la fin ne doit plus retomber sur le dashboard').not.toMatch(/router\.push\('\/dashboard'\)/);
  });
});

/**
 * Facultatif et non répété · un compte déjà onboardé n'y retombe pas tout seul,
 * mais peut y revenir sur un clic explicite (« Personnaliser Jarvis »).
 */
describe('Accueil · facultatif, ré-entrée volontaire seulement', () => {
  const page = readFileSync(join(process.cwd(), 'app/onboarding/page.tsx'), 'utf8');
  const jarvis = readFileSync(join(process.cwd(), 'app/(app)/jarvis/page.tsx'), 'utf8');

  it('un compte onboardé n’est renvoyé au dashboard QUE sans reprise demandée', () => {
    // La reprise (?redo) court-circuite la redirection · sans elle, un compte
    // onboardé ne revoit jamais l'accueil.
    expect(page).toMatch(/redo/);
    expect(page).toMatch(/if \(db && !redo\)/);
  });

  it('Jarvis offre la ré-entrée explicite « Personnaliser Jarvis »', () => {
    expect(jarvis).toContain('/onboarding?redo=1');
    expect(jarvis).toContain('Personnaliser Jarvis');
  });
});
