import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * La relocalisation du détail de Jarvis · garde de SOURCE, comme les autres
 * invariants des pages liées au routeur et à la base (n08, rail-actif).
 *
 * ── L'histoire, et la correction ─────────────────────────────────────────────
 *
 * Le détail de Jarvis a d'abord été replié (DetailJarvis), puis rassemblé sur une
 * page unique « Sources & bilan » · un fourre-tout que la direction a rejeté.
 * Chaque famille vit désormais à SA destination :
 *   · essais, Score Jarvis (notes), calibration, relectures → Adsmap ;
 *   · attribution et tendance → le bilan avancé d'Analytics ;
 *   · marché → la Veille ;
 *   · accroches (et consignes) → le contexte de marque, dans le chat ;
 *   · mémoire mesurée, décrire, couches, réglages maison → la page Sources.
 *
 * On vérifie trois choses, mutées de part et d'autre :
 *  1. la conversation ne porte aucun tableau de bord ;
 *  2. chaque famille est bien À SA destination (rien de perdu) ;
 *  3. elle n'est PLUS sur la page Sources (le fourre-tout a disparu) ;
 *  4. les gardes d'accès survivent · rien n'est élargi.
 */
const lit = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

const jarvis = lit('app/(app)/jarvis/page.tsx');
const sources = lit('app/(app)/jarvis/sources/page.tsx');
const sAttribution = lit('app/(app)/jarvis/sections/SectionAttribution.tsx');
const sEssais = lit('app/(app)/jarvis/sections/SectionEssais.tsx');
const sMarche = lit('app/(app)/jarvis/sections/SectionMarche.tsx');
const contexte = lit('app/(app)/jarvis/JarvisContexte.tsx');
const chatAction = lit('app/actions/jarvis-chat.ts');
const analytics = lit('app/(app)/analytics/page.tsx');
const adsmap = lit('app/(app)/adsmap/page.tsx');
const veille = lit('app/(app)/veille/page.tsx');

describe('Jarvis · la conversation, seule ; le détail à sa destination', () => {
  it('la page de chat accueille la conversation et renvoie aux sources', () => {
    expect(jarvis).toContain('<JarvisChat />');
    expect(jarvis).toContain('href="/jarvis/sources"');
  });

  it('la page de chat ne porte plus le tableau de bord', () => {
    expect(jarvis, 'le repli de transition subsiste').not.toContain('DetailJarvis');
    expect(jarvis, 'un bloc analytique traîne encore sur la conversation').not.toContain('id="attribution"');
    expect(jarvis).not.toContain('MemoryBlock');
  });
});

describe('chaque famille est à sa destination, rien de perdu', () => {
  it('la page Sources garde la mémoire, les couches, décrire et les réglages', () => {
    for (const marqueur of [
      'Ce qui tourne, en ce moment',        // état des couches
      'Ce qu’il a appris de cette marque',   // mémoire mesurée
      'id="decrire"',                        // décrire les créas
      'Réglages maison',                     // fondateur
      'Moteurs orchestrés',                  // fondateur
      'Ce que Jarvis coûte',                 // dépense (fondateur)
    ]) {
      expect(sources, `bloc manquant sur Sources : ${marqueur}`).toContain(marqueur);
    }
  });

  it('l’attribution et la tendance vivent dans la section montée sur Analytics', () => {
    expect(sAttribution).toContain('id="attribution"');
    expect(sAttribution).toContain('Est-ce que ça marche mieux qu’avant ?');
    expect(sAttribution).toContain('attributionViewAction');
    expect(analytics, 'Analytics ne monte pas le bilan avancé').toContain('<SectionAttribution');
  });

  it('les essais, le Score et les relectures vivent dans la section montée sur Adsmap', () => {
    for (const m of ['id="essais"', 'id="bilan-notes"', 'id="bilan-copie"', 'calibrationScoreAction']) {
      expect(sEssais, `marqueur manquant dans la section essais : ${m}`).toContain(m);
    }
    expect(adsmap, 'Adsmap ne monte pas la section essais/notes/relectures').toContain('<SectionEssais');
  });

  it('le marché vit dans la section montée sur la Veille', () => {
    expect(sMarche).toContain('MarketPanel');
    expect(veille, 'la Veille ne monte pas la mémoire marché').toContain('<SectionMarche');
  });

  it('les accroches vivent dans le contexte de marque, alimentées par le fil', () => {
    expect(contexte, 'le panneau contexte ne montre pas les accroches').toContain('Accroches');
    expect(contexte).toContain('contexte.hooks');
    expect(chatAction, 'le fil ne fournit pas les accroches au contexte').toMatch(/hooks/);
    expect(chatAction).toContain('jarvisHookView');
  });
});

describe('le fourre-tout a disparu · Sources ne porte plus le détail déménagé', () => {
  it('Sources ne rend plus les blocs partis ailleurs', () => {
    for (const parti of [
      'id="attribution"',            // → Analytics
      'id="essais"',                 // → Adsmap
      'id="bilan-notes"',            // → Adsmap
      'id="bilan-copie"',            // → Adsmap
      'Les accroches, mot pour mot', // → contexte de marque
      'MarketPanel',                 // → Veille
    ]) {
      expect(sources, `un bloc déménagé traîne encore sur Sources : ${parti}`).not.toContain(parti);
    }
  });

  it('le libellé « Sources & bilan » a disparu de l’interface', () => {
    expect(sources, 'le titre fourre-tout subsiste').not.toContain('Sources &amp; bilan');
    expect(jarvis, 'la carte renvoie encore vers « Sources & bilan »').not.toContain('Sources &amp; bilan');
  });
});

describe('les gardes d’accès survivent au déménagement · rien n’est élargi', () => {
  it('la page Sources garde ses portes (offre Plus, fondateur)', () => {
    expect(sources).toContain('voitMemoire');
    expect(sources).toContain('fondateur');
    expect(sources).toContain('isFounder');
  });

  it('chaque section relocalisée porte SA propre garde d’offre (adsmap) et ne rend rien sinon', () => {
    for (const [nom, src] of [['attribution', sAttribution], ['essais', sEssais], ['marché', sMarche]] as const) {
      expect(src, `${nom} · la garde d’accès manque`).toContain('canAccess(effectiveAccess(s), adsmap)');
      expect(src, `${nom} · ne rend pas null sans accès/marque`).toContain('return null');
    }
  });
});
