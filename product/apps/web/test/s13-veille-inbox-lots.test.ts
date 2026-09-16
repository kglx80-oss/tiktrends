import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * S13 · harmonisation · les erreurs passent par le composant partagé `Bandeau`
 * (comme la Veille et la Table Adsmap le font déjà), et la Veille gagne un
 * « Réinitialiser » quand un critère est actif.
 *
 * Composants non rendables · garde par adoption de la source.
 */
const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('S13 · erreurs via Bandeau (Inbox, Lots) et reset Veille', () => {
  it('Inbox annonce ses erreurs via Bandeau, plus par un <p> rouge à la main', () => {
    const s = read('app/(app)/adsmap/Inbox.tsx');
    expect(s).toContain('<Bandeau ton="error">{error}</Bandeau>');
    expect(s, 'un <p> rouge d’erreur subsiste').not.toContain("color: '#ff8095', fontSize: 13 }}>{error}");
  });

  it('Lots annonce son erreur via Bandeau', () => {
    const s = read('app/(app)/adsmap/lots/Lots.tsx');
    expect(s).toContain('<Bandeau ton="error">{error}</Bandeau>');
  });

  it('Veille propose Réinitialiser quand un critère est actif', () => {
    const s = read('app/(app)/veille/page.tsx');
    // Le lien de reset est GARDÉ par le critère actif · sinon il s'afficherait
    // même sur la vue par défaut (rien à réinitialiser).
    const i = s.indexOf('{filtresVeilleActifs && (');
    expect(i, 'le reset n’est pas gardé par un critère actif').toBeGreaterThan(-1);
    const bloc = s.slice(i, i + 520);
    expect(bloc).toContain('<a href="/veille"');
    expect(bloc).toContain('Réinitialiser');
  });
});
