import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { JarvisContexte } from '../app/(app)/jarvis/JarvisContexte';
import type { ChatHooks } from '../app/actions/jarvis-chat';

/**
 * Le contexte de marque, à la demande · ce que Jarvis a comme appui, et la
 * PORTÉE de chaque élément. On vérifie le RÉSULTAT rendu : la portée est
 * affichée (une consigne sans portée laisse croire qu'elle vaut partout), le
 * panneau renvoie vers l'écran qui édite la marque · il ne recrée pas d'éditeur,
 * et les accroches (déménagées ici) s'affichent mot pour mot avec leur poids.
 * Retirer la portée, ou les accroches, fait tomber la garde.
 */
function rendu(
  identity: string | null = 'Crème solaire clean',
  rules: string | null = 'Toujours montrer le packaging',
  hooks: ChatHooks | null = null,
  measuredAds = 21,
): string {
  return renderToStaticMarkup(
    <JarvisContexte
      contexte={{ brandId: 'b-42', identity, rules, hooks }}
      brandName="Neva"
      measuredAds={measuredAds}
      onClose={() => {}}
    />,
  );
}

describe('JarvisContexte · le contexte de marque, portée comprise', () => {
  const html = rendu();

  it('chaque élément affiche sa portée · ici tout est propre à la marque', () => {
    // Trois blocs (marque, consignes, sources), chacun porte « portée · marque ».
    expect(html.match(/portée · marque/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('la marque renvoie vers son écran d’édition, il ne recrée pas d’éditeur', () => {
    expect(html).toContain('href="/brands/b-42"');
    expect(html).toContain('Modifier la marque');
  });

  it('l’identité et les consignes de la marque sont montrées', () => {
    expect(html).toContain('Crème solaire clean');
    expect(html).toContain('Toujours montrer le packaging');
  });

  it('les sources renvoient au détail sous la conversation', () => {
    expect(html).toContain('href="/jarvis/sources"');
  });

  it('vide · on le dit sans inventer, et on garde la portée', () => {
    const h = rendu(null, null);
    expect(h).toContain('pas encore renseignée');
    expect(h).toContain('Aucune consigne maison');
    expect(h.match(/portée · marque/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('le panneau s’annonce comme une fenêtre nommée et fermable', () => {
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Fermer le contexte"');
  });

  // Réconciliation charte · le statut technique « N tests mesurés » a quitté
  // l'en-tête de la conversation pour vivre ICI (informations techniques →
  // Contexte). On prouve les deux états ; le retirer fait tomber la garde.
  it('le statut technique des tests mesurés vit dans le contexte, pas dans le fil', () => {
    expect(rendu('X', 'Y', null, 21)).toContain('21 test(s) mesuré(s) de Neva');
    expect(rendu('X', 'Y', null, 0)).toContain('Aucun test mesuré sur Neva');
  });

  it('la croix de fermeture atteint la cible tactile de la charte', () => {
    expect(html).toContain(`width:${CIBLE_TACTILE_MIN}px;height:${CIBLE_TACTILE_MIN}px`);
  });

  // Les accroches ont déménagé de la page Sources vers ce panneau (« accroches et
  // consignes → contexte de marque »). On prouve le RÉSULTAT rendu.
  const accroches = {
    summary: 'Deux accroches qui ont gagné ici, une venue du marché.',
    entries: [
      { text: 'Arrête de payer pour du vide', evidence: 'proven' },
      { text: 'Ce que ta crème te cache', evidence: 'market', maxDaysRunning: 40, advertisers: 3 },
    ],
    counts: { proven: 1, market: 1, untested: 0, refuted: 0 },
  } as unknown as ChatHooks;

  it('les accroches s’affichent mot pour mot, avec leur poids', () => {
    const h = rendu('X', 'Y', accroches);
    expect(h, 'le bloc Accroches manque').toContain('Accroches');
    expect(h).toContain('Arrête de payer pour du vide');
    expect(h).toContain('a gagné ici');
    expect(h).toContain('Deux accroches qui ont gagné ici');
    // Quatre blocs désormais (marque, consignes, accroches, sources).
    expect(h.match(/portée · marque/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it('sans accès aux accroches (null), le bloc ne s’invente pas', () => {
    // Un compte sans l'offre Plus n'a pas de `hooks` · le panneau ne montre pas
    // un bloc vide, il n'affiche que marque, consignes et sources.
    expect(html, 'le bloc Accroches apparaît alors qu’il n’y a rien').not.toContain('Accroches');
  });
});
