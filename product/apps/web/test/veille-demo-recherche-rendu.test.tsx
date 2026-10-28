import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

/**
 * Recette #106 · constat Codex · en démonstration (aucune source branchée), la
 * Veille ignorait le mot-clé · `/veille?q=zzzzzzzz` montrait encore les deux
 * cartes d'échantillon et l'état « aucun résultat » était inatteignable.
 *
 * Vague 4 · la page V5 est retirée · la garde est portée sur Pubs du moment
 * (Spatial) · on appelle la page elle-même (serveur simulé · pas de base, pas de
 * réseau, pas de source) et on lit ce qu'elle donne à la vue · les cartes
 * réellement affichées, l'état vide, le sous-titre.
 */
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error('redirect ' + u); }, useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => '/veille', useSearchParams: () => new URLSearchParams() }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', role: 'owner', plan: 'business', user: { id: 'u', email: 'demo@exemple.invalid' } }) }));
vi.mock('../lib/access', () => ({ effectiveAccess: () => ({}) }));
vi.mock('../lib/rbac', async (orig) => ({ ...(await orig<typeof import('../lib/rbac')>()), canAccess: () => true }));
vi.mock('@tiktrends/db', async (orig) => ({ ...(await orig<typeof import('@tiktrends/db')>()), db: null }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => null }));
vi.mock('../lib/veille-recette-base', () => ({ baseUrlRecette: () => undefined, cleEffective: () => undefined }));

import VeillePage from '../app/(spatial)/sp/veille/page';

type Props = { sous: string; cartes: Array<{ cle: string }>; vide: { titre: string; texte: string; action: { href: string; libelle: string } | null } | null };
const visiter = async (sp: Record<string, string>) => ((await VeillePage({ searchParams: Promise.resolve(sp) })) as ReactElement<Props>).props;
const cartes = (p: Props) => p.cartes.map((c) => c.cle);

describe('Veille · démonstration · la recherche filtre vraiment l’échantillon', () => {
  it('sans mot-clé, l’échantillon entier', async () => {
    expect(cartes(await visiter({})).length).toBeGreaterThanOrEqual(2);
  });

  it('un mot-clé sans correspondance montre l’état vide, plus aucune carte · avec une sortie', async () => {
    const p = await visiter({ q: 'zzzzzzzz' });
    expect(cartes(p), 'le mot-clé est ignoré en démonstration').toEqual([]);
    expect(p.vide?.titre, 'l’état « aucun résultat » ne s’affiche pas').toContain('Aucune annonce dont le texte de l’annonce contient « zzzzzzzz »');
    expect(p.vide?.action?.href).toMatch(/^\/veille/);
  });

  it('un mot-clé qui correspond ne garde que sa carte (dans le périmètre choisi)', async () => {
    const p = await visiter({ q: 'neutrogena', searchIn: 'brand' });
    expect(cartes(p)).toEqual(['meta:sample_neutrogena']);
    expect(p.vide).toBeNull();
  });

  it('ex #106b · une marque introuvable dans le texte · l’état vide nomme le périmètre et propose de chercher dans la marque', async () => {
    const p = await visiter({ q: 'neutrogena' });
    expect(cartes(p)).toEqual([]);
    expect(p.vide?.titre, 'l’état vide ne dit pas où l’on a cherché').toContain('Aucune annonce dont le texte de l’annonce contient « neutrogena »');
    expect(p.vide?.action, 'pas de passage vers la marque').toEqual({ href: '/veille?q=neutrogena&searchIn=brand', libelle: 'Chercher dans le nom de la marque' });
  });

  it('un filtre posé s’applique aussi (média image · aucun visuel dans l’échantillon)', async () => {
    expect(cartes(await visiter({ media: 'image' })), 'le filtre média est ignoré en démonstration').toEqual([]);
  });

  it('la démonstration est dite, sans parler de configuration serveur', async () => {
    const p = await visiter({});
    expect(p.sous).toMatch(/^Démonstration · /);
    expect(p.sous).not.toMatch(/configur[ée]+ sur le serveur/);
  });
});
