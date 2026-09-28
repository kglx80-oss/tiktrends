import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MODE_LABEL } from '@tiktrends/core';
import { CarteSuite } from '../app/(app)/adsmap/suites/Suites';
import type { IterationRow } from '../app/actions/adsmap-iterate';

/**
 * Lot UI Suites · le paragraphe du moteur, répété d'une carte à l'autre, noyait
 * la décision et repoussait le premier contenu utile trop bas. On mène par le
 * mode + la variable, on replie la rationale dans « Pourquoi cette suite », on
 * filtre par mode SANS recalculer · et on ne masque jamais la réserve qui change
 * ce que fait l'action.
 *
 * On cloue le RÉSULTAT là où on peut le rendre (`CarteSuite`, HTML rendu) et la
 * STRUCTURE à la source pour le filtre client et la bascule d'ouverture.
 */

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const src = read('app/(app)/adsmap/suites/Suites.tsx');
const page = read('app/(app)/adsmap/suites/page.tsx');
const shell = read('components/AppShell.tsx');

const base: IterationRow = {
  adId: 'ad-1', label: 'Concept 2 · v2', spend: 320,
  mode: 'more', changedVariable: 'hook', stageTargeted: null,
  freeze: ['offer', 'landing'], rationale: 'Rationale du moteur · longue et répétée d’une carte à l’autre.',
  priority: 0, edgeLegal: true,
  modeLabel: MODE_LABEL.more, modeHint: 'Elle a gagné · on garde ce qui a gagné et on multiplie.',
  variableLabel: 'le visuel d’ouverture', stageLabel: null,
  freezeLabels: ['l’accroche', 'l’offre'], conceptTitle: 'Concept 2', parentVerdict: 'winner',
};
const noop = () => {};

describe('Suites · la carte compacte mène par le mode et la variable (HTML rendu)', () => {
  it('montre le mode en TEXTE (Décliner/Corriger/Repartir), pas seulement une pastille', () => {
    const h = renderToStaticMarkup(<CarteSuite row={base} ouvert={false} onToggle={noop} onCree={noop} />);
    expect(h).toContain(MODE_LABEL.more); // « Décliner »
    expect(h).toContain('Concept 2 · v2');
    // La variable à changer est mise en avant.
    expect(h).toContain('Changer');
    expect(h).toContain('le visuel d’ouverture');
  });

  it('affiche les invariants « À conserver » en chips, seulement s’il y en a', () => {
    const avec = renderToStaticMarkup(<CarteSuite row={base} ouvert={false} onToggle={noop} onCree={noop} />);
    const sans = renderToStaticMarkup(<CarteSuite row={{ ...base, freezeLabels: [] }} ouvert={false} onToggle={noop} onCree={noop} />);
    expect(avec).toContain('À conserver');
    expect(avec).toContain('l’accroche');
    expect(sans, 'un « À conserver » vide affiche quand même l’étiquette').not.toContain('À conserver');
  });

  it('la réserve indispensable (parent non prouvé → nouveau concept) n’est JAMAIS repliée', () => {
    // edgeLegal=false · la réserve change ce que fait l'action · elle doit être
    // dans le HTML rendu de la carte FERMÉE, pas dans un repli.
    const h = renderToStaticMarkup(<CarteSuite row={{ ...base, edgeLegal: false }} ouvert={false} onToggle={noop} onCree={noop} />);
    expect(h).toContain('nouveau concept, pas comme itération');
    // Le markup statique inclut le contenu d'un <details> fermé · pour prouver
    // qu'elle n'est PAS dans le repli, on exige qu'elle soit rendue AVANT la
    // révélation « Pourquoi cette suite » (donc dans le corps toujours visible).
    expect(h.indexOf('nouveau concept, pas comme itération'))
      .toBeLessThan(h.indexOf('Pourquoi cette suite'));
    // Et elle n'apparaît pas quand le parent EST prouvé gagnant.
    const legal = renderToStaticMarkup(<CarteSuite row={base} ouvert={false} onToggle={noop} onCree={noop} />);
    expect(legal).not.toContain('nouveau concept, pas comme itération');
  });

  it('la rationale du moteur vit dans une révélation « Pourquoi cette suite »', () => {
    const h = renderToStaticMarkup(<CarteSuite row={base} ouvert={false} onToggle={noop} onCree={noop} />);
    expect(h).toContain('Pourquoi cette suite');
    expect(h).toContain('déplier'); // fermée par défaut
    // La rationale est rendue (accessible), pas supprimée.
    expect(h).toContain('Rationale du moteur');
  });

  it('le formulaire d’hypothèse garde sa validation ≥10 caractères (bouton désactivé à vide)', () => {
    const h = renderToStaticMarkup(<CarteSuite row={base} ouvert={true} onToggle={noop} onCree={noop} />);
    expect(h).toContain('Ce que ce test parie');
    expect(h).toContain('Créer');
    // À l'ouverture l'hypothèse est vide (<10) · le bouton Créer naît désactivé.
    expect(h).toMatch(/disabled=""[^>]*>Créer<|<button[^>]*disabled=""[^>]*>\s*Créer/);
  });

  it('les actions principale (pleine) et secondaire (fantôme) sont distinctes', () => {
    const h = renderToStaticMarkup(<CarteSuite row={base} ouvert={false} onToggle={noop} onCree={noop} />);
    expect(h).toContain('Créer la suite');
    expect(h).toContain('Demander le concept à Jarvis');
    // La principale porte le dégradé d'accent · la secondaire un fond transparent.
    const iCreer = h.indexOf('Créer la suite');
    const btnCreer = h.slice(h.lastIndexOf('<button', iCreer), iCreer);
    expect(btnCreer, 'l’action principale n’est pas mise en avant').toContain('grad-accent');
  });
});

