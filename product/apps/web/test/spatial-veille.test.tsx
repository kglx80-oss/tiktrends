// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { InspoAd } from '@tiktrends/integrations';
import { ECRANS_VEILLE } from '../../../packages/core/src/spatial/ecrans/veille';
import { fragmentReference, parite, squelette } from './spatial/parite';

vi.mock('next/navigation', () => ({ usePathname: () => '/veille', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock('../app/actions/inspo', () => ({
  saveAd: async () => ({ ok: true }), unsaveAd: async () => ({ ok: true }), followBrand: async () => ({ ok: true }), unfollowBrand: async () => ({ ok: true }),
  setSavedAdFolder: async () => ({ ok: true }),
}));
vi.mock('../app/actions/competitor', () => ({ analyzeCompetitorAction: async () => {} }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { PubsDuMoment } from '../spatial/vues/veille/PubsDuMoment';
import type { CarteVeilleDonnees } from '../spatial/vues/veille/types';

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Utilisateur Test', initiales: 'UT', email: 'u@x.fr', role: 'Propriétaire' },
  credits: { solde: 1240, dotation: 2000, illimite: false },
  nonLues: 4, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const rendre = (n: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>);

/** Un élément du fragment de référence, pour y lire ce que la maquette montre (nombre, variantes de classes). */
function refDoc(route: string): DocumentFragment {
  const t = document.createElement('template');
  t.innerHTML = fragmentReference(route);
  return t.content;
}

const AD: InspoAd = { id: 'a1', platform: 'meta', status: 'active', daysRunning: 34, body: 'Texte réel', advertiserName: 'Annonceur' };

function carte(i: number, o: { hot: boolean; ratio: '' | 'r916' | 'r11'; live: boolean; classe: '' | 'up' | 'down' }): CarteVeilleDonnees {
  return {
    cle: `meta:${i}`, ancre: null, ad: { ...AD, id: String(i) }, marque: { nom: 'Annonceur', initiale: 'A', fond: '#ffb3c7' },
    active: o.live, jours: '34 j',
    signaux: [{ icone: 'eye', texte: '3 actives', titre: 'Pubs actives' }, { icone: 'copy', texte: '120 k', titre: 'J’aime' }],
    pays: 'FR', portee: '110 k', depense: '1 k€', croissance: { texte: '+9 %', classe: o.classe }, texte: 'Texte réel',
    image: 'https://x/img.jpg', ratio: o.ratio, tendance: o.hot, style: 'Témoignage', domaine: 'x.fr', titre: 'Annonceur', cta: 'Acheter',
    iterer: '/studio/projets/nouveau', sauvee: false, suivie: false,
    detail: { statut: 'Active', liens: [], kpis: [], lecture: '', annonceur: null, jarvis: [], texte: null },
  };
}

/* ───────────────────────── écrans déclarés ───────────────────────── */

describe('Spatial · Veille · écrans déclarés', () => {
  it('les cinq adresses de la rubrique sont portées dans la section veille', () => {
    expect(ECRANS_VEILLE.map((e) => e.chemin)).toEqual(expect.arrayContaining(['/radar', '/saved', '/veille', '/veille/concurrents', '/veille/scale']));
    expect(ECRANS_VEILLE.every((e) => e.section === 'veille')).toBe(true);
  });
});

/* ───────────────────────── parité de structure ───────────────────────── */

const SOUS_NAV_TEST = 'PRO';

describe('Spatial · Veille · parité de structure avec la maquette', () => {
  // La maquette COMPOSE une fausse pub en CSS dans `.comp` (photo filtrée,
  // bandeaux de texte, faux tweet…) · l'écran réel y met l'image de l'annonce.
  // Le contenu de `.comp` est donc fictif des deux côtés · son cadre (classes,
  // ratio) reste comparé.
  const IGNORER_VEILLE = ['.comp'];

  function propsVeille() {
    const doc = refDoc('veille');
    const articles = [...doc.querySelectorAll('article.xa')];
    const cartes = articles.map((a, i) => {
      const comp = a.querySelector('.comp')!;
      const ratio = comp.classList.contains('r916') ? 'r916' as const : comp.classList.contains('r11') ? 'r11' as const : '' as const;
      const g = a.querySelector('.xm span:last-child')!;
      return carte(i, { hot: !!a.querySelector('.xt.hot'), ratio, live: !!a.querySelector('i.live'), classe: g.classList.contains('up') ? 'up' : g.classList.contains('down') ? 'down' : '' });
    });
    const suggestions = [...doc.querySelectorAll('.xaisug .chip')].map((b) => b.textContent ?? '');
    return { cartes, suggestions };
  }

  it('« Pubs du moment » reproduit la maquette', () => {
    const { cartes, suggestions } = propsVeille();
    expect(cartes).toHaveLength(24);
    const html = rendre(
      <PubsDuMoment
        sous="Pistes installées" pastilleRadar={SOUS_NAV_TEST}
        recherche={{ phrase: '', compris: null, suggestions }}
        barre={{ criteres: {}, plateforme: 'meta', vue: 'tout', tri: 'newest', cpm: 9, stat: { pubs: 24, annonceurs: 12, suite: '' } }}
        cartes={cartes} vide={null} pages={null} coutJarvis="Aucun crédit"
      />,
    );
    const p = parite(html, 'veille', { ignorer: IGNORER_VEILLE });
    expect(p.rendu).toEqual(p.reference);
  });

  it('la garde voit un écart · une carte sans tendance là où la maquette en montre une la fait tomber', () => {
    const { cartes, suggestions } = propsVeille();
    const i = cartes.findIndex((c) => c.tendance);
    cartes[i] = { ...cartes[i]!, tendance: false };
    const html = rendre(<PubsDuMoment sous="" pastilleRadar={SOUS_NAV_TEST} recherche={{ phrase: '', compris: null, suggestions }} barre={{ criteres: {}, plateforme: 'meta', vue: 'tout', tri: 'newest', cpm: 9, stat: { pubs: 24, annonceurs: 12, suite: '' } }} cartes={cartes} vide={null} pages={null} coutJarvis="" />);
    const p = parite(html, 'veille', { ignorer: IGNORER_VEILLE });
    expect(p.rendu).not.toEqual(p.reference);
    expect(squelette(fragmentReference('veille'), { ignorer: IGNORER_VEILLE }).length).toBeGreaterThan(500);
  });
});

import { Sauvegardes } from '../spatial/vues/veille/Sauvegardes';
import type { SauvegardeDonnees } from '../spatial/vues/veille/sauvegardes-client';
import { CeQuiScale } from '../spatial/vues/veille/CeQuiScale';
import { Radar } from '../spatial/vues/veille/Radar';
import { Concurrents } from '../spatial/vues/veille/Concurrents';

// La maquette compose chaque vignette (`div.ad` · photo filtrée + bandeau de
// texte inventé) · l'écran réel y met l'image de l'annonce, sans texte ajouté.
const IGNORER_AD = ['.ad'];

describe('Spatial · Veille · parité des autres écrans', () => {
  it('« Sauvegardes » reproduit la maquette (collections = dossiers réels)', () => {
    const doc = refDoc('sauvegardes');
    const vitems = [...doc.querySelectorAll('article.vitem')];
    const dossiers = ['Dossier A', 'Dossier A', 'Dossier B', 'Dossier C'];
    const items: SauvegardeDonnees[] = vitems.map((v, i) => ({
      id: `s${i}`, platform: 'meta', externalId: `e${i}`, ad: { ...AD, id: `e${i}` }, folder: dossiers[i] ?? null,
      marque: { nom: 'Annonceur', initiale: 'A', fond: '#ffb3c7' }, source: 'FR · Meta', image: 'https://x/i.jpg',
      longue: v.querySelector('.scale') ? '21 j +' : null, video: !!v.querySelector('.play'),
      meta: ['Active · 34 j', 'Image · Meta'],
      pastilles: [...v.querySelectorAll('.row .pill')].map((p, k) => ({ libelle: `P${k}`, classe: p.classList.contains('g') ? 'g' as const : '' as const })),
      cloner: '/studio/projets/nouveau',
    }));
    expect(items).toHaveLength(4);
    const html = rendre(<Sauvegardes items={items} pastilleRadar={SOUS_NAV_TEST} creerProjet="/studio/projets/nouveau" />);
    const p = parite(html, 'sauvegardes', { ignorer: IGNORER_AD });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Ce qui scale » reproduit la maquette', () => {
    const n = refDoc('scale').querySelectorAll('.srow').length;
    expect(n).toBe(8);
    const lignes = Array.from({ length: n }, (_, i) => ({ cle: `k${i}`, rang: i + 1, image: null, accroche: 'Accroche', detail: 'Annonceur · Témoignage', part: 100 - i * 10, jours: `${60 - i} j`, cloner: '/studio/projets/nouveau' }));
    const html = rendre(<CeQuiScale sous="Niche" lignes={lignes} pastilleRadar={SOUS_NAV_TEST} vide={null} />);
    const p = parite(html, 'scale', { ignorer: IGNORER_AD });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Radar » fermé reproduit la maquette', () => {
    const doc = refDoc('radar');
    const tuiles = [...doc.querySelectorAll('.grid3 > .tile')];
    const marques = tuiles.map((t, i) => ({
      cle: `m${i}`, nom: `Marque ${i}`, initiale: 'M', fond: '#ffb3c7', site: 'm.fr',
      vignettes: [...t.querySelectorAll('.kc .ad')].map(() => null),
      nouveautes: t.querySelector('.pill.c') ? '2 nouvelles non vues' : null, voir: '/veille?q=m',
    }));
    const alertes = [...doc.querySelectorAll('article')].map((_, i) => ({ titre: `Alerte ${i}`, texte: 'Relevé par le suivi', action: { href: '/veille', libelle: 'Voir ses pubs' } }));
    expect(alertes).toHaveLength(3);
    const html = rendre(
      <Radar ouvert={false} pastilleRadar={SOUS_NAV_TEST} alertes={alertes} marques={marques} inclus=""
        verrou={{ titre: 'Inclus dès l’offre Core', texte: 'Le Radar suit…', passer: { href: '/billing', libelle: 'Passer à Core' }, superposition: { titre: '3 alertes', sous: 'Débloque' } }} />,
    );
    // Les « recherches enregistrées » de la maquette n'existent pas en base · la
    // table est rendue avec son en-tête et un état vide honnête · son contenu
    // (trois recherches inventées) n'est pas comparé.
    const p = parite(html, 'radar', { ignorer: [...IGNORER_AD, '.mtable'] });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Concurrents » reproduit la maquette', () => {
    const doc = refDoc('concurrents');
    const suggestions = [...doc.querySelectorAll('.ccs')].map((_, i) => ({ nom: `Concurrent ${i}`, initiale: 'C', fond: '#ffb3c7', detail: 'Dans la fiche', cible: `b\nConcurrent ${i}` }));
    const scannes = [...doc.querySelectorAll('article.ccc')].map((a, i) => ({
      nom: `Scanné ${i}`, initiale: 'S', fond: '#b8e1ff', detail: 'scanné il y a 2 h', nouveautes: a.querySelector('.pill.c') ? '1 nouvelle' : null,
      stats: [['Pubs actives', '3 / 4'], ['Durée moyenne', '20 j'], ['Dépense estimée', 'n/c'], ['Meta / TikTok', '100 / 0']] as Array<[string, string]>,
      medias: [...a.querySelectorAll('.ccfm > div')].map((_, k) => ({ libelle: `M${k}`, part: 20 })),
      accroches: [...a.querySelectorAll('.cchk p')].map((_, k) => `Accroche ${k}`),
      angle: 'Angle', voir: '/veille?q=s', analyse: '/brands/b/competitors/s', suivi: true,
    }));
    expect(suggestions).toHaveLength(5);
    const html = rendre(<Concurrents pastilleRadar={SOUS_NAV_TEST} marque={{ id: 'b', nom: 'Marque' }} scanner={async () => {}} refus={null} cout={5} suggestions={suggestions} scannes={scannes} />);
    const p = parite(html, 'concurrents');
    expect(p.rendu).toEqual(p.reference);
  });
});
