// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { ECRANS_SPATIAUX, entreesRail, entreesRailEspace, deriverRoutesCss, routesColorees } from '@tiktrends/core';
import { parite, squelette, fragmentReference } from './spatial/parite';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock('../app/actions/brands', () => ({ setActiveBrand: async () => {} }));
vi.mock('../app/actions/notifications', () => ({ fetchNotifications: async () => ({ items: [], unread: 0 }), markAllNotificationsRead: async () => {}, markNotificationRead: async () => {} }));

import { Coquille, type DonneesCoquille } from '../spatial/coquille/Coquille';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Utilisation } from '../spatial/vues/reglages/Utilisation';

const WEB = join(__dirname, '..');
const lire = (p: string) => readFileSync(join(WEB, p), 'utf8');

/* ───────────────────────── 1 · le CSS est celui de la maquette ───────────────────────── */

describe('Spatial · la feuille de style est celle de la maquette, à l’octet près', () => {
  it('spatial.css = les blocs <style> du gabarit de la maquette, sans retouche', () => {
    const bundle = readFileSync(join(WEB, '..', '..', '..', 'docs', 'spatial', 'maquette', 'TikTrends_Spatial_hors_ligne.html'), 'utf8');
    const brut = /<script type="__bundler\/template">([\s\S]*?)<\/script>/.exec(bundle)![1]!.trim();
    const gabarit = JSON.parse(brut) as string;
    const blocs = [...gabarit.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
    const attendu = blocs.join('\n');
    const reel = lire('spatial/spatial.css').replace(/^\/\*[\s\S]*?\*\/\n/, '');
    expect(reel.length, 'taille du CSS Spatial').toBe(attendu.length);
    expect(reel === attendu, 'spatial.css a été modifié · le pixel perfect suppose le CSS de la maquette TEL QUEL').toBe(true);
  });

  it('spatial-routes.css = la dérivation EXACTE des règles à adresse « #route » · les couleurs des tuiles et anneaux suivent `data-route`', () => {
    const css = lire('spatial/spatial.css');
    expect(lire('spatial/spatial-routes.css'), 'feuille dérivée périmée · la régénérer par deriverRoutesCss(spatial.css)').toBe(deriverRoutesCss(css));
    expect(routesColorees(css)).toEqual(['formats', 'importer', 'jarvis', 'lots', 'marque', 'nouveau', 'radar', 'sauvegardes', 'studios', 'veille']);
    expect(lire('spatial/spatial-routes.css')).not.toContain('href=');
    // Aucune règle oubliée (ex. dans un @media) · autant de sélecteurs dérivés que d'originaux.
    const n = (t: string, re: RegExp) => (t.match(re) ?? []).length;
    expect(n(lire('spatial/spatial-routes.css'), /\[data-route="/g)).toBe(n(css, /\[href="#/g));
  });
});

/* ───────────────────────── 2 · les deux interfaces ne se mélangent pas ───────────────────────── */

describe('Spatial · isolation des feuilles de style', () => {
  const imports = (src: string) => [...src.matchAll(/^import\s+['"]([^'"]+\.css)['"]/gm)].map((m) => m[1]);

  it('le layout racine ne charge AUCUNE feuille · chaque arbre apporte la sienne', () => {
    expect(imports(lire('app/layout.tsx'))).toEqual([]);
  });

  it('chaque segment de l’ancienne interface charge globals.css (sinon il perdrait ses styles)', () => {
    const app = join(WEB, 'app');
    const segments = readdirSync(app).filter((n) => statSync(join(app, n)).isDirectory() && !['actions', 'api', '(spatial)'].includes(n));
    expect(segments.length).toBeGreaterThanOrEqual(9);
    for (const s of segments) {
      const l = join('app', s, 'layout.tsx');
      expect(existsSync(join(WEB, l)), `${s} · layout.tsx manquant`).toBe(true);
      expect(imports(lire(l)), `${s} · globals.css non importé`).toContain('../globals.css');
    }
    expect(imports(lire('app/page.tsx')), 'page d’accueil publique').toContain('./globals.css');
  });

  it('l’arbre Spatial ne charge QUE le CSS de la maquette · jamais globals.css ni les jetons V5', () => {
    expect(imports(lire('app/(spatial)/layout.tsx'))).toEqual(['../../spatial/spatial.css', '../../spatial/spatial-routes.css']);
    const fichiers: string[] = [];
    const parcourir = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? parcourir(p) : /\.(tsx?|css)$/.test(n) && fichiers.push(p); } };
    parcourir(join(WEB, 'app', '(spatial)')); parcourir(join(WEB, 'spatial'));
    for (const f of fichiers) {
      const sources = [...readFileSync(f, 'utf8').matchAll(/^\s*import\s+(?:[^'"]*from\s+)?['"]([^'"]+)['"]/gm)].map((m) => m[1]!);
      expect(sources.filter((x) => /globals\.css|tokens\.css|^@tiktrends\/ui/.test(x)), `${f} tire l’ancienne charte`).toEqual([]);
    }
  });
});

/* ───────────────────────── 2bis · frontière serveur / client ───────────────────────── */

describe('Spatial · un module client n’exporte que des composants, des hooks ou des types', () => {
  // Une fonction ou une constante exportée d'un module `'use client'` devient une
  // RÉFÉRENCE client · appelée depuis une page serveur, elle lève en production
  // (« Attempted to call X() from the server »), ce que les tests unitaires ne
  // voient pas. Défaut vu au banc le 27/10 (`formatNombre`).
  it('aucun export minuscule (hors hook `useX`) dans un fichier `use client` de spatial/', () => {
    const fichiers: string[] = [];
    const parcourir = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? parcourir(p) : /\.tsx?$/.test(n) && fichiers.push(p); } };
    parcourir(join(WEB, 'spatial'));
    const fautifs: string[] = [];
    for (const f of fichiers) {
      const src = readFileSync(f, 'utf8');
      if (!/^\s*['"]use client['"]/.test(src)) continue;
      for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:const|let|function)\s+([A-Za-z0-9_]+)/gm)) {
        if (!/^[A-Z]|^use[A-Z]/.test(m[1]!)) fautifs.push(`${f.split('/spatial/')[1]} · ${m[1]}`);
      }
      if (/^export\s+\*/m.test(src)) fautifs.push(`${f.split('/spatial/')[1]} · export *`);
    }
    expect(fautifs).toEqual([]);
  });
});

/* ───────────────────────── 3 · chaque écran porté a sa page, et seulement eux ───────────────────────── */

describe('Spatial · écrans portés ⇔ pages de l’arbre', () => {
  it('chaque chemin porté a sa page sous app/(spatial)/sp, et aucune page n’est orpheline', () => {
    const base = join(WEB, 'app', '(spatial)', 'sp');
    const pages: string[] = [];
    const parcourir = (d: string, chemin: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) parcourir(p, `${chemin}/${n}`); else if (n === 'page.tsx') pages.push(chemin || '/'); } };
    parcourir(base, '');
    expect(pages.sort()).toEqual(ECRANS_SPATIAUX.map((e) => e.chemin).sort());
  });
});