describe('Suites · le filtre par mode est un tri d’affichage (source)', () => {
  it('propose Tous + les trois modes, comptés sur les lignes présentes', () => {
    expect(src).toContain('Filtrer les suites par mode');
    expect(src).toContain('libelle="Tous"');
    expect(src).toContain('MODE_LABEL[m]');
    // Compteurs dérivés des rows, pas posés en dur.
    expect(src).toContain('for (const r of view?.rows ?? []) { c.all++; c[r.mode]++; }');
  });

  it('le filtre masque des lignes SANS re-trier · l’ordre serveur est conservé', () => {
    // Un simple .filter sur view.rows garde l'ordre · aucun .sort côté client.
    expect(src).toContain("filtre === 'all' ? view.rows : view.rows.filter((r) => r.mode === filtre)");
    expect(src, 'un tri métier client s’est glissé dans l’écran').not.toMatch(/\.rows\.[^\n]*\.sort\(/);
  });

  it('aucun-résultat-de-filtre est DISTINCT de la marque-sans-verdict', () => {
    // Marque sans verdict · l'Empty « Rien à itérer ».
    expect(src).toContain('Rien à itérer pour l’instant.');
    // Filtre sans résultat alors que d'autres modes en portent · message à part.
    expect(src).toContain('Aucune suite en');
    expect(src).toContain('réparties sur les autres modes');
  });

  it('le recalcul reste manuel · aucune relecture au changement de filtre', () => {
    // iterationPlanAction n'est appelée qu'au montage et dans recharger (bouton).
    const appels = src.match(/iterationPlanAction\(\)/g) ?? [];
    expect(appels.length, 'un appel de plan supplémentaire est apparu').toBe(2);
    expect(src).toContain('const recharger = () => lance(async () => {');
  });
});

describe('Suites · révélation ouverte/repliée + en-tête court + support ancré (source)', () => {
  it('« Pourquoi cette suite » bascule déplier ↔ replier selon l’ouverture', () => {
    expect(src).toContain('onToggle={(e) => setOuvert((e.currentTarget as HTMLDetailsElement).open)}');
    expect(src).toMatch(/ouvert \? 'replier[^']*' : 'déplier/);
  });

  it('l’en-tête est court · phrase orientée prochaine itération, aide repliée à cible tactile', () => {
    expect(page).toContain('Le prochain test de chaque gagnante');
    expect(page).toContain('minHeight={CIBLE_TACTILE_MIN}');
  });

  it('le support est ANCRÉ sur /adsmap/suites · il ne recouvre plus cartes ni CTA', () => {
    expect(shell).toContain("pathname === '/adsmap/suites'");
  });
});
