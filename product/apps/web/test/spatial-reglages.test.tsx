// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { DESCRIPTIF_FORMULES, ORDRE_FORMULES, boutonFormule } from '@tiktrends/core';
import { parite } from './spatial/parite';

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings',
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Espace } from '../spatial/vues/reglages/Espace';
import { Equipe } from '../spatial/vues/reglages/Equipe';
import { Connexions } from '../spatial/vues/reglages/Connexions';
import { Forfaits } from '../spatial/vues/reglages/Forfaits';
import { Partenaires } from '../spatial/vues/reglages/Partenaires';
import { SOUS_NAV_REGLAGES } from '../spatial/vues/reglages/sous-nav';

/**
 * Parité de structure des écrans Réglages avec la maquette
 * (`docs/spatial/reference/<route>.html`) · props aux MÊMES nombres
 * d'éléments que le fragment. Chaque `ignorer` dit pourquoi : il ne couvre que
 * du contenu fictif de la maquette, jamais un bloc qu'on aurait mal reproduit.
 */

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Test Personne', initiales: 'TP', email: 't@x.fr', role: 'Propriétaire' },
  credits: { solde: 120, dotation: 200, illimite: false },
  nonLues: 4, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const rendre = (n: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>).replace(/^(?:<link[^>]*>)+/, '');
const action = async () => {};
const formules = ['a', 'b', 'c', 'd'].map((nom, i) => ({ nom, actuelle: i === 1, valeur: 'v', detail: 'd' }));

describe('Spatial · Réglages · la sous-navigation suit la maquette', () => {
  it('six sous-sections, dans l’ordre de la maquette (Partenaires après Équipe)', () => {
    expect(SOUS_NAV_REGLAGES.map((x) => x.libelle)).toEqual(['Espace', 'Équipe', 'Partenaires', 'Connexions', 'Crédits & factures', 'Forfaits']);
  });
});

