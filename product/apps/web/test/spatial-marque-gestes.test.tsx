// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CHAMPS_PROFIL_MARQUE, champsModifiablesMarque, styleVisuelMarque } from '@tiktrends/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('next/navigation', () => ({
  usePathname: () => '/brands/b1/identite',
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Identite, type GestionIdentite } from '../spatial/vues/marque/Identite';
import { Personas, type GestionPersonas } from '../spatial/vues/marque/Personas';
import { Offre } from '../spatial/vues/marque/Offre';
import { sousNavMarque, type PropsFaviconMarque, type PropsSyncSite } from '../spatial/vues/marque/base';

/**
 * Vague 2 · les gestes de la fiche V5 `/brands/[id]` portés dans Spatial · on
 * REND la vue et on lit le HTML : modifier un champ DÉJÀ rempli, style visuel
 * (prix annoncé avant le clic), logos de la charte, pistes de concurrents,
 * supprimer la marque ; retirer un persona, un scénario, un produit ; visuel
 * de scénario payant ; import du catalogue ; boutique Shopify.
 */

const CTX: CtxSpatial = {
  utilisateur: { nom: 'T P', initiales: 'TP', email: 't@x.fr', role: 'Propriétaire' }, credits: { solde: 1, dotation: 1, illimite: false },
  nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const rendre = (n: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>);
const action = async () => {};
const favicon: PropsFaviconMarque = { brandId: 'b1', image: null, initiale: 'A', titre: 't', detail: 'd', recuperer: null, raisonRecuperer: null };
const sync: PropsSyncSite = { brandId: 'b1', site: 'a.fr', relancer: null, raison: 'r', cout: 5 };
const nav = sousNavMarque('b1');
const dom = (html: string) => { const d = document.createElement('div'); d.innerHTML = html; return d; };
const bloc = (html: string, geste: string) => {
  const e = dom(html).querySelector(`[data-geste="${geste}"]`);
  expect(e, `le bloc « ${geste} » est absent`).not.toBeNull();
  return e!;
};

const VALEURS = { id: 'b1', name: 'Gruns', url: 'gruns.co', description: 'Des gummies', usp: '', audience: 'Adultes pressés', competitors: 'Ag1\nHuel', colors: '#111, #222' };

function identite(g: Partial<GestionIdentite> = {}) {
  const gestion: GestionIdentite = {
    nom: 'Gruns',
    champs: champsModifiablesMarque(VALEURS),
    edition: { action, valeurs: VALEURS },
    style: { ...styleVisuelMarque({ style: 'éditorial', aEviter: ['stock'] }), analyser: action, cout: 5, raison: null, corriger: action },
    logos: { logos: ['https://a.fr/logo.png', 'https://a.fr/logo2.png'], defaut: 'https://a.fr/logo.png', apercus: {}, couleurs: ['#111'], polices: [], enregistrer: async () => ({ ok: true }) },
    sourcing: { prix: '5 crédits', proposer: async () => ({ names: [] }), ajouter: async () => ({ ok: true }), raison: null },
    connexions: [{ label: 'Meta' }],
    supprimer: action,
    retours: {},
    ...g,
  };
  return rendre(
    <Identite sousNav={nav} brandId="b1" favicon={favicon} sync={sync} identite={{ complet: true, lignes: [] }} couleurs={[]} typo={[]} ton={{ complet: true, lignes: [] }} vocabulaire={[]} gestion={gestion} />,
  );
}

describe('Spatial · Identité · toute la fiche se modifie, même déjà remplie', () => {
  it('chaque champ du formulaire V5 a sa ligne · « Modifier » quand il est rempli, « Compléter » sinon', () => {
    const e = bloc(identite(), 'fiche-complete');
    const lignes = [...e.querySelectorAll('.todo .row')];
    expect(lignes).toHaveLength(CHAMPS_PROFIL_MARQUE.length);
    const bouton = (titre: string) => lignes.find((r) => r.querySelector('strong')?.textContent === titre)!.querySelector('button')!;
    expect(bouton('Description').textContent).toBe('Modifier');
    expect(bouton('Promesse').textContent).toBe('Compléter');
    expect(bouton('Nom').getAttribute('aria-label')).toBe('Modifier · Nom');
    // Concurrents · une ligne par concurrent, résumée en une phrase.
    expect(lignes.find((r) => r.querySelector('strong')?.textContent === 'Concurrents')!.querySelector('small')!.textContent).toBe('Ag1, Huel');
  });
  it('la liste couvre EXACTEMENT les champs de `updateBrandAction`', () => {
    const src = readFileSync(join(process.cwd(), 'app/actions/brands.ts'), 'utf8');
    const corps = src.slice(src.indexOf('export async function updateBrandAction'), src.indexOf('export async function renameBrandAction'));
    const lus = [...corps.matchAll(/formData\.get\('(\w+)'\)/g)].map((m) => m[1]!).filter((c) => c !== 'id');
    expect([...new Set(lus)].sort()).toEqual([...CHAMPS_PROFIL_MARQUE].sort());
  });
});

describe('Spatial · Identité · style visuel, logos, concurrents, suppression', () => {
  it('« Analyser le style » annonce son prix AVANT le clic, le style déduit est lisible et corrigeable', () => {
    const e = bloc(identite(), 'style-visuel');
    expect(e.textContent).toContain('Analyser le style · 5 crédits');
    expect([...e.querySelectorAll('dt')].map((x) => x.textContent)).toEqual(['Style', 'À éviter']);
    expect([...e.querySelectorAll('button')].map((b) => b.textContent)).toContain('Corriger');
  });
  it('sans IA · l’analyse est fermée avec sa raison', () => {
    const e = bloc(identite({ style: { ...styleVisuelMarque(null), analyser: null, cout: 5, raison: 'IA non configurée sur le serveur', corriger: action } }), 'style-visuel');
    const b = [...e.querySelectorAll('button')].find((x) => x.textContent?.startsWith('Analyser'))!;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('title')).toBe('IA non configurée sur le serveur');
    expect(e.textContent).toContain('Aucun style déduit');
  });
  it('logos · le défaut est marqué, l’autre peut le devenir, chacun se retire, un logo s’ajoute par son adresse', () => {
    const e = bloc(identite(), 'logos');
    expect(e.querySelectorAll('.npr')).toHaveLength(2);
    expect(e.querySelector('.pill.g')?.textContent).toBe('Par défaut');
    expect([...e.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual([
      'Retirer le logo https://a.fr/logo.png', 'Par défaut', 'Retirer le logo https://a.fr/logo2.png', 'Ajouter',
    ]);
  });
  it('pistes de concurrents · prix sur le bouton, aucun ajout automatique', () => {
    const e = bloc(identite(), 'sourcing-concurrents');
    expect(e.querySelector('button')?.textContent).toBe('Proposer des concurrents · 5 crédits');
    expect(e.textContent).toContain('Aucun ajout automatique');
  });
  it('comptes branchés · ceux qui le sont réellement, et le chemin vers Connexions', () => {
    const e = bloc(identite(), 'connexions-marque');
    expect([...e.querySelectorAll('.pill.g')].map((x) => x.textContent)).toEqual(['Meta']);
    expect(e.querySelector('a[href="/connections"]')).not.toBeNull();
    expect(bloc(identite({ connexions: [] }), 'connexions-marque').textContent).toContain('Aucun compte branché');
  });
  it('supprimer la marque · bouton nommé, confirmé avant envoi', () => {
    const e = bloc(identite(), 'supprimer-marque');
    expect(e.querySelector('button')?.getAttribute('aria-label')).toBe('Supprimer la marque Gruns');
  });
});

describe('Spatial · Personas · retirer, visuel de scénario payant', () => {
  const P = { id: 'p1', initiale: 'A', teinte: '#111', nom: 'Anna, 30 ans', statut: { libelle: 'Validé', classe: 'g' as const }, description: 'd', desirs: [], freins: [], objections: [], citations: [], sources: 0 };
  const vue = (g: Partial<GestionPersonas> = {}) => rendre(
    <Personas sousNav={nav} brandId="b1" nom="A" personas={[P]} scenarios={[]} jarvis={null} creerPub={null} ajouterPersona={action} ajouterScenario={action} retours={{}}
      gestion={{ retirerPersona: action, retirerScenario: action, scenarios: [{ id: 's1', titre: 'Matin', contexte: 'cuisine', image: null }, { id: 's2', titre: 'Soir', contexte: null, image: 'https://x/s.png' }], visuel: { appel: async () => ({}), cout: 4, raison: null }, ...g }} />,
  );
  it('le persona affiché se retire', () => {
    expect(vue()).toContain('aria-label="Retirer le persona Anna, 30 ans"');
  });
  it('chaque scénario · visuel au prix annoncé, régénération quand il existe, retrait', () => {
    const e = bloc(vue(), 'scenarios');
    const boutons = [...e.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(boutons).toEqual(['Générer le visuel · 4 crédits', 'Retirer le scénario Matin', 'Régénérer · 4 crédits', 'Retirer le scénario Soir']);
  });
  it('sans moteur d’image · le visuel est fermé avec sa raison', () => {
    const e = bloc(vue({ visuel: { appel: null, cout: null, raison: 'La génération d’image n’est pas activée' } }), 'scenarios');
    const b = [...e.querySelectorAll('button')].find((x) => x.textContent?.startsWith('Générer'))!;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('title')).toBe('La génération d’image n’est pas activée');
  });
});

describe('Spatial · Offre · retirer un produit, importer le catalogue, boutique Shopify', () => {
  const vue = (raison: string | null) => rendre(
    <Offre sousNav={nav} brandId="b1" sync={sync} produits={[{ id: 'p1', nom: 'Gummies', image: null, detail: 'd', complet: true }]} aCompleter={null} detail={null} ajouter={action} shopify={null} retours={{}}
      gestion={{ retirer: action, importer: { action: raison ? null : action, cout: 5, raison }, boutique: { domaine: null, synchroniser: async () => ({}) } }} />,
  );
  it('chaque produit se retire', () => {
    expect(vue(null)).toContain('aria-label="Retirer le produit Gummies"');
  });
  it('l’import depuis le site annonce son prix, et se ferme sans site avec la raison', () => {
    expect(bloc(vue(null), 'import-produits').textContent).toContain('Importer depuis le site · 5 crédits');
    const b = [...bloc(vue('Renseigne le site de la marque pour importer'), 'import-produits').querySelectorAll('button')].find((x) => x.textContent?.startsWith('Importer'))!;
    expect(b.disabled).toBe(true);
    expect(b.getAttribute('title')).toBe('Renseigne le site de la marque pour importer');
  });
  it('sans boutique · le domaine se saisit et « Connecter » l’importe', () => {
    const e = bloc(vue(null), 'import-produits');
    expect(e.querySelector('input[aria-label="Domaine de la boutique Shopify"]')).not.toBeNull();
    expect([...e.querySelectorAll('button')].map((b) => b.textContent)).toContain('Connecter');
  });
});
