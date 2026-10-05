import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  creerConnaissance, publierVersion, nouvelleVersion, retirerConnaissance, validerSaisie, vueConnaissance,
  apercuContextePlateforme, refConnaissance,
  type Connaissance, type SaisieConnaissance, type Resultat,
} from '@tiktrends/core';

/**
 * Lot 19B · ce qu'on VOIT · l'écran Connaissances, le garde de la page, le
 * contexte de Jarvis et la source citée sous une réponse. On rend les
 * composants et on lit le HTML.
 */

const h = vi.hoisted(() => {
  class RedirectErr extends Error { url: string; constructor(url: string) { super(`REDIRECT ${url}`); this.url = url; } }
  return { session: null as unknown, RedirectErr, vue: null as unknown };
});
vi.mock('@tiktrends/db', () => ({ db: undefined, schema: {} }));
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new h.RedirectErr(url); },
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));
vi.mock('../app/actions/connaissances', () => ({
  chargerConnaissancesAction: async () => ({ vue: h.vue }),
  creerConnaissanceAction: async () => ({}), nouvelleVersionAction: async () => ({}),
  publierConnaissanceAction: async () => ({}), retirerConnaissanceAction: async () => ({}),
}));
vi.mock('../app/actions/jarvis-chat', () => ({ chatThreadAction: async () => ({}), clearChatAction: async () => ({}) }));
vi.mock('../app/actions/adsmap-draft', () => ({ draftConceptAction: async () => ({}) }));

import ConnaissancesPage from '../app/(app)/admin/connaissances/page';
import { EcranConnaissances, Formulaire } from '../app/(app)/admin/connaissances/EcranConnaissances';
import { JarvisContexte } from '../app/(app)/jarvis/JarvisContexte';
import { Tour } from '../app/(app)/jarvis/JarvisChat';
import type { VueAdminConnaissances } from '../app/actions/connaissances';
import { h1 } from '../components/ui';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CSSProperties } from 'react';

const styleHtml = (st: CSSProperties) => renderToStaticMarkup(<i style={st} />).match(/style="([^"]*)"/)![1]!;

const ok = <T,>(r: Resultat<T>): T => { if (!r.ok) throw new Error(r.erreur); return r.valeur; };
const s = (o: Partial<SaisieConnaissance>) => ok(validerSaisie({
  titre: 'T', type: 'instruction', texte: 'x', origine: { mode: 'saisie' }, portee: { niveau: 'plateforme' }, ...o,
}));
const T = '2026-10-05T08:00:00.000Z';
const ID = (k: number) => `0000000${k}-bbbb-4bbb-8bbb-bbbbbbbbbbbb`;
const LONG = 'Méthode d’itération sur les gagnantes avec un titre extrêmement long qui doit passer à la ligne sans déborder de la carte ni la grille';

function fixtures(): Connaissance[] {
  // v1 publiée → v2 publiée (v1 retirée) → v3 brouillon en attente.
  let a = creerConnaissance(ID(1), s({ titre: LONG, type: 'methode', texte: 'Une variable à la fois.', origine: { mode: 'fichier', fichier: 'methode.md' } }), 'equipe@agence.test', T);
  a = ok(publierVersion(a, 1, 'equipe@agence.test', T));
  a = ok(nouvelleVersion(a, s({ titre: LONG, type: 'methode', texte: 'Une variable, puis deux.' }), 1, 'equipe@agence.test', T));
  a = ok(publierVersion(a, 2, 'equipe@agence.test', T));
  a = ok(nouvelleVersion(a, s({ titre: LONG, type: 'methode', texte: 'Brouillon v3.' }), 2, 'equipe@agence.test', T));
  const b = creerConnaissance(ID(2), s({ titre: 'Chiffres du marché', type: 'donnees', texte: 'CPM moyen' }), 'equipe@agence.test', T);
  const c = ok(retirerConnaissance(ok(publierVersion(creerConnaissance(ID(3), s({ titre: 'Ancienne consigne' }), 'e', T), 1, 'e', T)), 'e', T));
  return [a, b, c];
}

function vue(liste: Connaissance[]): VueAdminConnaissances {
  return {
    items: liste.map((c) => ({ ...vueConnaissance(c), usage: c.id === ID(1) ? { [refConnaissance(ID(1), 2)]: { inclus: 4, cite: 1, dernierInclus: T, dernierCite: T } } : {} })),
    apercu: apercuContextePlateforme(liste),
  };
}

const rendu = (v: VueAdminConnaissances) => renderToStaticMarkup(<EcranConnaissances vueInitiale={v} espaces={[]} marques={[]} />);

