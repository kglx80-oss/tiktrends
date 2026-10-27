// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CONNECTEURS_DISPONIBLES, feuilleDeRouteConnecteurs, journalCredits, panneauStockage, servicesEspace } from '@tiktrends/core';
import { jargonEcran, texteVisible } from './helpers/jargon-ecran';

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings',
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
  useSearchParams: () => new URLSearchParams(),
}));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Espace, type GestionEspace } from '../spatial/vues/reglages/Espace';
import { Utilisation } from '../spatial/vues/reglages/Utilisation';
import { Connexions } from '../spatial/vues/reglages/Connexions';
import { SOUS_NAV_REGLAGES } from '../spatial/vues/reglages/sous-nav';

/**
 * Vague 2 · les gestes de l'écran V5 `/settings` et `/usage` portés dans
 * Spatial · on REND la vue et on lit le HTML (nom de l'espace, services
 * activés, stockage, journal des crédits). Reprend les intentions des recettes
 * #106 et #106b (aucune variable d'environnement ni terme d'infrastructure à
 * l'écran d'un client, l'équipe de la plateforme garde ses consignes).
 */

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Test Personne', initiales: 'TP', email: 't@x.fr', role: 'Propriétaire' },
  credits: { solde: 120, dotation: 200, illimite: false },
  nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const rendre = (n: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>);
const actions = { configurer: async () => ({}), tester: async () => ({}), etat: async () => ({}), ranger: async () => ({}) };
const renommer = async () => ({ ok: true });

const VARIABLES = ['ANTHROPIC_API_KEY', 'TRENDTRACK_API_KEY', 'FAL_KEY', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_ENDPOINT', 'HIGGSFIELD_API_KEY', 'SMTP_URL', 'KLAVIYO_API_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'SLACK_BOT_TOKEN'];
const vides = Object.fromEntries(VARIABLES.map((v) => [v, '']));

function espace(env: Record<string, string>, p: { operateur: boolean; actif: boolean; renommer?: GestionEspace['renommer'] }) {
  const gestion: GestionEspace = {
    renommer: p.renommer === undefined ? renommer : p.renommer,
    services: servicesEspace(env),
    stockage: { ...panneauStockage({ actif: p.actif, operateur: p.operateur }), actif: p.actif, operateur: p.operateur, actions },
  };
  return rendre(
    <Espace
      sousNav={SOUS_NAV_REGLAGES} espace="Agence Démo" plan="Core" marques={[]} inclus="1 marque" ajouter={null} formules={[]}
      preferences={{ langue: 'fr', fuseau: 'Europe/Paris', devise: 'Euro (€)', nommage: null }} video={null} gestion={gestion}
    />,
  );
}
const bloc = (html: string, geste: string) => {
  const d = document.createElement('div');
  d.innerHTML = html;
  const e = d.querySelector(`[data-geste="${geste}"]`);
  expect(e, `le bloc « ${geste} » est absent`).not.toBeNull();
  return e!;
};

describe('Spatial · Espace · nom de l’espace', () => {
  it('le champ porte le nom réel et s’enregistre par l’action existante', () => {
    const e = bloc(espace(vides, { operateur: false, actif: false }), 'nom-espace');
    const champ = e.querySelector('input[name="name"]') as HTMLInputElement;
    expect(champ.getAttribute('value')).toBe('Agence Démo');
    expect(champ.disabled).toBe(false);
    expect(e.querySelector('button[type="submit"]')?.textContent).toBe('Enregistrer');
  });
  it('sans droit · le champ et le bouton sont fermés, avec la raison', () => {
    const e = bloc(espace(vides, { operateur: false, actif: false, renommer: null }), 'nom-espace');
    expect((e.querySelector('input[name="name"]') as HTMLInputElement).disabled).toBe(true);
    expect(e.querySelector('button[type="submit"]')?.getAttribute('title')).toMatch(/administrateurs/);
  });
});

describe('Spatial · Espace · services activés (recette #106)', () => {
  it('l’état suit la configuration · 9 services, un seul branché', () => {
    const e = bloc(espace({ ...vides, FAL_KEY: 'factice' }, { operateur: false, actif: false }), 'services');
    expect(e.querySelectorAll('.npr')).toHaveLength(9);
    expect([...e.querySelectorAll('.pill.g')].map((x) => x.textContent)).toEqual(['Branché']);
    expect(e.querySelector('.sech')?.textContent).toContain('1 sur 9');
  });
  it('aucun nom de variable ni fournisseur interne à l’écran', () => {
    const html = bloc(espace(vides, { operateur: false, actif: false }), 'services').outerHTML;
    for (const v of VARIABLES) expect(html, `« ${v} » est affiché`).not.toContain(v);
    expect(html).not.toMatch(/trendtrack/i);
  });
  it('le paiement exige ses deux clés, le stockage ses quatre', () => {
    const s = servicesEspace({ STRIPE_SECRET_KEY: 'x', S3_BUCKET: 'b', S3_ACCESS_KEY_ID: 'a', S3_SECRET_ACCESS_KEY: 's', S3_ENDPOINT: 'e' });
    expect(s.find((x) => x.cle === 'paiement')?.branche).toBe(false);
    expect(s.find((x) => x.cle === 'stockage')?.branche).toBe(true);
  });
});