/* ───────────────────────── 4 · parité de structure ───────────────────────── */

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 1240, dotation: 2000, illimite: false },
  nonLues: 4, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const rendre = (n: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>);

describe('Spatial · parité de structure avec la maquette', () => {
  it('le rail de la coquille reproduit celui de la maquette (même ordre, mêmes classes, mêmes icônes)', () => {
    const ouverts = new Set(['/studio/projets', '/veille', '/adsmap', '/assets', '/jarvis', '/brands', '/settings']);
    const marque = { id: 'b1', nom: 'Neva' };
    const entrees = entreesRail({ ouverts, marque }).map((e) => (e.cle === 'resultats' ? { ...e, pastille: { classe: 'badge' as const, valeur: '', libelle: 'Un lot à conclure' } } : e));
    const espace = entreesRailEspace({ ouverts, marque }).map((e) => (e.cle === 'marque' ? { ...e, pastille: { classe: 'rbadge' as const, valeur: '6', libelle: '6 étapes à compléter' } } : e));
    const d: DonneesCoquille = {
      entrees, espace, marque: { ...marque, logoUrl: 'https://x/logo.png', imageUrl: null }, marques: [{ id: 'b1', nom: 'Neva' }],
      peutGererMarques: true, admin: true, passer: { titre: 'Passer à Plus', sous: '7 000 crédits / mois' }, railOuvert: true,
      utilisateur: CTX.utilisateur, espaceNom: 'GLX', credits: CTX.credits, nonLues: 4, deconnexion: async () => {},
    };
    const html = renderToStaticMarkup(<Coquille donnees={d}><div className="view" /></Coquille>);
    const p = parite(html, '_coquille', { selecteur: 'nav.rail', ignorer: ['.brandrow .logo'] });
    expect(p.rendu).toEqual(p.reference);
  });

  it('la garde voit un écart · retirer une entrée du rail la fait tomber', () => {
    const ref = squelette(fragmentReference('_coquille'), { selecteur: 'nav.rail' });
    const amputé = fragmentReference('_coquille').replace(/<a href="#veille"[\s\S]*?<\/a>/, '');
    expect(squelette(amputé, { selecteur: 'nav.rail' })).not.toEqual(ref);
  });

  it('« Crédits & factures » reproduit la maquette', () => {
    const html = rendre(
      <Utilisation
        sousNav={[{ href: '/settings', libelle: 'Espace' }, { href: '/team', libelle: 'Équipe' }, { href: '/partenaires', libelle: 'Partenaires' }, { href: '/connections', libelle: 'Connexions' }, { href: '/usage', libelle: 'Crédits & factures' }, { href: '/billing', libelle: 'Forfaits' }]}
        plan={{ nom: 'Plan Studio', dotation: 2000, solde: 1240, illimite: false, part: 62, detail: 'renouvellement le 1er novembre' }}
        peutChangerPlan
        semaines={Array.from({ length: 12 }, (_, i) => ({ hauteur: 30 + i, enCours: i === 11 }))}
        couts={[{ libelle: 'A', credits: 1 }, { libelle: 'B', credits: 4 }, { libelle: 'C', credits: 6 }, { libelle: 'D', credits: 10 }]}
        factures={['Octobre', 'Septembre', 'Août'].map((m, i) => ({ periode: m, detail: 'Plan Studio', montant: '149 €', statut: { libelle: i ? 'Payée' : 'À venir', classe: i ? 'g' as const : '' as const }, url: 'https://f/x.pdf' }))}
      />,
    );
    const p = parite(html, 'utilisation');
    expect(p.rendu).toEqual(p.reference);
  });
});

