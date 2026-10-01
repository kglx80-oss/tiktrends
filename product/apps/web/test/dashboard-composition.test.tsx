import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { modeProchaineEtape, journey } from '@tiktrends/core';
import { ProchaineEtape } from '../components/ProchaineEtape';
import { ApercuExemple } from '../components/ApercuExemple';

/**
 * Lot Dashboard · l'accueil menait par la CRÉATION (grille des studios en
 * vedette). Le cap veut l'itération d'abord : prochaine étape → analyse → chat
 * → création secondaire → exemple replié. On cloue le RÉSULTAT : la règle pure
 * de composition (mutation), le HTML RENDU des deux blocs neufs, et l'ordre des
 * sections à la source (l'accueil tire des actions serveur, non rendable ici).
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const home = read('components/AssistantHome.tsx');
const page = read('app/(app)/dashboard/page.tsx');
const shell = read('components/AppShell.tsx');

describe('Dashboard · règle de composition (noyau, pure)', () => {
  it('installation SEULEMENT si un parcours existe et n’est pas complet', () => {
    // Mutation : inverser la condition dans le noyau fait tomber ces quatre cas.
    expect(modeProchaineEtape({ parcoursPresent: true, journeyComplete: false })).toBe('installation');
    expect(modeProchaineEtape({ parcoursPresent: true, journeyComplete: true })).toBe('iteration');
    expect(modeProchaineEtape({ parcoursPresent: false, journeyComplete: false })).toBe('iteration');
    expect(modeProchaineEtape({ parcoursPresent: false, journeyComplete: true })).toBe('iteration');
  });
});

describe('Dashboard · la prochaine itération passe DEVANT (HTML rendu)', () => {
  it('sans parcours · « prépare ton itération » avec accès Adsmap + Veille, pas de KPI inventé', () => {
    const h = renderToStaticMarkup(<ProchaineEtape parcours={null} />);
    expect(h).toContain('Prépare ta prochaine itération');
    expect(h, 'l’accès Adsmap manque').toContain('href="/adsmap"');
    expect(h, 'l’accès Veille manque').toContain('href="/veille"');
  });

  it('parcours en cours · le vrai parcours (une prochaine étape), pas la bascule itération', () => {
    const j = journey(new Set(), { canAdmin: true }); // rien fait, admin → non complet, une prochaine étape actionnable
    expect(j.complete).toBe(false);
    const h = renderToStaticMarkup(<ProchaineEtape parcours={{ journey: j, relance: null }} />);
    expect(h, 'le parcours réel n’expose pas sa prochaine étape').toContain('Prochaine étape');
    expect(h, 'une étape d’installation est travestie en itération').not.toContain('Prépare ta prochaine itération');
  });

  // Point 2 · un membre sans droits d'admin, aucune étape actionnable · `next`
  // est null SANS que le parcours soit complet. On énonce un état FACTUEL, on ne
  // propose PAS d'action interdite, et on ne bascule pas en « itération » (qui
  // dirait faussement « apprentissage acquis »).
  it('membre non-admin sans action possible · état factuel, aucune action interdite, jamais « complet »', () => {
    const j = journey(new Set(), { canAdmin: false });
    expect(j.next, 'le préalable du test : aucune action autorisée').toBeNull();
    expect(j.complete, 'le préalable du test : le parcours n’est pas complet').toBe(false);
    const h = renderToStaticMarkup(<ProchaineEtape parcours={{ journey: j, relance: null }} />);
    // Un état factuel est rendu (le bloc « En attente »), le panneau ne disparaît pas.
    expect(h, 'l’état factuel d’attente n’est pas rendu').toContain('En attente');
    expect(h, 'l’état factuel ne nomme pas qui doit agir').toContain('administrateur');
    // Aucune action interdite : le bloc-action (le Link « Prochaine étape ») est absent.
    expect(h, 'une action interdite est proposée (bloc « Prochaine étape »)').not.toContain('Prochaine étape');
    // `next` null n’est pas traité comme « terminé » : ni bascule itération, ni « circuit complet ».
    expect(h, 'absence de next travestie en itération').not.toContain('Prépare ta prochaine itération');
    expect(h, 'absence de next travestie en circuit complet').not.toContain('circuit complet');
  });
});

describe('Dashboard · l’aperçu d’exemple est replié et honnête', () => {
  const rows = [{ platform: 'meta', title: 'Créa démo', fingerprint: 'x1', spend: 120, impressions: 10000, ctr: 0.021, roas: 2.4, grade: 'B', bucket: 'winner' }];
  const h = renderToStaticMarkup(<ApercuExemple rows={rows} />);

  it('replié par défaut · le panneau est masqué', () => {
    // Le contenu existe dans le DOM mais le panneau porte `hidden` (déplié à la demande).
    expect(h).toMatch(/id="[^"]*"[^>]*hidden|hidden[^>]*id="/);
  });

  it('dit « données de démonstration » AVANT ouverture (le libellé)', () => {
    expect(h).toContain('Données de démonstration');
  });

  it('ne laisse pas croire que brancher un compte rend ces fixtures réelles', () => {
    expect(h, 'formulation trompeuse « tant qu’aucun compte »').not.toContain('tant qu’aucun compte');
    expect(h).toContain('démonstration');
  });
});

describe('Dashboard · l’ordre des sections (source)', () => {
  it('prochaine étape → analyse → chat → création → exemple', () => {
    const iEtape = home.indexOf('{prochaineEtape}');
    const iAnalyse = home.indexOf('Analyser &amp; décider');
    const iChat = home.indexOf('<AssistantChat');
    const iCreer = home.indexOf('Créer les variantes de ton test');
    const iExemple = home.indexOf('{exemple}');
    expect(iEtape, 'la prochaine étape n’est pas rendue').toBeGreaterThan(-1);
    expect(iEtape).toBeLessThan(iAnalyse);
    expect(iAnalyse).toBeLessThan(iChat);
    expect(iChat, 'la création n’est pas APRÈS le chat (elle reste dominante)').toBeLessThan(iCreer);
    expect(iCreer).toBeLessThan(iExemple);
  });

  it('la création n’est plus « phare » ni « le cœur de l’outil »', () => {
    expect(home, '« phare » subsiste sur la création').not.toContain('phare');
    expect(home, '« le cœur de l’outil » subsiste sur la création').not.toContain('le cœur de l’outil');
  });

  it('l’en-tête oriente l’itération, pas la création', () => {
    expect(home).toContain('Observe, teste, apprends de chaque itération');
  });

  it('les accès d’analyse sont en grille 3/2/1 (bornée à la largeur dispo)', () => {
    expect(home).toContain('repeat(auto-fill, minmax(min(340px, 100%), 1fr))');
  });
});

describe('Dashboard · shell + page', () => {
  it('le support est ANCRÉ sur /dashboard (réutilise #689), pas une bulle fixe', () => {
    expect(shell).toContain("pathname === '/dashboard'");
    expect(shell).toContain('supportAncre');
  });

  it('la page passe la prochaine étape et l’exemple, bornée à 1200', () => {
    expect(page).toContain('prochaineEtape={<ProchaineEtape');
    expect(page).toContain('exemple={<ApercuExemple');
    expect(page).toMatch(/cadrePage/);
  });

  // Les slots injectés (créés par Dashboard, rendus parmi les enfants mixtes de
  // AssistantHome) portent une `key` · sans elle, React 19 émet en dev un
  // avertissement de clé (le badge « 1 Issue » de Next). Dev-only, sans effet en
  // prod, mais il pollue la console · on cloue la clé pour qu'elle ne régresse pas.
  it('les slots injectés portent une clé (pas d’avertissement de clé React)', () => {
    expect(page, 'le slot prochaineEtape n’a pas de clé').toMatch(/<ProchaineEtape\s+key=/);
    expect(page, 'le slot exemple n’a pas de clé').toMatch(/<ApercuExemple\s+key=/);
  });
});
