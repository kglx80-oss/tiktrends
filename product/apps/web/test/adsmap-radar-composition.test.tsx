import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Lot UI Radar · audit /adsmap/radar. Les actions du fil observer→itérer étaient
 * sous la cible tactile de 44 px · « Demander le concept à Jarvis » (35), le lien
 * « Ouvrir la veille » de l'état vide (14), et dans le brouillon « Poser sur la
 * carte » / « Réécrire ». Et le support flottait (il recouvrait le titre
 * « Aucune trouvaille » à 390) au lieu d'être ancré en pied comme sur les autres
 * écrans Adsmap.
 *
 * On cloue la STRUCTURE à la source · chaque action porte minHeight 44, et le
 * support est ancré sur la route. Aucun moteur / connecteur / métier touché.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const src = read('app/(app)/adsmap/radar/Radar.tsx');
const shell = read('components/AppShell.tsx');

/** Le style qui suit un ancrage porte-t-il la cible tactile ? (fenêtre bornée) */
const cibleAutour = (anchor: string, avant = 160, apres = 40) => {
  const i = src.indexOf(anchor);
  expect(i, `ancrage introuvable : ${anchor}`).toBeGreaterThan(-1);
  return src.slice(Math.max(0, i - avant), i + apres);
};

describe('Radar · les actions du fil observer→itérer portent la cible tactile 44 (source)', () => {
  it('« Demander le concept à Jarvis » (action itérer d’une trouvaille) ≥44', () => {
    // Bouton fantôme, couleur --ink, padding 7px 14px · rendait 35 px sans minHeight.
    const style = cibleAutour("color: 'var(--ink)', fontWeight: 700, fontSize: 12.5, cursor: redige");
    expect(style, 'le bouton « Demander le concept » sous la cible tactile').toContain('minHeight: CIBLE_TACTILE_MIN');
  });

  it('« Ouvrir la veille » (sortie de l’état sans concurrent suivi) ≥44', () => {
    const style = cibleAutour('Ouvrir la veille ›</a>', 240, 0);
    expect(style, 'le lien « Ouvrir la veille » sous la cible tactile').toContain('minHeight: CIBLE_TACTILE_MIN');
  });

  it('brouillon · « Poser sur la carte » ≥44', () => {
    const style = cibleAutour("padding: '8px 16px', borderRadius: 999, border: 'none'");
    expect(style, 'le bouton « Poser sur la carte » sous la cible tactile').toContain('minHeight: CIBLE_TACTILE_MIN');
  });

  it('brouillon · « Réécrire » ≥44', () => {
    const style = cibleAutour("color: 'var(--ink-2)', fontWeight: 700");
    expect(style, 'le bouton « Réécrire » sous la cible tactile').toContain('minHeight: CIBLE_TACTILE_MIN');
  });

  it('l’interrupteur et « Passer maintenant » gardent déjà leur cible (non-régression)', () => {
    // Ces deux-là étaient déjà à 44 · on vérifie qu’on ne les a pas cassés.
    expect((src.match(/minHeight: CIBLE_TACTILE_MIN/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });
});

describe('Radar · « Armer » désactivé LIT comme désactivé (source)', () => {
  it('à 0 concurrent suivi, le bouton n’est plus rendu en dégradé primaire', () => {
    // armDisabled = busy || followed===0 · le fond passe en fantôme sobre
    // (transparent + bordure), jamais le --grad-accent d’un CTA actif.
    expect(src).toContain('const armDisabled = busy || state.followed === 0;');
    expect(src).toContain("background: state.armed ? 'var(--line-2)' : (armDisabled ? 'transparent' : 'var(--grad-accent)')");
    expect(src).toContain("cursor: busy ? 'wait' : (armDisabled ? 'not-allowed' : 'pointer')");
    // La condition/les droits/le coût ne changent pas · toujours le même disabled.
    expect(src).toContain('disabled={armDisabled}');
  });
});

describe('Radar · le support est ANCRÉ (il ne recouvre plus le contenu)', () => {
  it('/adsmap/radar entre dans la liste des écrans à support ancré', () => {
    expect(shell, 'le support de /adsmap/radar flotte encore et recouvre le contenu')
      .toContain("pathname === '/adsmap/radar'");
  });
});