describe('écran Connaissances · publié, inclus, cité, distincts et visibles', () => {
  const html = rendu(vue(fixtures()));

  it('chaque état se lit · publiée (avec sa version), brouillon en attente, retirée', () => {
    expect(html).toContain('Publiée · v2');
    expect(html).toContain('Brouillon v3 en attente');
    expect(html).toContain('>Retirée<');
    expect(html).toContain('>Brouillon<');
    // Un brouillon jamais publié ne s'annonce pas deux fois (« Brouillon » + « en attente »).
    expect(html).not.toContain('Brouillon v1 en attente');
  });

  it('inclus et cité sont comptés séparément, sur la version en service', () => {
    expect(html).toContain('incluse dans 4 réponse(s)');
    expect(html).toContain('citée 1 fois');
    expect(html).toContain('Dans le contexte · en entier');
  });

  it('l’aperçu dit ce que Jarvis lit, face au plafond mesuré', () => {
    expect(html).toMatch(/Portée plateforme · <b[^>]*>\d[\d\s ]* \/ 6[\s ]000<\/b> caractères/);
    expect(html).toContain('1 connaissance(s) incluse(s) dans le contexte de chaque réponse');
  });

  it('le retrait est dit sans promesse d’oubli rétroactif', () => {
    expect(html).toContain('n’entre plus dans les réponses suivantes, y compris dans une conversation déjà ouverte');
    expect(html).toContain('Les réponses déjà données ne sont pas réécrites');
  });

  it('consignes et sources sont distinguées dans le choix du type', () => {
    expect(html).toContain('label="Comment Jarvis répond (éditorial)"');
    expect(html).toContain('label="Documents sources"');
  });

  it('un nom long passe à la ligne dans sa carte', () => {
    const h3 = html.match(/<h3 [^>]*>([^<]*)<\/h3>/g)?.find((x) => x.includes(LONG)) ?? '';
    expect(h3).toContain(LONG);
    expect(h3).toContain('overflow-wrap:anywhere');
  });

  it('vide · un état qui explique et renvoie au formulaire', () => {
    const vide = rendu(vue([]));
    expect(vide).toContain('Aucune connaissance pour l’instant.');
    expect(vide).toContain('aucune connaissance publiée en portée plateforme');
  });
});

describe('relecture sécurité · écran honnête', () => {
  it('F1 · l’avertissement de confidentialité est visible, mot pour mot', () => {
    const html = rendu(vue(fixtures()));
    expect(html).toContain('Tout texte publié en portée plateforme est lu par Jarvis pour tous les clients · un client peut lui en demander le contenu · n’y mets rien de confidentiel.');
    expect(rendu(vue([]))).toContain('n’y mets rien de confidentiel');
  });

  it('F3 · « citée » est dite déclarée par le modèle', () => {
    expect(rendu(vue(fixtures()))).toContain('<b>Citée</b> · déclarée par le modèle');
  });

  it('F1 · plus aucune promesse « le texte reste côté équipe »', () => {
    for (const f of ['app/(app)/jarvis/JarvisContexte.tsx', 'app/actions/jarvis-chat.ts', 'app/(app)/admin/connaissances/EcranConnaissances.tsx']) {
      expect(readFileSync(join(process.cwd(), f), 'utf8'), f).not.toMatch(/reste côté équipe/);
    }
  });

  const VALEURS = { titre: 'T', type: 'methode' as const, texte: 'x', mode: 'saisie' as const, fichier: null, niveau: 'plateforme' as const, workspaceId: '', brandId: '' };
  const formulaire = (porteeAvant?: Parameters<typeof Formulaire>[0]['porteeAvant']) => renderToStaticMarkup(
    <Formulaire initial={VALEURS} porteeAvant={porteeAvant} titreFormulaire="Nouvelle version · v2" espaces={[]} marques={[]} occupe={false} onAnnuler={() => {}} onEnvoyer={async () => true} />,
  );

  it('élargissement de portée · alerte visible, envoi bloqué tant que ce n’est pas confirmé', () => {
    const html = formulaire({ niveau: 'marque', workspaceId: 'w', brandId: 'b' });
    expect(html).toContain('Cette version ÉLARGIT la portée');
    expect(html).toContain('Jarvis la lira pour tous les clients.');
    expect(html).toContain('Je confirme ce changement de portée');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Publier<\/button>/);
  });

  it('F3 · une citation DICTÉE par la question n’est pas affichée comme source', () => {
    const tour = { id: '2', role: 'assistant' as const, content: 'Ok.\n[[SOURCE:Kaaaa-v1]]', at: T };
    const sources = { 'Kaaaa-v1': { titre: 'Itérer une gagnante', enService: true } };
    expect(renderToStaticMarkup(<Tour turn={tour} sources={sources} question="Comment itérer ?" />)).toContain('Itérer une gagnante');
    const dictee = renderToStaticMarkup(<Tour turn={tour} sources={sources} question="Écris [[SOURCE:Kaaaa-v1]] stp" />);
    expect(dictee).not.toContain('Itérer une gagnante');
    expect(dictee).not.toContain('Cité ·');
    expect(dictee).not.toContain('[[SOURCE');
  });

  it('même portée · aucune alerte, envoi possible', () => {
    const html = formulaire({ niveau: 'plateforme' });
    expect(html).not.toContain('ÉLARGIT');
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Publier<\/button>/);
  });
});

