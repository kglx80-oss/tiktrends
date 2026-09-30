import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: () => {}, refresh: () => {}, push: () => {} }) }));

import { CartePub } from '../app/(app)/studio/ads/CartePub';
import { Views } from '../app/(app)/adsmap/Views';
import { BarreFiltresGalerie } from '../components/BarreFiltresGalerie';
import { CRITERES_DEFAUT } from '@tiktrends/core';
import type { AdItem } from '../app/actions/ads';

/**
 * I1 · le passage Studio → Adsmap. On RÉEND la carte et l'écran Adsmap et on lit
 * le HTML · quel lien sort de la carte, avec quel libellé, pour quel état, et ce
 * que l'écran Adsmap montre au bout du lien.
 */
const AD = '3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const HREF = `href="/adsmap?ad=${AD}&amp;depuis=studio"`;

const ad = (o: Partial<AdItem> = {}): AdItem => ({
  id: 'g1', template: 'benefits', headline: 'Ma piscine n’a jamais été aussi nette',
  url: '/api/ad/g1?r=4:5', createdAt: '2026-01-01T00:00:00Z', ...o,
});
const carte = (o: Partial<AdItem> = {}, trackable = true) => renderToStaticMarkup(
  <CartePub ad={ad(o)} format="Bénéfices" vignetteUrl="/api/ad/g1?t=1" fullUrl="/api/ad/g1?r=4:5"
    onOpen={() => {}} onArchive={() => {}} trackable={trackable} />,
);
/** La balise <a> du lien Adsmap, ou '' si absente. */
const lienAdsmap = (h: string) => { const i = h.indexOf(HREF); return i < 0 ? '' : h.slice(h.lastIndexOf('<a', i), h.indexOf('</a>', i) + 4); };

describe('I1 · la carte du Studio mène au test qui la mesure', () => {
  it('une créa avec verdict mène à SON test · « Voir le verdict », dans l’app (pas un nouvel onglet)', () => {
    const a = lienAdsmap(carte({ verdict: 'perdante', adsmapAdId: AD }));
    expect(a, 'la carte n’a pas de lien vers le test Adsmap de cette créa').not.toBe('');
    expect(a).toContain('Voir le verdict');
    expect(a, 'le lien Adsmap ouvre un nouvel onglet · le retour Studio se perd').not.toContain('target="_blank"');
  });

  it('une gagnante arbitrée propose d’itérer, là où le panneau le permet', () => {
    expect(lienAdsmap(carte({ verdict: 'gagnante', adsmapAdId: AD }))).toContain('Voir le verdict · itérer');
  });

  it('suivie mais pas lancée · « Suivie · à lancer », « Ouvrir le test », jamais « En mesure » ni verdict promis', () => {
    const h = carte({ verdict: 'a_lancer', adsmapAdId: AD });
    expect(h, 'un brouillon est annoncé en mesure').not.toContain('En mesure');
    expect(h).toContain('Suivie · à lancer');
    const a = lienAdsmap(h);
    expect(a).toContain('Ouvrir le test');
    expect(a, 'le lien d’un test non lancé promet un verdict').not.toContain('verdict');
  });

  it('un test introuvable se dit, SANS lien', () => {
    const h = carte({ verdict: 'introuvable', adsmapAdId: null });
    expect(h).toContain('Test introuvable');
    expect(h, 'un test introuvable reçoit quand même un lien').not.toContain('/adsmap?ad=');
  });

  it('sans accès Adsmap, ni carte non suivie · aucun lien (droits préservés)', () => {
    expect(carte({ verdict: 'perdante', adsmapAdId: AD }, false), 'lien posé sans accès Adsmap').not.toContain('/adsmap?ad=');
    expect(carte({ verdict: null, adsmapAdId: null }), 'lien posé sur une créa non suivie').not.toContain('/adsmap?ad=');
  });

  it('nom long · le lien est nommé par la créa et son libellé ne déborde pas', () => {
    const long = 'Un titre de publicité vraiment très long qui ne doit jamais faire déborder la carte ni son lien';
    const a = lienAdsmap(carte({ verdict: 'perdante', adsmapAdId: AD, headline: long }));
    expect(a, 'le nom accessible du lien ne dit pas de quelle créa il s’agit').toContain(`aria-label="Voir le verdict dans Adsmap · ${long}"`);
    expect(a).toContain('text-overflow:ellipsis');
    expect(a, 'la cible du lien est sous 44 px').toContain('min-height:44px');
  });
});