describe('Spatial · Réglages · parité de structure avec la maquette', () => {
  it('« Espace » reproduit la maquette', () => {
    const html = rendre(
      <Espace
        sousNav={SOUS_NAV_REGLAGES} espace="E" plan="Core"
        marques={[{ id: 'b1', initiale: 'A', nom: 'a', detail: 'd', fond: null }, { id: 'b2', initiale: 'B', nom: 'b', detail: 'd', fond: 'linear-gradient(135deg,#111,#222)' }]}
        inclus="Jusqu’à 3 marques" ajouter="/brands/new" formules={formules}
        preferences={{ langue: 'fr', fuseau: 'Europe/Paris', devise: 'Euro (€)', nommage: 'X_Y' }}
        video="/studio/projets/nouveau?type=video"
      />,
    );
    // · boutons « Marque en plus » · aucune option payante n'existe dans l'offre (la maquette les retire aussi sans option) ;
    // · dernière carte · la maquette montre « Limite atteinte », état qui n'existe pas (aucune limite de marques appliquée) · ici, la création réelle ;
    // · `.soon .ad` · une créa fictive décorative, sans source.
    const p = parite(html, 'reglages', { ignorer: ['.grid2 > section:first-child > div:first-child > div:last-child', '.brands > .bcard:last-child', '.soon .ad'] });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Équipe » reproduit la maquette', () => {
    const html = rendre(
      <Equipe
        sousNav={SOUS_NAV_REGLAGES} plan="Core" formules={formules} suivante={{ libelle: 'Plus · 7 000 crédits', href: '/billing' }}
        membres={[0, 1, 2, 3].map((i) => ({ cle: `m${i}`, initiales: 'AB', teinte: '#111', nom: 'a', email: `m${i}@x.fr`, role: 'Membre', moi: i === 0 }))}
        invitations={[]}
        roles={[{ valeur: 'admin', libelle: 'Admin' }, { valeur: 'member', libelle: 'Membre' }, { valeur: 'client_viewer', libelle: 'Client (lecture)' }]}
        tousRoles={['Propriétaire', 'Admin', 'Membre', 'Client (lecture)']}
        inviter={action} revoquer={action} retours={{}}
      />,
    );
    // Les boutons de la tuile des sièges · « Ajouter un siège » n'existe pas
    // dans l'offre (aucun siège payant) · seul le lien vers la formule suivante reste.
    const p = parite(html, 'equipe', { ignorer: ['.view > section:nth-of-type(1) > div:first-child > div:last-child'] });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Connexions » reproduit la maquette', () => {
    const html = rendre(
      <Connexions
        sousNav={SOUS_NAV_REGLAGES} marque="A" branchables={3}
        cartes={[
          { cle: 'meta', groupe: 'g', nom: 'Meta Ads', description: 'd', connecte: false, resume: null, etape1: true },
          { cle: 'shopify', groupe: 'g', nom: 'Shopify', description: 'd', connecte: true, resume: 'r', etape1: false },
          { cle: 'gdrive', groupe: 'g', nom: 'Google Drive', description: 'd', connecte: false, resume: null, etape1: false },
          { cle: 'dropbox', groupe: 'g', nom: 'Dropbox', description: 'd', connecte: false, resume: null, etape1: false },
        ]}
        meta={{ oauth: false, connecter: async () => ({}), synchroniser: async () => ({}), deconnecter: async () => ({}), choisirCompte: async () => ({}), comptes: [], compte: null }}
        shopify={{ oauth: false, connecter: async () => ({}), synchroniser: async () => ({}), deconnecter: async () => ({}), domaine: 'x.myshopify.com' }}
        drive={{ connexion: '/api/oauth/google', synchroniser: async () => ({}), deconnecter: async () => ({}), dossier: null }}
        retours={{}}
      />,
    );
    const p = parite(html, 'connexions');
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Forfaits & crédits » reproduit la maquette', () => {
    const F = (cle: string, i: number, n: number, o: Partial<{ parMois: boolean; radar: boolean; actuelle: boolean; miseEnAvant: boolean }>) => ({
      cle, nom: cle, prix: '1 €', parMois: true, credits: '1', fonctions: Array.from({ length: n }, (_, k) => `f${i}${k}`), radar: true, actuelle: false, miseEnAvant: false,
      bouton: { type: 'desactive' as const, libelle: 'x' } as ReturnType<typeof boutonFormule>, ...o,
    });
    // Le bouton « Passer à » de la formule mise en avant · le vrai calcul du noyau.
    const passer = boutonFormule({ formule: 'plus', actuelle: 'core', proprietaire: true, paiement: true, abonne: false, achetable: true, libelle: 'Plus', prix: 1 });
    expect(passer.type).toBe('abonnement');
    const html = rendre(
      <Forfaits
        sousNav={SOUS_NAV_REGLAGES}
        plan={{ nom: 'Core', dotation: 2000, solde: 1200, illimite: false, part: 60 }}
        rythme={{ parJour: 40, jours: 30, suffisant: true }}
        formules={[F('a', 0, 4, { radar: false }), F('b', 1, 5, { actuelle: true }), { ...F('c', 2, 6, { miseEnAvant: true }), bouton: passer }, F('d', 3, 4, { parMois: false })]}
        portail={action} abonnement={action}
        packs={[1, 2, 3].map((i) => ({ key: `k${i}`, credits: '1', prix: '1 €', economie: i > 1 ? '−10 %' : null, equivalence: 'e', nouveauSolde: '2' }))}
        acheter={action} raisonAchat={null}
        faq={[1, 2, 3].map((i) => ({ question: `q${i}`, reponse: 'r' }))}
        retours={{}}
      />,
    );
    const p = parite(html, 'forfaits');
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Accès partenaires » · en-tête et sous-navigation de la maquette, état vide honnête', () => {
    const html = rendre(<Partenaires sousNav={SOUS_NAV_REGLAGES} equipe="/team" />);
    for (const selecteur of ['header.top', 'nav.subnav']) {
      const p = parite(html, 'partenaires', { selecteur });
      expect(p.rendu, selecteur).toEqual(p.reference);
    }
    // Aucune donnée de partenaire n'existe · l'état vide de la maquette, jamais ses exemples.
    expect(html).toContain('Aucun partenaire pour l’instant');
    expect(html).not.toMatch(/Sarah|Mehdi|Enregistrer les droits|Révoquer/);
  });
});

