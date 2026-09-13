import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le Dashboard n'offre qu'UN chemin pour brancher un compte · via /connections.
 *
 * Il portait un bandeau « Brancher un compte » (→ /connections) ET deux boutons
 * directs « Connecter TikTok/Meta ». Le doublon brouillait le fil, et le bouton
 * TikTok lançait un flux OAuth incomplet (app id factice, sans vérif session).
 * On garde le seul chemin cohérent : le bandeau vers /connections, foyer unique
 * de la connexion.
 *
 * La page est un composant serveur (db, session) · non rendable en test. On
 * éprouve l'ADOPTION par la source.
 */
const src = readFileSync(join(process.cwd(), 'app/(app)/dashboard/page.tsx'), 'utf8');

describe('Dashboard · un seul point d’entrée pour la connexion', () => {
  it('aucun CTA OAuth direct sur le Dashboard', () => {
    // Les liens `/api/oauth/*` sont l'affaire de /connections, pas du Dashboard.
    expect((src.match(/\/api\/oauth\//g) ?? []).length, 'un CTA OAuth direct traîne encore').toBe(0);
  });

  it('le bandeau route vers /connections, chemin unique de connexion', () => {
    expect(src, 'le chemin unique vers /connections a disparu').toContain("sortie={{ href: '/connections'");
  });
});