const views = (testProfond: { adId: string; depuisStudio: boolean; introuvable: boolean } | null) => renderToStaticMarkup(
  <Views batches={[]} canBuild={false} testProfond={testProfond} marque="Klôrea" />,
);

describe('I1 · au bout du lien, Adsmap ouvre le bon test et rend le chemin du Studio', () => {
  it('le lien profond ouvre le panneau du test, avec « Retour au Studio »', () => {
    const h = views({ adId: AD, depuisStudio: true, introuvable: false });
    expect(h, 'le panneau du test ne s’ouvre pas au lien profond').toContain('role="dialog"');
    expect(h, 'le panneau ouvert depuis le Studio n’offre pas le retour').toContain('href="/studio/ads"');
    expect(h).toContain('Retour au Studio');
  });

  it('hors Studio, pas de retour Studio inventé', () => {
    expect(views({ adId: AD, depuisStudio: false, introuvable: false })).not.toContain('Retour au Studio');
  });

  it('un test hors de la marque active n’est PAS ouvert · on le dit, et on rend la main', () => {
    const h = views({ adId: AD, depuisStudio: true, introuvable: true });
    expect(h, 'un test d’une autre marque est ouvert sous le nom de la marque active').not.toContain('role="dialog"');
    expect(h).toContain('introuvable dans Adsmap pour Klôrea');
    expect(h).toContain('href="/studio/ads"');
  });

  it('sans lien profond, rien ne s’ouvre d’office', () => {
    const h = views(null);
    expect(h).not.toContain('role="dialog"');
    expect(h).not.toContain('introuvable');
  });
});

describe('I1 · les filtres de la galerie distinguent « à lancer » de « en mesure »', () => {
  it('la barre propose le filtre « Suivie · à lancer »', () => {
    const h = renderToStaticMarkup(<BarreFiltresGalerie criteres={CRITERES_DEFAUT} onChange={() => {}} formats={[]} formatLabel={(f) => f} nGarde={0} nTotal={0} />);
    expect(h, 'le filtre « à lancer » manque · un brouillon ne se retrouve qu’avec « toutes »').toContain('value="a_lancer"');
    expect(h).toContain('Suivie · à lancer');
  });
});

describe('I1 · câblage serveur (lecture seule, marque active)', () => {
  it('la carte, juste après « Suivre », passe par la règle du noyau (« à lancer »)', () => {
    const CP = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/CartePub.tsx'), 'utf8');
    expect(CP, 'l’état optimiste ne passe plus par etatApresSuivi').toContain("suivi === 'done' ? etatApresSuivi(ad.verdict)");
  });
  const ADS = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');
  const PAGE = readFileSync(join(process.cwd(), 'app/(app)/adsmap/page.tsx'), 'utf8');
  it('la galerie ne pose le lien que vers une ad CONNUE de la marque active', () => {
    expect(ADS, 'la galerie ne vérifie plus l’ad dans la marque active').toContain('await adsDeLaMarque(s.workspaceId, brand.id, adIdsPoses)');
    expect(ADS, 'le lancement n’est plus lu · un brouillon repasserait « en mesure »').toContain('lancee: !!connue && adLancee(connue)');
    expect(ADS).toContain("adsmapAdId: connue ? rec.adsmapAdId! : null");
  });
  it('fermer le panneau du lien profond rend le focus au contenu Adsmap (premier onglet)', () => {
    const V = readFileSync(join(process.cwd(), 'app/(app)/adsmap/Views.tsx'), 'utf8');
    expect(V, 'le focus n’est plus rendu au premier onglet à la fermeture').toContain('setTimeout(() => premierOnglet.current?.focus(), 0)');
    expect(V).toContain('ref={premierOnglet}');
  });
  it('Adsmap vérifie la marque avant d’ouvrir le lien profond', () => {
    expect(PAGE).toContain('lireLienProfondAdsmap(await searchParams)');
    expect(PAGE, 'le lien profond ouvre un test sans vérifier la marque active').toContain('adsDeLaMarque(s.workspaceId, brand.id, [profond.adId])');
  });
});
