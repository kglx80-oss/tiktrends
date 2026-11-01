// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Stockage · l'écran d'inventaire des orphelins · trois gardes.
 *  1. LECTURE SEULE · on rend le HTML (état rempli ET état partiel) · aucun
 *     bouton, aucun formulaire, aucun geste de suppression ; et ni la page, ni
 *     la vue, ni le lecteur n'importent une fonction de suppression.
 *  2. ACCÈS · la porte plateforme (`porteAdmin` · admin de l'espace ET
 *     fondateur) refuse tout autre visiteur AVANT la moindre lecture.
 *  3. RECENSEMENT FERMÉ · tout appelant de `putObject`/`presignPutUrl` dans
 *     le code est recensé (écrivain d'une colonne, ou appelant sans colonne).
 */
const h = vi.hoisted(() => ({
  session: null as unknown,
  fondateur: false,
  lectures: [] as string[],
}));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error(`REDIRECT ${u}`); }, usePathname: () => '/admin/stockage', useRouter: () => ({ push() {}, refresh() {} }) }));
vi.mock('@tiktrends/db', () => ({ db: undefined, schema: new Proxy({}, { get: () => new Proxy({}, { get: () => ({}) }) }), sql: Object.assign(() => ({}), { identifier: () => ({}) }) }));
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('../lib/founder', () => ({ isFounder: () => h.fondateur }));
vi.mock('../lib/settings', () => ({ getPlanConfig: async () => { h.lectures.push('tarifs'); throw new Error('lecture interdite avant la porte'); } }));
vi.mock('../lib/stockage-inventaire', () => ({ chargerInventaireStockage: async () => { h.lectures.push('inventaire'); throw new Error('lecture interdite avant la porte'); } }));

import {
  APPELANTS_DEPOT_SANS_COLONNE, RECENSEMENT_REFERENCES_STOCKAGE, inventaireOrphelins, vueInventaireStockage, type ObjetStocke,
} from '@tiktrends/core';
import { Stockage } from '../spatial/vues/admin/Stockage';
import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import StockagePage from '../app/(spatial)/sp/admin/stockage/page';

const WEB = join(__dirname, '..');
const PRODUCT = join(WEB, '..', '..');
const lire = (p: string) => readFileSync(join(PRODUCT, p), 'utf8');

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 1, dotation: 2, illimite: false }, nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const B = { payants: 3, actualise: 'à l’instant' };
const rendre = (n: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>);
const doc = (html: string) => { const t = document.createElement('template'); t.innerHTML = html; return t.content; };

const WS = 'a1111111-2222-4333-8444-55555555555b';
const MAINTENANT = new Date('2026-11-01T12:00:00Z');
const objets: ObjetStocke[] = [
  { cle: `assets/${WS}/1700-ab-abandonne.mp4`, taille: 5_000_000, modifieLe: new Date('2026-10-01T00:00:00Z') },
  { cle: `assets/${WS}/1700-ab-photo.png`, taille: 2_000, modifieLe: new Date('2026-10-01T00:00:00Z') },
];
const vue = (complete: boolean) => vueInventaireStockage(
  inventaireOrphelins(objets, { maintenant: MAINTENANT, espaces: new Set([WS]), references: new Set([`assets/${WS}/1700-ab-photo.png`]), referencesCompletes: complete }),
  { listeComplete: complete, erreurListe: complete ? null : 'borne atteinte', colonnesIncompletes: complete ? [] : ['generations.input_json'] },
  { [WS]: 'Maison Exemple' }, MAINTENANT,
);
/** Le contenu de l'écran, sous l'en-tête commun du Tour de contrôle (bandeau, sous-navigation). */
const contenu = (html: string) => { const d = doc(html); d.querySelectorAll('nav, .astrip, header').forEach((n) => n.remove()); return d; };
const GESTE = /supprim|purg|effac|nettoy|vider|corbeille|delete/i;

beforeEach(() => { h.session = null; h.fondateur = false; h.lectures = []; });

