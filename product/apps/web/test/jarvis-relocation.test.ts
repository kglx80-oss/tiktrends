import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { outilsResultats } from '@tiktrends/core';

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

// Vague 3 · Jarvis est exclusif à Spatial · la conversation, sa colonne et les
// Sources sont lues dans l'arbre Spatial (page = gardes, vue = rendu).
const jarvis = lit('app/(spatial)/sp/jarvis/page.tsx') + lit('spatial/vues/jarvis/Jarvis.tsx');
const colonne = lit('spatial/vues/jarvis/Jarvis.tsx');
const sources = lit('app/(spatial)/sp/jarvis/sources/page.tsx') + lit('spatial/vues/jarvis/Sources.tsx') + lit('spatial/vues/jarvis/sources-client.tsx');
// Vague 2 Spatial v4 · le bilan avancé (attribution, tendance) vit dans la vue Analytics de l'Accueil Spatial.
const sAttribution = lit('spatial/vues/accueil/Analytics.tsx') + lit('app/(spatial)/sp/dashboard/analytics.ts');
// Les essais ont rejoint Résultats dans Spatial · page (garde, chargement) + vue (rendu).
const sEssais = lit('app/(spatial)/sp/adsmap/essais/page.tsx') + lit('spatial/vues/resultats/Essais.tsx');
// Vague 4 · la mémoire marché vit dans Pubs du moment (Spatial) · `MemoireMarche`, garde dans la page.
const sMarche = lit('spatial/vues/veille/marche-client.tsx');
// Le contexte de marque (accroches comprises) vit sur l'écran Sources de Spatial.
const contexte = sources;
const chatAction = lit('app/actions/jarvis-chat.ts');
const analytics = lit('spatial/vues/accueil/Analytics.tsx');
const veille = lit('app/(spatial)/sp/veille/page.tsx') + lit('spatial/vues/veille/PubsDuMoment.tsx');

describe('Jarvis · la conversation, seule ; le détail à sa destination', () => {
  it('la page de chat accueille la conversation et renvoie aux sources (colonne V5)', () => {
    expect(jarvis).toContain('<Jarvis');
    // Le renvoi aux sources vit dans la colonne d'archives (groupe « Contexte »).
    expect(colonne).toContain('href="/jarvis/sources"');
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
      'MOTEURS_JARVIS',                      // fondateur
      'Ce que Jarvis coûte',                 // dépense (fondateur)
    ]) {
      expect(sources, `bloc manquant sur Sources : ${marqueur}`).toContain(marqueur);
    }
  });

  it('l’attribution et la tendance vivent dans la section montée sur Analytics', () => {
    expect(sAttribution).toContain('id="attribution"');
    expect(sAttribution).toContain('Est-ce que ça marche mieux qu’avant ?');
    expect(sAttribution).toContain('attributionViewAction');
    expect(analytics, 'Analytics ne monte pas le bilan avancé').toContain('<Bilan b={p.bilan} />');
  });

  it('les essais, le Score et les relectures vivent dans la section montée sur Adsmap', () => {
    for (const m of ['id="essais"', 'id="bilan-notes"', 'id="bilan-copie"', 'calibrationScoreAction']) {
      expect(sEssais, `marqueur manquant dans la section essais : ${m}`).toContain(m);
    }
    expect(outilsResultats({ admin: false }).map((o) => o.href), 'Résultats ne mène plus aux essais').toContain('/adsmap/essais');
  });

  it('le marché vit dans la section montée sur la Veille', () => {
    expect(sMarche).toContain('marketViewAction()');
    expect(veille, 'la Veille ne monte pas la mémoire marché').toContain('<MemoireMarche marque={p.marche.marque} />');
  });

  it('les accroches vivent dans le contexte de marque, alimentées par le fil', () => {
    expect(contexte, 'le panneau contexte ne montre pas les accroches').toContain('Accroches');
    expect(contexte).toContain('c.hooks');
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
    // Essais (Spatial) · la garde de la rubrique (offre Plus, marque active), refus dit à l'écran.
    expect(sEssais, 'essais · la garde d’accès manque').toContain('const g = await gardeResultats();');
    expect(sEssais, 'essais · le refus n’est pas rendu').toContain('if (!g.ok) return <RefusResultats');
    // Attribution (vague 2 Spatial v4) · la vue Analytics de l'Accueil Spatial ne lit le bilan que sous le droit Adsmap ET avec une marque active (rendu éprouvé par `spatial-accueil-analytics`).
    expect(sAttribution, 'attribution · la garde d’accès manque').toContain('if (brand && canAccess(acces, ADSMAP))');
    expect(sAttribution, 'attribution · le bilan se rend sans garde').toContain('{p.bilan && <Bilan b={p.bilan} />}');
    // Le marché (Spatial) · offre Résultats ET marque active, sinon la vue ne reçoit rien et ne rend rien.
    expect(veille, 'marché · la garde d’accès manque').toContain('marche={brand && canAccess(access, RESULTATS) ? { marque: brand.name } : null}');
    expect(veille, 'marché · rendu sans garde').toContain('{p.marche && <MemoireMarche');
  });
});
