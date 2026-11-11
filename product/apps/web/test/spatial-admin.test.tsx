// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fragmentReference, parite } from './spatial/parite';

const actions = vi.hoisted(() => ({
  reply: vi.fn(async (_fd: FormData) => {}),
  statut: vi.fn(async (_fd: FormData) => {}),
  matrice: vi.fn(async (_fd: FormData) => {}),
  diagnostic: vi.fn(async () => ({ mode: 'test', checks: [{ label: 'a', level: 'ok', detail: '' }, { label: 'b', level: 'fail', detail: '' }] })),
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/admin', useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: () => {} }), redirect: () => { throw new Error('redirect'); } }));
vi.mock('../app/actions/support', () => ({ replyTicketAction: actions.reply, setTicketStatusAction: actions.statut }));
vi.mock('../app/actions/equipe', () => ({ enregistrerStaffAction: async () => {}, retirerStaffAction: async () => {}, enregistrerMatriceAction: actions.matrice }));
vi.mock('../app/actions/stripe-diagnostic', () => ({ runStripeDiagnosticAction: actions.diagnostic }));
const nav = vi.hoisted(() => ({ push: vi.fn((_u: string) => {}), replace: vi.fn((_u: string) => {}) }));
vi.mock('../app/actions/tour-controle', () => ({ exporterTourAction: vi.fn(async () => ({ ok: true, csv: 'x', nom: 'x.csv', lignes: 2 })), ouvrirIncidentAction: vi.fn(), annoterIncidentAction: vi.fn(), cloreIncidentAction: vi.fn() }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { TourDeControle } from '../spatial/vues/admin/TourDeControle';
import { Churn } from '../spatial/vues/admin/Churn';
import { Revenus } from '../spatial/vues/admin/Revenus';
import { Forfaits } from '../spatial/vues/admin/Forfaits';
import { Comptes } from '../spatial/vues/admin/Comptes';
import { Sav } from '../spatial/vues/admin/Sav';
import { Couts } from '../spatial/vues/admin/Couts';
import { Modeles } from '../spatial/vues/admin/Modeles';
import { UsageTests } from '../spatial/vues/admin/UsageTests';
import { Paiements } from '../spatial/vues/admin/Paiements';
import { Droits } from '../spatial/vues/admin/Droits';
import { Prompts } from '../spatial/vues/admin/Prompts';
import { ComptesARisqueListe, ComptesListe, RevenusHero } from '../spatial/vues/admin/client';
import { BibliothequePrompts } from '../spatial/vues/admin/prompts-client';
import { PosteSav } from '../spatial/vues/admin/sav-client';
import { MatriceDroitsSpatiale } from '../spatial/vues/admin/droits-client';
import { VerifierStripe } from '../spatial/vues/admin/paiements-client';
import { OUTILS_ADMIN } from '../spatial/vues/admin/sous-nav';

/**
 * Tour de contrôle Spatial · parité de structure avec la maquette, écran par
 * écran. Les props reproduisent les NOMBRES d'éléments et les classes du
 * fragment (`docs/spatial/reference/<route>.html`) · les valeurs sont des
 * données de test, jamais servies en production (les pages lisent la base).
 */

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 1240, dotation: 2000, illimite: false },
  nonLues: 4, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const rendre = (n: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>);
import { VIDES_CHURN, VIDES_COMPTES, VIDES_COUTS, VIDES_FORFAITS, VIDES_MODELES, VIDES_PAIEMENTS, VIDES_REVENUS, VIDES_SAV, VIDES_USAGE, propsChurn, propsComptes, propsCouts, propsDroits, propsForfaits, propsModeles, propsPaiements, propsPrompts, propsRevenus, propsSav, propsTourDeControle, propsUsage } from './spatial/props-admin';

/**
 * Vague 3 · deux ajouts HORS maquette, écartés de la comparaison et gardés
 * ailleurs (« Spatial · Admin · vague 3 ») :
 *  · la sous-navigation porte, APRÈS les douze entrées de la maquette, les
 *    outils de la plateforme (`OUTILS_ADMIN`) · on retire ces derniers liens,
 *    et seulement s'ils sont bien des liens nus en fin de liste ;
 *  · trois tables larges défilent au téléphone (`styleTableDefilante`) · leur
 *    `.atable` porte deux propriétés de style de plus, ses lignes rien.
 */
function sansAjoutsVague3(rendu: string[]): string[] {
  const out = rendu.map((l) => l.replace(/div\.atable(#?\S*)?\[style:grid-template-columns,overflow-x\]$/, (m) => m.replace('[style:grid-template-columns,overflow-x]', '')));
  const i = out.findIndex((l) => l.trim() === 'nav.seg.subnav');
  if (i < 0) return out;
  const indent = out[i]!.length - out[i]!.trimStart().length;
  let fin = i + 1;
  while (fin < out.length && out[fin]!.length - out[fin]!.trimStart().length > indent) fin++;
  const ajoutes = out.slice(fin - OUTILS_ADMIN.length, fin);
  if (ajoutes.length !== OUTILS_ADMIN.length || ajoutes.some((l) => l.trim() !== 'a')) return out;
  return [...out.slice(0, fin - OUTILS_ADMIN.length), ...out.slice(fin)];
}
const pariteAdmin: typeof parite = (html, route, o) => {
  const p = parite(html, route, o);
  return { rendu: sansAjoutsVague3(p.rendu), reference: p.reference };
};

/**
 * Lot 14 · les SEULS ajouts à la maquette, déclarés ici et retirés du rendu
 * avant la comparaison · seulement s'ils sont exactement là où on les attend,
 * et la garde exige qu'ils y soient (un ajout déplacé, doublé ou absent fait
 * tomber la parité) :
 *  · « Exporter (CSV) » (`a|button.btn.sm` + son icône) en fin de l'en-tête
 *    `.sech` de « Comptes » (Inscriptions) et de « Rentabilité par abonnement »
 *    (Revenus) ;
 *  · « Rechercher une consigne… » (`label.jsearch`, icône et champ) entre le
 *    titre et « Créer dans le registre » (Bibliothèque IA).
 */
const EXPORT_LOT14 = ['a|button.btn.sm', '  svg.i.s @i-down'];
const RECHERCHE_LOT14 = ['label.jsearch[style:min-width]', '  svg.i.s @i-search', '  input'];
/** Suivi opérationnel (AR06) · « Journal complet » dans l'en-tête du registre de « Rôles & droits », seulement quand la session ouvre le registre. */
const JOURNAL_AUDIT = ['a|button.btn.sm[style:align-items,display,margin-left,min-height]', '  svg.i.s @i-arrow'];
function sansAjoutLot14(rendu: string[], bloc: readonly string[], apres: RegExp): { rendu: string[]; retires: number } {
  let retires = 0;
  const out = [...rendu];
  for (let i = 0; i < out.length; i++) {
    const indent = out[i]!.length - out[i]!.trimStart().length;
    const pad = ' '.repeat(indent);
    // Le bloc suit un FRÈRE précis · la ligne d'avant, au même retrait (un enfant de ce frère ne compte pas).
    const precedent = out.slice(0, i).reverse().find((l) => l.length - l.trimStart().length <= indent) ?? '';
    if (out[i]!.trim() !== bloc[0] || precedent.length - precedent.trimStart().length !== indent || !apres.test(precedent.trim())) continue;
    if (!bloc.every((l, k) => out[i + k] === pad + l)) continue;
    out.splice(i, bloc.length); retires++;
  }
  return { rendu: out, retires };
}

describe('Spatial · Tour de contrôle · parité de structure avec la maquette', () => {
  it('« Tour de contrôle » reproduit la maquette', () => {
    const p = pariteAdmin(rendre(<TourDeControle {...propsTourDeControle()} />), 'admin');
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Churn & rétention » reproduit la maquette (blocs sans source ignorés)', () => {
    const p = pariteAdmin(rendre(<Churn {...propsChurn()} />), 'a-churn', { ignorer: VIDES_CHURN });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Revenus & MRR » reproduit la maquette (mouvements et cohortes ignorés), « Exporter (CSV) » de la rentabilité en seul ajout', () => {
    const p = pariteAdmin(rendre(<Revenus {...propsRevenus()} />), 'a-revenus', { ignorer: VIDES_REVENUS });
    const sans = sansAjoutLot14(p.rendu, EXPORT_LOT14, /^span\.faint\[style:font-size\]$/);
    expect(sans.retires, 'l’export de la rentabilité n’est pas à sa place (fin de l’en-tête de la table)').toBe(1);
    expect(sans.rendu).toEqual(p.reference);
  });

  it('« Forfaits & offres » reproduit la maquette (création et codes promo ignorés)', () => {
    const p = pariteAdmin(rendre(<Forfaits {...propsForfaits()} />), 'a-abos', { ignorer: VIDES_FORFAITS });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Inscriptions & comptes » reproduit la maquette (gestes par compte ignorés), « Exporter (CSV) » des comptes en seul ajout', () => {
    const p = pariteAdmin(rendre(<Comptes {...propsComptes()} />), 'a-comptes', { ignorer: VIDES_COMPTES });
    const sans = sansAjoutLot14(p.rendu, EXPORT_LOT14, /^label\.jsearch\[style:margin-left,min-width\]$/);
    expect(sans.retires, 'l’export des comptes n’est pas à sa place (après la recherche, dans l’en-tête)').toBe(1);
    expect(sans.rendu).toEqual(p.reference);
  });

  it('« Tickets SAV » reproduit la maquette (gestes simulés ignorés, message et carte client gardés)', () => {
    const html = rendre(<Sav {...propsSav()} />);
    const p = pariteAdmin(html, 'a-sav', { ignorer: VIDES_SAV });
    expect(p.rendu).toEqual(p.reference);
    const msg = pariteAdmin(html, 'a-sav', { selecteur: '.savconv > .savmsg.c' });
    expect(msg.rendu).toEqual(msg.reference);
    const carte = pariteAdmin(html, 'a-sav', { selecteur: '.savctx > .savcard' });
    expect(carte.rendu).toEqual(carte.reference);
  });

  it('« Coûts IA & marges » reproduit la maquette (réglages du plafond ignorés)', () => {
    const p = pariteAdmin(rendre(<Couts {...propsCouts()} />), 'a-couts', { ignorer: VIDES_COUTS });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Modèles IA connectés » reproduit la maquette (ajout et renouvellement ignorés, carte gardée)', () => {
    const html = rendre(<Modeles {...propsModeles()} />);
    const p = pariteAdmin(html, 'a-modeles', { ignorer: VIDES_MODELES });
    expect(p.rendu).toEqual(p.reference);
    for (const sel of ['.amods > article:nth-child(1)', '.amods > article:nth-child(5)']) {
      const c = pariteAdmin(html, 'a-modeles', { selecteur: sel });
      expect(c.rendu).toEqual(c.reference);
    }
  });

  it('« Usage & tests » reproduit la maquette (déploiements et tests A/B ignorés)', () => {
    const p = pariteAdmin(rendre(<UsageTests {...propsUsage()} />), 'a-usage', { ignorer: VIDES_USAGE });
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Stripe & Whop » reproduit la maquette (webhook Whop et rapprochement Whop ignorés)', () => {
    const p = pariteAdmin(rendre(<Paiements {...propsPaiements()} />), 'a-paiements', { ignorer: VIDES_PAIEMENTS });
    // La capture de ce fragment a saisi la cloche EN PLEINE animation (`ring2`, classe posée
    // puis retirée par la maquette) · un état transitoire, pas une structure.
    expect(p.rendu).toEqual(p.reference.map((l) => l.replace('button.bell.ring2', 'button.bell')));
  });

  it('« Rôles & droits » reproduit la maquette', () => {
    const p = pariteAdmin(rendre(<Droits {...propsDroits()} />), 'a-droits');
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Rôles & droits » · « Journal complet » (registre d’audit) en seul ajout, au bout du titre « Registre d’audit »', () => {
    const p = pariteAdmin(rendre(<Droits {...propsDroits()} journal="/admin/audit" />), 'a-droits');
    const sans = sansAjoutLot14(p.rendu, JOURNAL_AUDIT, /^h2$/);
    expect(sans.retires, '« Journal complet » n’est pas à sa place (après le titre du registre, dans son en-tête)').toBe(1);
    expect(sans.rendu).toEqual(p.reference);
    expect(rendre(<Droits {...propsDroits()} journal="/admin/audit" />)).toContain('href="/admin/audit"');
    expect(rendre(<Droits {...propsDroits()} />), 'sans porte ouverte, aucun lien vers le registre').not.toContain('data-journal');
  });

  it('« Bibliothèque IA » reproduit la maquette, « Rechercher une consigne… » en seul ajout', () => {
    const p = pariteAdmin(rendre(<Prompts {...propsPrompts()} />), 'a-prompts');
    const sans = sansAjoutLot14(p.rendu, RECHERCHE_LOT14, /^h2$/);
    expect(sans.retires, 'la recherche des consignes n’est pas à sa place (entre le titre et « Créer »)').toBe(1);
    expect(sans.rendu).toEqual(p.reference);
  });
});

/* ───────────────────────── comportements (jsdom, actions simulées) ───────────────────────── */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let racine: Root | null = null;
let hote: HTMLDivElement | null = null;
const toasts: string[] = [];
async function monter(n: React.ReactNode) {
  hote = document.createElement('div'); document.body.appendChild(hote);
  racine = createRoot(hote);
  await act(async () => { racine!.render(<FournisseurSpatial value={{ ...CTX, toast: (m) => { toasts.push(m); } }}>{n}</FournisseurSpatial>); });
  return hote;
}
const cliquer = async (e: Element | null | undefined) => { await act(async () => { (e as HTMLElement).click(); }); };
const bouton = (h: HTMLElement, texte: string) => [...h.querySelectorAll('button')].find((b) => b.textContent?.includes(texte));
afterEach(() => { act(() => racine?.unmount()); hote?.remove(); racine = null; hote = null; toasts.length = 0; vi.clearAllMocks(); });

describe('Spatial · Tour de contrôle · comportements', () => {
  it('Comptes à risque · la puce « Critiques » ne garde que les comptes critiques', async () => {
    const p = propsChurn();
    const comptes = p.comptes.map((c, i) => ({ ...c, cles: i < 2 ? ['core', 'critique'] : ['plus'] }));
    const h = await monter(<ComptesARisqueListe filtres={p.filtres} comptes={comptes} />);
    expect(h.querySelectorAll('.atable > .atr')).toHaveLength(6);
    await cliquer(h.querySelector('[data-acf="critique"]'));
    expect(h.querySelectorAll('.atable > .atr')).toHaveLength(2);
    expect(h.querySelector('[data-acf="critique"]')!.getAttribute('aria-pressed')).toBe('true');
    await cliquer(h.querySelector('[data-acf="essai"]'));
    expect(h.textContent).toContain('Aucun compte dans ce filtre.');
  });

  it('Comptes · la recherche et les segments sont relus AU SERVEUR (adresse), après une pause de frappe', async () => {
    vi.useFakeTimers();
    try {
      const p = propsComptes();
      const h = await monter(<ComptesListe liste={{ ...p.liste, segment: 'essai' }} colonnes="1fr" />);
      const champ = h.querySelector('#auq') as HTMLInputElement;
      await act(async () => {
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        set.call(champ, 'Éclat beauté'); champ.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(nav.replace, 'une requête par lettre').not.toHaveBeenCalled();
      await act(async () => { vi.advanceTimersByTime(400); });
      expect(nav.replace.mock.calls.map((c) => c[0])).toEqual(['/admin/signups?q=%C3%89clat+beaut%C3%A9&segment=essai']);
      await cliquer(h.querySelector('[data-auf="risque"]'));
      expect(nav.push.mock.calls.map((c) => c[0])).toEqual(['/admin/signups?segment=risque']);
      expect(h.querySelector('[data-auf="essai"]')!.getAttribute('aria-pressed')).toBe('true');
    } finally { vi.useRealTimers(); }
  });

  it('Comptes · l’export fermé dit pourquoi, à côté du bouton, et ne part pas', async () => {
    const p = propsComptes();
    const { exporterTourAction } = await import('../app/actions/tour-controle');
    const h = await monter(<ComptesListe liste={{ ...p.liste, comptes: [], export: { ferme: true, raison: 'Rien à exporter · aucun compte dans ce filtre.', titre: 'Rien à exporter' } }} colonnes="1fr" />);
    const b = h.querySelector('[data-export="comptes"]') as HTMLButtonElement;
    expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(h.querySelector('[data-raison-export]')!.textContent).toBe('Rien à exporter · aucun compte dans ce filtre.');
    await cliquer(b);
    expect(exporterTourAction).not.toHaveBeenCalled();
    expect(h.textContent).toContain('Aucun compte ne correspond à ce filtre.');
  });

  it('Bibliothèque IA · « Rechercher une consigne… » ignore casse et accents, les compteurs des onglets suivent', async () => {
    const entree = (id: string, titre: string) => ({ id, titre, version: 'v1', utilisations: '1', production: { part: 0, texte: 't', absente: true }, maj: 'm', editer: '/x' });
    const familles = [
      { cle: 'styles', libelle: 'Styles', colonne: 'Style', entrees: [entree('recette:eclat', 'Éclat doré'), entree('recette:mini', 'Minimal')] },
      { cle: 'regles', libelle: 'Règles', colonne: 'Règle', entrees: [entree('regle:ton', 'Ton de la marque')] },
    ];
    const h = await monter(<BibliothequePrompts familles={familles} pipeline={[]} legende="l" kpis={null} titreListe="Bibliothèque" />);
    const champ = h.querySelector('#pq') as HTMLInputElement;
    const saisir = async (v: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, v);
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const titres = () => [...h.querySelectorAll('.atable > .atr:not(.ath) > span:first-child > b')].map((b) => b.textContent);
    const compteurs = () => [...h.querySelectorAll('[data-aitab] .nct')].map((i) => i.textContent);
    await saisir('ECLAT');
    expect(titres()).toEqual(['Éclat doré']);
    expect(compteurs()).toEqual(['1', '0']);
    await saisir('marque');
    expect(titres()).toEqual([]);
    expect(h.textContent).toContain('Aucune entrée de cette famille ne correspond à « marque ».');
    await cliquer(h.querySelector('[data-aitab="regles"]'));
    expect(titres()).toEqual(['Ton de la marque']);
  });

  it('SAV · un ticket d’un autre espace ne se traite pas d’ici · la réponse est désactivée et dit pourquoi', async () => {
    const p = propsSav();
    const tickets = p.tickets.map((t) => ({ ...t, bloque: 'Réponse réservée à l’espace E.' }));
    const h = await monter(<PosteSav onglets={p.onglets} tickets={tickets} reponsesTypes={p.reponsesTypes} />);
    const zone = h.querySelector('#areply') as HTMLTextAreaElement;
    expect(zone.disabled).toBe(true);
    expect(zone.placeholder).toBe('Réponse réservée à l’espace E.');
    expect(bouton(h, 'Résoudre')).toBeUndefined();
    expect((bouton(h, 'Envoyer') as HTMLButtonElement).disabled).toBe(true);
    await cliquer(bouton(h, 'Envoyer'));
    expect(actions.reply).not.toHaveBeenCalled();
  });

  it('SAV · une réponse type remplit la réponse, « Envoyer » et « Résoudre » passent par les actions du support', async () => {
    const p = propsSav();
    const h = await monter(<PosteSav onglets={p.onglets} tickets={p.tickets} reponsesTypes={p.reponsesTypes} />);
    await cliquer([...h.querySelectorAll('.savr .chip')][1]);
    expect((h.querySelector('#areply') as HTMLTextAreaElement).value).toBe('b');
    await cliquer(bouton(h, 'Envoyer'));
    expect(actions.reply).toHaveBeenCalledTimes(1);
    const fd = actions.reply.mock.calls[0]![0];
    expect([fd.get('ticketId'), fd.get('body')]).toEqual(['t1', 'b']);
    await cliquer(bouton(h, 'Résoudre'));
    const st = actions.statut.mock.calls[0]![0];
    expect([st.get('ticketId'), st.get('status')]).toEqual(['t1', 'resolved']);
  });

  it('SAV · choisir un autre ticket change le détail', async () => {
    const p = propsSav();
    const tickets = p.tickets.map((t, i) => ({ ...t, titre: `Titre ${i}` }));
    const h = await monter(<PosteSav onglets={p.onglets} tickets={tickets} reponsesTypes={p.reponsesTypes} />);
    expect(h.querySelector('.savdh h2')!.textContent).toBe('Titre 0');
    await cliquer(h.querySelector('[data-atk="t3"]'));
    expect(h.querySelector('.savdh h2')!.textContent).toBe('Titre 2');
    expect(h.querySelector('.savi.on')!.getAttribute('data-atk')).toBe('t3');
  });

  it('Droits · un clic enregistre les rubriques du rôle APRÈS bascule, par l’action de l’équipe', async () => {
    const h = await monter(<MatriceDroitsSpatiale roles={['Manager']} lignes={[{ rubrique: 'Veille', cases: [{ role: 'manager', niveau: 2, libelle: 'Accès', aria: 'a', apres: ['dashboard', 'radar'] }] }]} verrouille={false} />);
    await cliquer(h.querySelector('.amc'));
    const fd = actions.matrice.mock.calls[0]![0];
    expect(fd.get('role')).toBe('manager');
    expect(fd.getAll('rubrique')).toEqual(['dashboard', 'radar']);
  });

  it('Droits · un compte non admissible voit la matrice verrouillée', async () => {
    const h = await monter(<MatriceDroitsSpatiale roles={['Manager']} lignes={[{ rubrique: 'Veille', cases: [{ role: 'manager', niveau: 0, libelle: 'Aucun', aria: 'a', apres: ['veille'] }] }]} verrouille />);
    expect((h.querySelector('.amc') as HTMLButtonElement).disabled).toBe(true);
    await cliquer(h.querySelector('.amc'));
    expect(actions.matrice).not.toHaveBeenCalled();
  });

  it('Revenus · planche v4 · G8 · un seul mois relevé · l’écran le DIT au lieu d’un graphique muet', () => {
    const douze = Array.from({ length: 12 }, (_, i) => ({ libelle: `m${i}`, valeur: i === 11 ? 1687 : null, enCours: i === 11 }));
    const lire = (n: React.ReactNode) => { const d = document.createElement('div'); d.innerHTML = rendre(n); return d; };
    const h = lire(<RevenusHero titre="MRR" valeur="1 687 €" variation={null} detail="d" serie={douze} />);
    const vide = h.querySelector('[data-vide="courbe-mrr"]');
    expect(vide?.textContent, 'aucun état vide · la grille reste muette').toContain('Un seul mois relevé (m11)');
    expect(vide?.textContent).toContain('Rien n’est reconstitué');
    expect(h.querySelector('.rvchart'), 'une grille sans courbe se dessine encore').toBeNull();
    expect(h.querySelector('.seg'), 'une bascule de période sans objet reste affichée').toBeNull();
    const rien = lire(<RevenusHero titre="MRR" valeur="0 €" variation={null} detail="d" serie={douze.map((m) => ({ ...m, valeur: null }))} />);
    expect(rien.querySelector('[data-vide="courbe-mrr"]')?.textContent).toContain('Aucun relevé mensuel du MRR');
    // Deux mois relevés · la courbe revient, l'état vide disparaît.
    const deux = lire(<RevenusHero titre="MRR" valeur="1 687 €" variation={null} detail="d" serie={douze.map((m, i) => ({ ...m, valeur: i >= 10 ? 1600 + i : null }))} />);
    expect(deux.querySelector('.rvchart path')).not.toBeNull();
    expect(deux.querySelector('[data-vide="courbe-mrr"]')).toBeNull();
  });

  it('Revenus · « 6 mois » recadre les mois affichés', async () => {
    const h = await monter(<RevenusHero {...propsRevenus().hero} />);
    expect(h.querySelectorAll('.rvmo span')).toHaveLength(12);
    await cliquer(bouton(h, '6 mois'));
    expect(h.querySelectorAll('.rvmo span')).toHaveLength(6);
    expect(h.querySelector('.rvmo span:last-child')!.className).toBe('on');
  });

  it('Stripe · « Vérifier » lance le diagnostic réel et dit son résultat', async () => {
    const h = await monter(<VerifierStripe />);
    await cliquer(bouton(h, 'Vérifier'));
    expect(actions.diagnostic).toHaveBeenCalledTimes(1);
    expect(toasts).toEqual(['Stripe · 1 point bloquant']);
  });
});

/* ───── Tables `.atable` · chaque ligne porte ses colonnes (défaut vu au banc riche, 27/10) ───── */

describe('Spatial · Admin · grilles : une ligne de table = une rangée, un état vide = toute la largeur', () => {
  // `.atable .atr:not(.ath){grid-template-columns:inherit}` hérite du conteneur,
  // qui n'en déclare aucune : sans colonnes en ligne, chaque cellule prend sa
  // propre rangée (8 lignes empilées par forfait). Deux tables de la maquette
  // les omettaient (Tour de contrôle, Revenus) ; toutes les autres les portent.
  const lignes = (html: string) => {
    const t = document.createElement('template');
    t.innerHTML = html;
    return [...t.content.querySelectorAll('.atable > .atr')] as HTMLElement[];
  };
  const pistes = (e: HTMLElement) => e.style.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length;

  it('Tour de contrôle et Revenus · chaque ligne (en-tête compris) déclare autant de colonnes que de cellules', () => {
    for (const html of [rendre(<TourDeControle {...propsTourDeControle()} />), rendre(<Revenus {...propsRevenus()} />)]) {
      const ls = lignes(html);
      expect(ls.length).toBeGreaterThan(1);
      expect(ls.map((l) => `${pistes(l)}/${l.children.length}`)).toEqual(ls.map((l) => `${l.children.length}/${l.children.length}`));
    }
  });

  it('un état vide posé dans une grille (`.wfall` 6 colonnes, `.funnel` 4) occupe toute la largeur, pas une colonne', () => {
    const vides: HTMLElement[] = [];
    for (const html of [rendre(<Revenus {...propsRevenus()} />), rendre(<Churn {...propsChurn()} />)]) {
      const t = document.createElement('template');
      t.innerHTML = html;
      vides.push(...([...t.content.querySelectorAll('[data-vide] > p')] as HTMLElement[]));
    }
    expect(vides.length).toBeGreaterThanOrEqual(4);
    expect(vides.map((v) => v.style.gridColumn.replace(/\s/g, ''))).toEqual(vides.map(() => '1/-1'));
  });

  it('les fragments de référence · toute ligne `.atable > .atr` déclare ses colonnes', () => {
    const dossier = join(__dirname, '..', '..', '..', '..', 'docs', 'spatial', 'reference');
    const fautives: string[] = [];
    for (const f of readdirSync(dossier).filter((n) => n.endsWith('.html'))) {
      lignes(fragmentReference(f.replace(/\.html$/, ''))).forEach((l, i) => { if (!pistes(l)) fautives.push(`${f} · ligne ${i + 1}`); });
    }
    expect(fautives).toEqual([]);
  });
});
