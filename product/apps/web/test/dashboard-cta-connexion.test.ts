import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le Dashboard n'offre qu'UN chemin pour brancher un compte · via /connections.
 *
 * Il portait un bandeau « Brancher un compte » (→ /connections) ET deux boutons
 * directs « Connecter TikTok/Meta ». Le doublon brouillait le fil, et le bouton
 * TikTok lançait un flux OAuth incomplet (app id factice, sans vérif session).
 * On garde le seul chemin cohérent · une porte vers /connections, foyer unique
 * de la connexion. Lot Dashboard · l'aperçu d'exemple (`ApercuExemple`) porte
 * désormais cette porte, sans laisser croire qu'elle rend les fixtures réelles.
 *
 * La page est un composant serveur (db, session) · non rendable en test. On
 * éprouve l'ADOPTION par la source.
 */
const page = readFileSync(join(process.cwd(), 'app/(app)/dashboard/page.tsx'), 'utf8');
const exemple = readFileSync(join(process.cwd(), 'components/ApercuExemple.tsx'), 'utf8');

describe('Dashboard · un seul point d’entrée pour la connexion', () => {
  it('aucun CTA OAuth direct sur le Dashboard', () => {
    // Les liens `/api/oauth/*` sont l'affaire de /connections, pas du Dashboard.
    expect((page.match(/\/api\/oauth\//g) ?? []).length, 'un CTA OAuth direct traîne sur la page').toBe(0);
    expect((exemple.match(/\/api\/oauth\//g) ?? []).length, 'un CTA OAuth direct traîne dans l’aperçu').toBe(0);
  });

  it('une porte unique route vers /connections (dans l’aperçu d’exemple)', () => {
    expect(exemple, 'le chemin unique vers /connections a disparu').toContain('href="/connections"');
  });
});
