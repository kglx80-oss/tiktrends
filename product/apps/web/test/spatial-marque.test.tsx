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

  /**
   * Lot 9 V5 · écart DÉCLARÉ · rang et segment d'un persona, « Modifier » et
   * « Valider ce persona » (`[data-lot9]`) n'existent que si la base les porte
   * (rang, segment) ou si les gestes sont branchés, et seulement à ces places ·
   * le rang dans la puce juste après la pastille, les pastilles rang et segment
   * dans la ligne du nom, les deux gestes dans la rangée de « Créer une pub ».
   * Ailleurs, ou en trop, ils font tomber la parité.
   */
  function sansLot9(html: string, attendus: number): string {
    const t = document.createElement('template');
    t.innerHTML = html;
    const ajouts = [...t.content.querySelectorAll('[data-lot9]')];
    const aSaPlace = (e: Element) => {
      const parent = e.parentElement!;
      if (e.matches('b[data-lot9="rang"]')) return parent.matches('[aria-label="Persona"] > button') && !!e.previousElementSibling?.matches('span.av');
      if (e.matches('span.pill[data-lot9="rang"], span.pill[data-lot9="segment"]')) return !!parent.firstElementChild?.matches('h2');
      if (e.matches('span[data-lot9="modifier"], span[data-lot9="valider"]')) return !!parent.firstElementChild?.matches('.btn.pri') && (parent.firstElementChild!.textContent ?? '').includes('Créer une pub');
      return false;
    };
    if (ajouts.length !== attendus || !ajouts.every(aSaPlace)) return html;
    ajouts.forEach((e) => e.remove());
    return t.innerHTML;
  }

  it('lot 9 · des personas classés et segmentés, « Modifier » et « Valider » branchés, gardent la parité · seuls ces ajouts, à leur place', () => {
    const P = (i: number) => ({ id: `p${i}`, initiale: 'A', teinte: '#111', nom: `A${i}, 30 ans`, statut: { libelle: 'Validé', classe: 'g' as const }, description: 'd',
      desirs: ['a', 'b', 'c'], freins: ['a', 'b', 'c'], objections: ['a', 'b', 'c'], citations: ['a', 'b', 'c', 'd'], sources: 4,
      // `aValider` force « Valider ce persona » · la pastille de statut garde la classe de la maquette.
      rang: i, segment: 'Jeunes parents', aValider: true,
      editable: { id: `p${i}`, nom: `A${i}`, description: 'd', segment: 'Jeunes parents', rang: i, desirs: ['a'], freins: ['b'], objections: ['c'] } });
    const html = rendre(
      <Personas
        sousNav={nav} brandId="b1" nom="A" personas={[P(1), P(2), P(3)]}
        scenarios={[{ titre: 'a', contexte: 'b' }, { titre: 'c', contexte: 'd' }]}
        jarvis="/jarvis" creerPub="/studio/projets/nouveau?type=ads" ajouterPersona={action} ajouterScenario={null} retours={{}}
        edition={{ modifier: { action: async () => ({ ok: true as const }), raison: null }, valider: { action: async () => ({ ok: true as const }), raison: null } }}
      />,
    );
    // Trois rangs dans les puces, rang et segment du persona affiché, ses deux gestes.
    expect(html.split('data-lot9=').length - 1, 'un ajout du lot 9 manque ou est en trop').toBe(7);
    const p = parite(sansLot9(html, 7), 'clients', { ignorer: ['section.tile > div:nth-of-type(3) > div:nth-child(3)'] });
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