describe('Stockage · l’écran est en lecture seule', () => {
  it('état rempli · les chiffres réels, le plus gros candidat, et AUCUN bouton, formulaire ni geste de suppression', () => {
    const html = rendre(<Stockage bandeau={B} etat="pret" {...vue(true)} />);
    const d = contenu(html);
    expect(d.querySelector('[data-cle]')?.getAttribute('data-cle')).toBe(`assets/${WS}/1700-ab-abandonne.mp4`);
    expect(d.querySelectorAll('[data-cle]')).toHaveLength(1);
    expect(d.querySelector('[data-espace]')?.textContent).toContain('Maison Exemple');
    expect(d.querySelector('[data-motif="reference"]')?.textContent).toContain('1');
    expect(d.querySelectorAll('button, form, input, select, textarea, [formaction], [onclick]')).toHaveLength(0);
    expect([...d.querySelectorAll('a')].filter((a) => GESTE.test(`${a.textContent} ${a.getAttribute('href')}`))).toEqual([]);
    expect(html).not.toMatch(/Supprimer|Purger|Effacer|Nettoyer/);
    expect(html).not.toContain('—');
    expect(html).toContain('Rien n’est supprimé depuis cet écran.');
  });

  it('état partiel · l’avertissement le dit, zéro candidat, toujours sans geste', () => {
    const d = contenu(rendre(<Stockage bandeau={B} etat="pret" {...vue(false)} />));
    expect([...d.querySelectorAll('[data-etat="partiel"]')].map((x) => x.textContent)).toEqual([
      'Partiel Liste des fichiers partielle (borne atteinte) · les chiffres ne portent que sur les fichiers lus.',
      'Partiel Lecture des références incomplète (generations.input_json) · par prudence, aucun fichier n’est compté comme orphelin.',
    ]);
    expect(d.querySelectorAll('[data-cle]')).toHaveLength(0);
    expect(d.querySelectorAll('button, form')).toHaveLength(0);
  });

  it('indisponible · la raison est dite, sans geste', () => {
    const d = contenu(rendre(<Stockage bandeau={B} etat="indisponible" raison="Le stockage de fichiers n’est pas activé." />));
    expect(d.querySelector('[data-etat="indisponible"]')?.textContent).toContain('pas activé');
    expect(d.querySelectorAll('button, form')).toHaveLength(0);
  });

  it('ni la page, ni la vue, ni le lecteur n’importent ou n’appellent une suppression', () => {
    for (const f of ['apps/web/app/(spatial)/sp/admin/stockage/page.tsx', 'apps/web/spatial/vues/admin/Stockage.tsx', 'apps/web/lib/stockage-inventaire.ts']) {
      const src = lire(f);
      expect(src, f).not.toMatch(/deleteObjectByUrl|deleteAsset|storageSelfTest|storagePrivateSelfTest|'DELETE'|"DELETE"|db\.delete|\.delete\(/);
      expect(src, f).not.toMatch(/'use server'/);
    }
  });
});

describe('Stockage · accès réservé au propriétaire de la plateforme', () => {
  const session = (role: string) => ({ user: { id: 'u', email: 'x@y.fr' }, role, workspaceId: 'w', workspaceName: 'W', plan: 'business', equipe: null });
  const porte = async () => { try { await StockagePage(); return 'aucune redirection'; } catch (e) { return (e as Error).message; } };

  it('sans session · connexion ; admin d’espace non fondateur · renvoyé ; fondateur simple membre · renvoyé ; jamais de lecture', async () => {
    expect(await porte()).toBe('REDIRECT /login');
    h.session = session('owner');
    expect(await porte()).toBe('REDIRECT /dashboard');
    h.session = session('admin');
    expect(await porte()).toBe('REDIRECT /dashboard');
    h.session = session('member'); h.fondateur = true;
    expect(await porte()).toBe('REDIRECT /dashboard');
    expect(h.lectures).toEqual([]);
  });

  it('fondateur ET admin · la porte s’ouvre et l’inventaire est lu (témoin de la garde)', async () => {
    h.session = session('admin'); h.fondateur = true;
    expect(await porte()).toBe('lecture interdite avant la porte');
    expect(h.lectures.length).toBeGreaterThan(0);
  });
});

describe('Stockage · le recensement des écrivains est fermé', () => {
  const sources: string[] = [];
  const parcourir = (d: string) => {
    for (const n of readdirSync(d)) {
      if (n === 'node_modules' || n === '.next' || n === 'test' || n === 'dist' || n.startsWith('.')) continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) parcourir(p);
      else if (/\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n)) sources.push(p);
    }
  };
  for (const r of ['apps', 'packages']) parcourir(join(PRODUCT, r));
  const APPEL = /(?<!function )\b(putObject|presignPutUrl)\(/;
  /** Le code seul · commentaires de bloc et lignes de commentaire retirés (une doc qui CITE `putObject(` n'est pas un appel). */
  const code = (p: string) => readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  it('chaque fichier qui dépose dans le bucket est recensé · écrivain d’une colonne, ou appelant sans colonne', () => {
    const appelants = sources.filter((p) => APPEL.test(code(p))).map((p) => relative(PRODUCT, p)).sort();
    expect(appelants.length).toBeGreaterThan(5);
    const recenses = new Set([...RECENSEMENT_REFERENCES_STOCKAGE.flatMap((r) => r.ecrivains), ...APPELANTS_DEPOT_SANS_COLONNE.map((a) => a.fichier)]);
    expect(appelants.filter((f) => !recenses.has(f)), 'appelant du dépôt non recensé · l’ajouter à RECENSEMENT_REFERENCES_STOCKAGE (colonne écrite) ou à APPELANTS_DEPOT_SANS_COLONNE').toEqual([]);
  });

  it('chaque écrivain recensé existe · aucune entrée morte', () => {
    for (const f of [...RECENSEMENT_REFERENCES_STOCKAGE.flatMap((r) => r.ecrivains), ...APPELANTS_DEPOT_SANS_COLONNE.map((a) => a.fichier)]) {
      expect(() => statSync(join(PRODUCT, f)), f).not.toThrow();
    }
  });

  it('la requête signée brute reste privée au client de stockage · tout dépôt passe par `putObject` ou `presignPutUrl`', () => {
    const src = lire('packages/integrations/src/storage.ts');
    expect(src).toMatch(/\nasync function s3SignedFetch\(/);
    expect(src).not.toMatch(/export\s+(async\s+)?function s3SignedFetch|export\s*\{[^}]*s3SignedFetch/);
  });
});
