// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { carteConfigurationMarque, lireReglesMarque, ajouterRegleMarque } from '@tiktrends/core';
import { parite } from './spatial/parite';

vi.mock('next/navigation', () => ({
  usePathname: () => '/brands/b1',
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Marque } from '../spatial/vues/marque/Marque';
import { Identite } from '../spatial/vues/marque/Identite';
import { Offre } from '../spatial/vues/marque/Offre';
import { Personas } from '../spatial/vues/marque/Personas';
import { Regles } from '../spatial/vues/marque/Regles';
import { sousNavMarque, type PropsFaviconMarque, type PropsSyncSite } from '../spatial/vues/marque/base';

/**
 * Parité de structure des cinq écrans de la fiche Marque avec la maquette
 * (`docs/spatial/reference/<route>.html`). Les props reproduisent les MÊMES
 * nombres d'éléments que le fragment · les textes, eux, sont libres (la
 * parité les ignore, nos données sont réelles).
 */

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Test Personne', initiales: 'TP', email: 't@x.fr', role: 'Propriétaire' },
  credits: { solde: 120, dotation: 200, illimite: false },
  nonLues: 4, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
// React 19 précède le balisage d'un `<link rel=preload>` par image · ce
// n'est pas l'écran, on le retire avant la comparaison.
const rendre = (n: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>).replace(/^(?:<link[^>]*>)+/, '');
const action = async () => {};
const appel = async () => ({});

const favicon: PropsFaviconMarque = { brandId: 'b1', image: null, initiale: 'A', titre: 't', detail: 'd', recuperer: appel, raisonRecuperer: null, importLogo: { logos: [], defaut: null, couleurs: [], polices: [], actions: null, raison: 'r' } };
const sync: PropsSyncSite = { brandId: 'b1', site: 'a.fr', relancer: action, raison: null, cout: 5 };
const nav = sousNavMarque('b1');

describe('Spatial · Marque · parité de structure avec la maquette', () => {
  it('« Marque » (vue d’ensemble) reproduit la maquette', () => {
    const carte = carteConfigurationMarque({ manquesFiche: 5, metaConnecte: false, concurrentsSuivis: 0, concurrentsRenseignes: 2, sauvegardes: 0, lotsLances: 0, personnes: 1 }, 'b1');
    const html = rendre(
      <Marque
        sousNav={nav} brandId="b1" nom="A" favicon={favicon}
        configuration={{ etapes: carte.etapes, faites: carte.faites, total: carte.total, part: carte.part }}
        questionnaire="/onboarding?redo=1" sync={sync}
        aCompleter={['img', 'tag', 'cal', 'chat', 'bulb'].map((icone, i) => ({ cle: `c${i}`, titre: 't', detail: 'd', icone, cible: i % 2 ? { type: 'lien' as const, href: '/x' } : { type: 'champ' as const, champ: 'usp' as const, saisie: 'texte' as const } }))}
        remplir={{ action, cout: 5, raison: null }}
        edition={{ action, valeurs: { id: 'b1' } }}
        couleurs={['#111', '#222', '#333', '#444']} ton={['a', 'b', 'c']}
        produit={{ nom: 'p', image: 'https://x/p.png', detail: 'd' }}
        affirmer={['a', 'b', 'c']} interdits={['a', 'b']}
        audiences={[{ initiale: 'A', teinte: '#111', nom: 'a', detail: 'd', etiquette: 'Proposé' }, { initiale: 'B', teinte: '#222', nom: 'b', detail: 'd', etiquette: null }]}
        assets={[1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: `a${i}`, src: `/api/asset/a${i}` }))}
        ajoutAssets={{ televerser: async () => ({ ok: true as const }), raison: null }}
        retours={{}}
      />,
    );
    // `.favv` · la maquette dessine un SVG fictif, l'écran montre la vraie image (logo ou favicon du site).
    const p = parite(html, 'marque', { ignorer: ['.favv'] });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Identité » reproduit la maquette', () => {
    const opts = (...on: number[]) => ({ type: 'options' as const, options: on.map((o, i) => ({ texte: `o${i}`, on: o === 1 })) });
    const html = rendre(
      <Identite
        sousNav={nav} brandId="b1" favicon={favicon} sync={sync}
        identite={{ complet: true, lignes: [
          { dt: 'Nom', dd: { type: 'texte', texte: 'A' } }, { dt: 'Site', dd: { type: 'texte', texte: 'a.fr' } },
          { dt: 'Secteur', dd: opts(1, 0, 0) }, { dt: 'Tags', dd: opts(1, 1, 1) }, { dt: 'Langues', dd: opts(1, 1) },
          { dt: 'Logo', dd: { type: 'logo', image: null, initiale: 'A', legende: 'l' } },
        ] }}
        couleurs={['#111', '#222', '#333', '#444'].map((code) => ({ code }))}
        typo={[{ dt: 'a', dd: { type: 'texte', texte: 'x' } }, { dt: 'b', dd: { type: 'texte', texte: 'y' } }]}
        ton={{ complet: true, lignes: [{ dt: 'a', dd: opts(1, 0, 1, 0, 1, 0) }, { dt: 'b', dd: opts(1, 0) }, { dt: 'c', dd: opts(1, 0, 0) }] }}
        vocabulaire={[{ dt: 'a', dd: { type: 'pastilles', classe: 'g', pastilles: ['a', 'b', 'c', 'd'] } }, { dt: 'b', dd: { type: 'pastilles', classe: 'r', pastilles: ['a', 'b', 'c'] } }]}
      />,
    );
    const p = parite(html, 'identite', { ignorer: ['.favv'] });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Offre » reproduit la maquette', () => {
    const html = rendre(
      <Offre
        sousNav={nav} brandId="b1" sync={sync}
        produits={[1, 2, 3].map((i) => ({ id: `p${i}`, nom: 'p', image: 'https://x/p.png', detail: 'd', complet: i === 1 }))}
        aCompleter="2 fiches à compléter"
        detail={{ nom: 'p', lignes: [
          { dt: 'Prix', dd: { type: 'texte', texte: '1 €' } },
          { dt: 'Tranche', dd: { type: 'options', options: [{ texte: 'a', on: false }, { texte: 'b', on: true }, { texte: 'c', on: false }] } },
          { dt: 'Peut', dd: { type: 'pastilles', classe: 'g', pastilles: ['a', 'b', 'c'] } },
          { dt: 'Jamais', dd: { type: 'pastilles', classe: 'r', pastilles: ['a', 'b'] } },
        ] }}
        ajouter={action} shopify={null} retours={{}}
      />,
    );
    // `.prow` · la maquette simule trois produits avec UNE image teintée par
    // des filtres CSS (`filter:hue-rotate`) · nos lignes montrent la vraie photo.
    // 3e tuile · « Offres & conditions » n'a aucune table · l'écran dit l'état
    // vide au lieu des trois offres d'exemple (la tuile elle-même est comparée).
    const p = parite(html, 'offre', { ignorer: ['.prow', '.grid2 > section:nth-child(3)'] });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Personas » reproduit la maquette', () => {
    const P = (i: number) => ({ id: `p${i}`, initiale: 'A', teinte: '#111', nom: `A${i}, 30 ans`, statut: { libelle: 'Validé', classe: 'g' as const }, description: 'd',
      desirs: ['a', 'b', 'c'], freins: ['a', 'b', 'c'], objections: ['a', 'b', 'c'], citations: ['a', 'b', 'c', 'd'], sources: 4 });
    const html = rendre(
      <Personas
        sousNav={nav} brandId="b1" nom="A" personas={[P(1), P(2), P(3)]}
        scenarios={[{ titre: 'a', contexte: 'b' }, { titre: 'c', contexte: 'd' }]}
        jarvis="/jarvis" creerPub="/studio/projets/nouveau?type=ads" ajouterPersona={action} ajouterScenario={null} retours={{}}
      />,
    );
    // 3e case de la 2e grille · « Angles mesurés » par persona n'a aucune
    // source (aucun lot n'est rattaché à un persona) · l'écran le dit.
    const p = parite(html, 'clients', { ignorer: ['section.tile > div:nth-of-type(3) > div:nth-child(3)'] });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Règles » reproduit la maquette', () => {
    let t = '';
    for (const [type, r] of [['ban', 'a'], ['ban', 'b'], ['ban', 'c'], ['ban', 'd'], ['must', 'e'], ['pref', 'f'], ['pref', 'g']] as const) t = ajouterRegleMarque(t, type, r)!;
    expect(lireReglesMarque(t)).toHaveLength(7);
    const html = rendre(
      <Regles
        sousNav={nav} brandId="b1" texte={t} enregistrer={async () => ({ ok: true as const })} raison={null} jarvis="/jarvis"
        sources={{ lignes: [{ libelle: 'a', branchee: true }, { libelle: 'b', branchee: true }, { libelle: 'c', branchee: true }, { libelle: 'd', branchee: false }], manquantes: '1 manquante' }}
      />,
    );
    const p = parite(html, 'regles');
    expect(p.rendu).toEqual(p.reference);
  });
});