/* ───────────────────────── écrans exclusifs · la page V5 est retirée ───────────────────────── */

/** Les adresses publiques servies par l'ancienne interface (pages hors `(spatial)`, groupes retirés). */
function adressesV5(): string[] {
  const out: string[] = [];
  const app = join(WEB, 'app');
  const parcourir = (d: string, segs: string[]) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) { if (n !== '(spatial)' && n !== 'api') parcourir(p, /^\(.*\)$/.test(n) ? segs : [...segs, n]); }
      else if (/^page\.tsx?$/.test(n)) out.push('/' + segs.join('/'));
    }
  };
  parcourir(app, []);
  return out;
}
const pagesV5Restantes = (liste: ReadonlyArray<{ chemin: string; exclusif?: true }>) => {
  const v5 = new Set(adressesV5());
  return liste.filter((e) => e.exclusif && v5.has(e.chemin)).map((e) => e.chemin);
};

describe('Spatial · un écran exclusif n’a plus de page dans l’ancienne interface', () => {
  it('la garde voit une page V5 restante', () => {
    expect(adressesV5()).toContain('/credits');
    expect(pagesV5Restantes([{ chemin: '/credits', exclusif: true }, { chemin: '/dashboard' }])).toEqual(['/credits']);
  });
  it('aucun écran déclaré exclusif ne garde sa page V5', () => {
    expect(pagesV5Restantes(ECRANS_SPATIAUX), 'écran exclusif · supprimer sa page V5 (le middleware le sert toujours par Spatial)').toEqual([]);
  });
});
