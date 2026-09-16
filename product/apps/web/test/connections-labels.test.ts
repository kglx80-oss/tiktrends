import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Les champs de connexion (Shopify, Meta) avaient un `<label>` voisin non lié ·
 * sans `htmlFor`, le champ n'a pas de nom accessible. On exige que chaque
 * libellé soit lié à son champ par un id partagé. Non couvert par une règle
 * globale.
 *
 * Écran client à actions serveur · non rendable · garde par adoption de la
 * source · un id présent des DEUX côtés (label + champ) est le lien réel.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/connections/DataConnections.tsx'), 'utf8');

const ids = ['conn-shopify-domaine', 'conn-shopify-token', 'conn-meta-acct', 'conn-meta-token', 'conn-meta-adaccount'];

describe('Connexions · chaque champ est lié à son libellé', () => {
  for (const id of ids) {
    it(`le champ « ${id} » a un libellé lié`, () => {
      expect(src, `libellé non lié pour ${id}`).toContain(`htmlFor="${id}"`);
      expect(src, `champ sans id pour ${id}`).toContain(`id="${id}"`);
    });
  }
});
