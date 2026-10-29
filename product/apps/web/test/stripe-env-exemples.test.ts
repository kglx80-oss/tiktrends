import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { variablesPrixV2 } from '@tiktrends/core';

/**
 * Les variables Stripe lues par le code sont déclarées, VIDES, dans les deux
 * gabarits d'environnement (audit crédits du 29/10, §1.5).
 *
 * Défaut : `lib/stripe.ts` lit `STRIPE_PRICE_CORE`, `STRIPE_PRICE_PLUS` et
 * `STRIPE_PRICE_BUSINESS`, le webhook lit `STRIPE_WEBHOOK_SECRET`, mais ces noms
 * manquaient à `.env.example` et/ou `.env.deploy.example`. Le propriétaire, qui
 * remplit `.env.deploy` sur le VPS à partir du gabarit, ne pouvait pas deviner
 * qu'il fallait les poser · et un lien `buy.stripe.com` collé à la place d'un
 * `price_…` ne créditerait jamais le client.
 *
 * On lit le RÉSULTAT · le contenu des deux gabarits, pour CHAQUE nom que le code
 * lit vraiment (relevé dans les sources, pas dans une liste recopiée).
 *
 * Mutations faites à la main (restaurées par `git checkout --`) :
 *  · retirer `STRIPE_PRICE_PLUS=` de `.env.deploy.example` ⇒ « absente » ;
 *  · y poser une valeur (`price_123`) ⇒ « doit rester vide ».
 */
const PRODUIT = join(process.cwd(), '../..');
const SOURCES = ['apps/web/lib/stripe.ts', 'apps/web/app/api/stripe/webhook/route.ts', 'apps/web/app/actions/stripe.ts'];
const GABARITS = ['.env.example', '.env.deploy.example'];

const textes = SOURCES.map((f) => readFileSync(join(PRODUIT, f), 'utf8'));
/**
 * Offre V2 (29/10) · les noms des prix sont CONSTRUITS par le noyau
 * (`variablePrixForfait`, `variablePrixRecharge`) · ils comptent comme lus dès
 * que le code appelle ces fonctions. Mutation faite (restaurée) · retirer
 * `STRIPE_PRICE_RECHARGE_AGENCE_15000=` d'un gabarit ⇒ « absente ».
 */
const construits = variablesPrixV2();
const appelle = (f: string) => textes.some((t) => t.includes(`${f}(`));
const lus = [...new Set([
  ...textes.flatMap((t) => t.match(/\bSTRIPE_[A-Z_]+\b/g) ?? []),
  ...(appelle('variablePrixForfait') ? construits.forfaits : []),
  ...(appelle('variablePrixRecharge') ? construits.recharges : []),
])].sort();

describe('gabarits d’environnement · variables Stripe', () => {
  it('le relevé trouve bien la clé, le secret du webhook, les trois prix d’aujourd’hui, les six prix V2 et les neuf recharges V2', () => {
    expect(lus).toEqual(expect.arrayContaining(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_CORE', 'STRIPE_PRICE_PLUS', 'STRIPE_PRICE_BUSINESS']));
    expect(lus).toEqual(expect.arrayContaining(['STRIPE_PRICE_ESSENTIEL_MENSUEL', 'STRIPE_PRICE_ESSENTIEL_ANNUEL', 'STRIPE_PRICE_PRO_MENSUEL', 'STRIPE_PRICE_PRO_ANNUEL', 'STRIPE_PRICE_AGENCE_MENSUEL', 'STRIPE_PRICE_AGENCE_ANNUEL']));
    expect(lus.filter((n) => n.startsWith('STRIPE_PRICE_RECHARGE_'))).toHaveLength(9);
  });

  for (const g of GABARITS) {
    it(`${g} · chaque variable lue est déclarée, vide`, () => {
      const lignes = readFileSync(join(PRODUIT, g), 'utf8').split('\n');
      const problemes: string[] = [];
      for (const nom of lus) {
        const l = lignes.find((x) => x.startsWith(`${nom}=`));
        if (l === undefined) problemes.push(`${nom} absente`);
        else if (l.trim() !== `${nom}=`) problemes.push(`${nom} doit rester vide (aucune valeur réelle dans un gabarit)`);
      }
      expect(problemes).toEqual([]);
    });

    it(`${g} · les prix sont des « price_… », jamais un lien buy.stripe.com`, () => {
      const texte = readFileSync(join(PRODUIT, g), 'utf8');
      expect(texte).toMatch(/price_…/);
      expect(texte).toMatch(/JAMAIS un lien « buy\.stripe\.com »/);
    });
  }
});