describe('Spatial · Espace · stockage (recette #106b)', () => {
  it('administrateur d’espace (client) inactif · aucun terme d’infrastructure, qui agit est dit, le ticket est un lien', () => {
    const e = bloc(espace(vides, { operateur: false, actif: false }), 'stockage');
    const t = texteVisible(e.outerHTML);
    expect(t).toMatch(/Stockage des fichiers lourds À ACTIVER/);
    expect(jargonEcran(t), `jargon à l’écran : ${t}`).toEqual([]);
    expect(t).toMatch(/côté plateforme/);
    expect(t).toContain('seuls ses admins le lisent');
    expect(e.querySelector('a[href="/support"]')?.textContent).toBe('Ouvrir un ticket interne');
    expect(e.querySelectorAll('button')).toHaveLength(0);
  });
  it('équipe de la plateforme inactive · garde ses consignes techniques', () => {
    const t = texteVisible(bloc(espace(vides, { operateur: true, actif: false }), 'stockage').outerHTML);
    expect(t).toMatch(/Stockage objet CLÉS ABSENTES/);
    expect(t).toContain('.env.deploy');
  });
  it('équipe de la plateforme, stockage actif · préparer et tester le stockage', () => {
    const e = bloc(espace(vides, { operateur: true, actif: true }), 'stockage');
    expect([...e.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Configurer le stockage privé (CORS)', 'Tester le stockage']);
  });
  it('client, stockage actif · aucun bouton de préparation (réservé à la plateforme)', () => {
    const e = bloc(espace(vides, { operateur: false, actif: true }), 'stockage');
    expect(texteVisible(e.outerHTML)).toMatch(/ACTIVÉ/);
    expect(e.querySelectorAll('button')).toHaveLength(0);
  });
});

describe('Spatial · Crédits & factures · journal des mouvements (écran V5 `/usage`)', () => {
  const maintenant = new Date('2026-10-20T12:00:00Z');
  const depuis = new Date(maintenant.getTime() - 30 * 86_400_000);
  const lignes = [
    { id: 'a', delta: 200, reason: 'Allocation mensuelle', createdAt: new Date('2026-10-19T10:00:00Z') },
    { id: 'b', delta: -12, reason: 'adsmap:propose:xyz', createdAt: new Date('2026-10-18T10:00:00Z') },
    { id: 'c', delta: -4, reason: 'Image studio', createdAt: new Date('2026-10-17T10:00:00Z') },
  ];
  const j = journalCredits(lignes, { depuis, limite: 120, jours: 30, fuseau: 'Europe/Paris' });
  const vue = (journal: typeof j) => rendre(
    <Utilisation
      sousNav={SOUS_NAV_REGLAGES} plan={{ nom: 'Plan Core', dotation: 200, solde: 184, illimite: false, part: 92 }} peutChangerPlan={false}
      semaines={[]} couts={[]} factures={[]} journal={{ ...journal, ajoute: 200, consomme: 16 }}
    />,
  );

  it('chaque mouvement est listé, motif lisible, signe et famille', () => {
    const e = bloc(vue(j), 'journal');
    const rangees = [...e.querySelectorAll('.mrow')].map((r) => texteVisible(r.innerHTML).trim());
    expect(rangees).toHaveLength(3);
    expect(rangees[0]).toMatch(/^Allocation mensuelle Allocation .* \+200$/);
    expect(rangees[1]).toMatch(/^Adsmap · propositions de concepts Adsmap .* -12$/);
    expect(e.querySelectorAll('.pill.g')).toHaveLength(1);
  });
  it('la répartition ne compte que les débits, plus gros d’abord', () => {
    const e = bloc(vue(j), 'repartition');
    expect([...e.querySelectorAll('.ev')].map((x) => texteVisible(x.innerHTML).trim())).toEqual(['Adsmap 12', 'Studios 4']);
    expect(texteVisible(e.innerHTML)).toContain('16 débités');
  });
  it('sans mouvement · état vide honnête et lien vers les Studios', () => {
    const e = bloc(vue(journalCredits([], { depuis, limite: 120, jours: 30, fuseau: 'Europe/Paris' })), 'journal');
    expect(e.textContent).toContain('Aucun mouvement pour l’instant');
    expect(e.querySelector('a[href="/studio/projets"]')).not.toBeNull();
  });
});

describe('Spatial · Connexions · feuille de route (écran V5 `/connections`, N09)', () => {
  const vue = () => rendre(
    <Connexions
      sousNav={SOUS_NAV_REGLAGES} marque="M" cartes={[]} branchables={CONNECTEURS_DISPONIBLES.length} retours={{}}
      meta={{ oauth: false, connecter: async () => ({}), synchroniser: async () => ({}), deconnecter: async () => ({}), choisirCompte: async () => ({}), comptes: [], compte: null }}
      shopify={{ oauth: false, connecter: async () => ({}), synchroniser: async () => ({}), deconnecter: async () => ({}), domaine: null }}
      drive={{ connexion: null, synchroniser: async () => ({}), deconnecter: async () => ({}), dossier: null }}
      feuilleDeRoute={feuilleDeRouteConnecteurs(['Dropbox'])}
    />,
  );
  it('les connecteurs à venir sont listés, sans aucun bouton', () => {
    const e = bloc(vue(), 'feuille-de-route');
    const noms = [...e.querySelectorAll('.chip')].map((x) => x.textContent);
    expect(noms).toContain('TikTok Ads');
    expect(noms).toHaveLength(39);
    expect(e.querySelectorAll('button, a')).toHaveLength(0);
    expect(e.querySelector('.sech')?.textContent).toContain('39 connecteurs en préparation');
  });
  it('un connecteur disponible, ou qui a déjà sa carte, n’y reparaît jamais', () => {
    const noms = [...bloc(vue(), 'feuille-de-route').querySelectorAll('.chip')].map((x) => x.textContent);
    for (const n of [...CONNECTEURS_DISPONIBLES, 'Dropbox']) expect(noms, `« ${n} » listé « Bientôt »`).not.toContain(n);
  });
});