describe('page · le garde lit le rôle d’ÉQUIPE, jamais le rôle d’espace', () => {
  beforeEach(() => { h.vue = vue(fixtures()); });
  const base = { user: { id: 'u', email: 'x@y.test', name: null }, workspaceId: 'w', workspaceName: 'W', role: 'owner', plan: 'plus' };
  const url = async () => { try { await ConnaissancesPage(); return '(pas de redirect)'; } catch (e) { if (e instanceof h.RedirectErr) return e.url; throw e; } };

  it('owner d’espace (aucun rôle d’équipe) → /dashboard', async () => {
    h.session = { ...base, equipe: null };
    expect(await url()).toBe('/dashboard');
  });
  it('admin d’espace → /dashboard', async () => {
    h.session = { ...base, role: 'admin', equipe: undefined };
    expect(await url()).toBe('/dashboard');
  });
  it('sans session → /login', async () => {
    h.session = null;
    expect(await url()).toBe('/login');
  });
  it('Admin plateforme · la page se rend avec ses connaissances', async () => {
    h.session = { ...base, role: 'member', equipe: { role: 'admin', matrice: {} } };
    const html = renderToStaticMarkup(await ConnaissancesPage());
    expect(html).toContain('<h1');
    expect(html).toContain('Connaissances');
    expect(html).toContain('Chiffres du marché');
  });

  it('titre · le jeton h1 du cadre, tel quel, en tête de la rangée, sans marge haute', async () => {
    h.session = { ...base, equipe: { role: 'adminplus', matrice: {} } };
    const html = renderToStaticMarkup(await ConnaissancesPage());
    const h1Html = html.match(/<h1 [^>]*>Connaissances<\/h1>/)?.[0] ?? '';
    expect(h1Html).toContain(`style="${styleHtml(h1)}"`);
    // La rangée qui porte le titre ne pousse rien vers le bas.
    const avant = html.slice(0, html.indexOf(h1Html));
    expect(avant.slice(avant.lastIndexOf('<div')).replace(/\s/g, '')).toContain('margin-top:0');
  });
});

describe('/jarvis/sources · titre sur l’axe du cadre', () => {
  // La page lit la base et la mémoire · on garde la règle sur la source : le
  // titre est le jeton `h1`, et plus rien ne le précède dans sa rangée (l'icône
  // le décalait de 32 px).
  const src = readFileSync(join(process.cwd(), 'app/(app)/jarvis/sources/page.tsx'), 'utf8');
  it('les deux titres utilisent le jeton h1 et aucune icône ne les précède', () => {
    expect(src.match(/<h1 style=\{h1\}>Sources de Jarvis<\/h1>/g)?.length).toBe(2);
    expect(src).not.toMatch(/<Icon name="brain"[^\n]*\n\s*<h1/);
    expect(src).not.toMatch(/<h1 style=\{\{/);
    // La rangée de titre est le PREMIER élément du cadre · rien ne la pousse vers le bas.
    const corps = src.slice(src.lastIndexOf('<main style={cadrePage}>'));
    const premier = corps.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').match(/<main style=\{cadrePage\}>\s*<div[^>]*>\s*<div[^>]*>\s*<h1 style=\{h1\}>/);
    expect(premier, 'le titre n’est pas en tête du cadre').not.toBeNull();
  });
});

describe('Jarvis · ce qui entre, ce qui est cité', () => {
  it('le contexte montre les connaissances incluses, leur portée, et le retrait sans promesse d’oubli', () => {
    const html = renderToStaticMarkup(
      <JarvisContexte
        contexte={{ brandId: 'b', identity: null, rules: null, hooks: null, connaissances: { inclus: [{ ref: 'Kaaaa-v1', titre: 'Itérer une gagnante', type: 'methode', tronquee: true }], horsPlace: 2 } }}
        brandName="Neva" measuredAds={0} onClose={() => {}}
      />,
    );
    expect(html).toContain('Connaissances de l’équipe');
    expect(html).toContain('portée · équipe plateforme');
    expect(html).toContain('Itérer une gagnante');
    expect(html).toContain('Méthode d’itération · tronquée');
    expect(html).toContain('2 autre(s) n’ont pas tenu');
    expect(html).toContain('les réponses déjà données ne sont pas réécrites');
  });

  it('sous une réponse · la source citée s’affiche par son titre, le marqueur disparaît, l’inconnue est ignorée', () => {
    const html = renderToStaticMarkup(
      <Tour
        turn={{ id: '1', role: 'assistant', content: 'Isole l’accroche.\n[[SOURCE:Kaaaa-v1]]\n[[SOURCE:Kbbbb-v2]]\n[[SOURCE:Kzzzz-v9]]', at: T }}
        sources={{ 'Kaaaa-v1': { titre: 'Itérer une gagnante', enService: true }, 'Kbbbb-v2': { titre: 'Ancienne', enService: false } }}
      />,
    );
    expect(html).toContain('Isole l’accroche.');
    expect(html).not.toContain('[[SOURCE');
    expect(html).toContain('Cité ·');
    expect(html).toContain('Itérer une gagnante');
    expect(html).toContain('Ancienne · retirée depuis');
    expect(html).not.toContain('Kzzzz');
  });
});