/* ───────────────────────── Rien de la maquette en production ───────────────────────── */

const WEB = join(__dirname, '..');
const fichiers = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? fichiers(p) : /\.tsx?$/.test(n) ? [p] : []; });

describe('Spatial · Marque · aucune donnée d’exemple ni ponctuation interdite', () => {
  const sources = [...fichiers(join(WEB, 'spatial', 'vues', 'marque')), ...fichiers(join(WEB, 'app', '(spatial)', 'sp', 'brands')), join(WEB, 'lib', 'spatial', 'pastilles', 'marque.ts')];
  it('aucun nom, chiffre ou « Prototype » de la maquette dans les vues et les pages', () => {
    const fautes = sources.flatMap((f) => {
      const s = readFileSync(f, 'utf8');
      return ['Neva', 'neva.fr', 'Claire', 'Jacques', 'Samir', 'Sarah', 'Mehdi', 'Kevin', 'Prototype', '1 240', '1 284', 'ÉTÉ20', 'Ploufy'].filter((m) => s.includes(m)).map((m) => `${f.split('/web/')[1]} · ${m}`);
    });
    expect(fautes).toEqual([]);
  });
  it('aucun tiret cadratin ni « Trendtrack » dans le texte', () => {
    const fautes = sources.filter((f) => /—|Trendtrack/i.test(readFileSync(f, 'utf8')));
    expect(fautes).toEqual([]);
  });
});