describe('Spatial · Forfaits · l’offre est celle de l’application, mot pour mot', () => {
  // Vague 2 · l'écran V5 `/billing` est retiré · son offre (`FEATURES`, `HINT`)
  // est figée ici, mot pour mot · une divergence d'offre fait tomber la garde
  // (aucun changement d'offre sans mandat).
  const OFFRE_V5: Record<string, { accroche: string; fonctions: string[] }> = {
    starter: { accroche: 'Pour démarrer et explorer', fonctions: ['Dashboard & Analytics', 'Tagging manuel', '1 marque', 'Support e-mail'] },
    core: { accroche: 'Le cœur de l’offre créative', fonctions: ['Tout Starter', 'Studios (pub, image, vidéo, textes)', 'Jarvis · règles maison', 'Radar & Veille', 'Jusqu’à 3 marques'] },
    plus: { accroche: 'Pour les agences multi-marques', fonctions: ['Tout Core', 'Marques illimitées', 'Membres & rôles avancés', 'Clone de pubs gagnantes', 'Priorité de génération'] },
    business: { accroche: 'Volumes et marque blanche', fonctions: ['Tout Plus', 'Marque blanche complète', 'Accès API', 'Accompagnement dédié', 'Volumes sur mesure'] },
  };
  it('chaque fonction et chaque accroche de formule est celle de l’offre V5 (aucune divergence d’offre)', () => {
    expect(Object.fromEntries(ORDRE_FORMULES.map((k) => [k, { accroche: DESCRIPTIF_FORMULES[k].accroche, fonctions: [...DESCRIPTIF_FORMULES[k].fonctions] }]))).toEqual(OFFRE_V5);
  });
  it('le nombre de marques annoncé reprend la ligne « marques » de l’offre V5', () => {
    for (const k of ORDRE_FORMULES) {
      const m = DESCRIPTIF_FORMULES[k].marques;
      const nombre = (f: string) => /^(\d+ marques?|Jusqu’à \d+ marques|Marques illimitées)$/.test(f);
      const ligne = DESCRIPTIF_FORMULES[k].fonctions.find(nombre);
      // Business hérite de Plus (« Tout Plus ») · son nombre est celui de Plus.
      expect(ligne ?? DESCRIPTIF_FORMULES.plus.fonctions.find(nombre), k).toBe(m);
    }
  });
});

const WEB = join(__dirname, '..');
const fichiers = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? fichiers(p) : /\.tsx?$/.test(n) ? [p] : []; });

describe('Spatial · Réglages · aucune donnée d’exemple ni ponctuation interdite', () => {
  const sp = join(WEB, 'app', '(spatial)', 'sp');
  const sources = [...fichiers(join(WEB, 'spatial', 'vues', 'reglages')), ...['settings', 'team', 'connections', 'billing', 'usage'].flatMap((d) => fichiers(join(sp, d)))];
  it('aucun nom, prix ou « Prototype » de la maquette dans les vues et les pages', () => {
    const fautes = sources.flatMap((f) => {
      const s = readFileSync(f, 'utf8');
      return ['Neva', 'Sarah', 'Mehdi', 'Kevin', 'glx.fr', 'Agence GLX', 'Prototype', '1 240', '149 €', '349 €', 'Visa', '4242', 'Studio · actuel'].filter((m) => s.includes(m)).map((m) => `${f.split('/web/')[1]} · ${m}`);
    });
    expect(fautes).toEqual([]);
  });
  it('aucun tiret cadratin ni « Trendtrack » dans le texte', () => {
    expect(sources.filter((f) => /—|Trendtrack/i.test(readFileSync(f, 'utf8')))).toEqual([]);
  });
});
