import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

const lus = [...new Set(SOURCES.flatMap((f) => readFileSync(join(PRODUIT, f), 'utf8').match(/\bSTRIPE_[A-Z_]+\b/g) ?? []))].sort();

describe('gabarits d’environnement · variables Stripe', () => {
  it('le relevé trouve bien la clé, le secret du webhook et les trois prix', () => {
    expect(lus).toEqual(expect.arrayContaining(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_CORE', 'STRIPE_PRICE_PLUS', 'STRIPE_PRICE_BUSINESS']));
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
