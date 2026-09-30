import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Kevin, 29/09 · B · le CADRE et le COMPOSEUR de Jarvis s'alignent sur les bords
 * de la Veille (maxWidth 1200) · l'ancien plafond 760 rétrécissait toute la page.
 * La largeur de LECTURE reste calée à la colonne « prose » (760, charte) À
 * L'INTÉRIEUR · les longues réponses ne courent pas d'un bord à l'autre.
 *
 * La coquille conversationnelle tire le graphe serveur (streaming, actions) ·
 * on cloue les RÉSULTATS de source, chaque assertion tombe si on remet le défaut.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('Jarvis · cadre + composeur aux bords Veille, lecture bornée à l’intérieur', () => {
  const page = read('app/(app)/jarvis/page.tsx');
  const chat = read('app/(app)/jarvis/JarvisChat.tsx');
  const veille = read('app/(app)/veille/page.tsx');

  it('le cadre conversationnel prend les bords Veille (1200), plus le plafond 760', () => {
    // La référence · Veille est à 1200. Si elle bouge, ce test le signale.
    expect(veille, 'la référence Veille n’est plus à 1200').toContain('maxWidth: 1200');
    // Le <main> conversationnel (le DERNIER du fichier) suit ces bords.
    const iMain = page.lastIndexOf('<main style={{ padding:');
    expect(iMain, 'le cadre conversationnel est introuvable').toBeGreaterThan(-1);
    const cadre = page.slice(iMain, iMain + 170);
    expect(cadre, 'le cadre conversationnel n’est pas aligné à 1200').toContain('maxWidth: 1200');
    // Mutation : remettre `maxWidth: 760` sur le cadre fait tomber cette assertion.
    expect(cadre, 'le plafond 760 est revenu sur le cadre').not.toContain('maxWidth: 760');
  });

  it('le composeur et le fil ne portent plus de plafond 760 (ils suivent le cadre)', () => {
    // Mutation : reposer un `maxWidth: 760` (numérique) sur le composeur ou le fil
    // fait tomber. Les bornes de LECTURE, elles, s'écrivent `min(760px, …)`.
    expect(chat, 'un plafond 760 subsiste sur le composeur ou le fil').not.toContain('maxWidth: 760,');
  });

  it('à l’accueil (fil vide), le composeur prend toute la largeur du cadre · pas la colonne 640', () => {
    // Codex, 30/09 · l'accueil garde le TITRE, le sous-titre et les suggestions en
    // colonne de lecture (640), mais le COMPOSEUR en SORT · il suit les bords du
    // cadre comme en conversation. Une mesure `main = 1200` ne prouvait pas la
    // largeur du composeur · on cloue ici sa structure.
    const iA = chat.indexOf('vide && !enCours ? (');
    const iB = chat.indexOf(') : (', iA);
    expect(iA, 'le bloc d’accueil est introuvable').toBeGreaterThan(-1);
    const accueil = chat.slice(iA, iB);
    const iComp = accueil.indexOf('{composeur}');
    expect(iComp, 'le composeur d’accueil est introuvable').toBeGreaterThan(-1);
    // L'enveloppe DIRECTE du composeur est pleine largeur, sans plafond.
    const openIdx = accueil.lastIndexOf('<div style', iComp);
    const wrap = accueil.slice(openIdx, iComp);
    expect(wrap, 'le composeur d’accueil n’est pas pleine largeur').toContain("width: '100%'");
    expect(wrap, 'le composeur d’accueil est bridé par un maxWidth').not.toContain('maxWidth');
    // La colonne de lecture (640) DOIT être fermée AVANT le composeur · sinon il
    // est nesté dedans et rétréci. Mutation : remettre {composeur} dans la colonne
    // 640 supprime le </div> intermédiaire et fait tomber.
    const i640 = accueil.indexOf('maxWidth: 640');
    expect(i640, 'la colonne de lecture 640 est introuvable').toBeGreaterThan(-1);
    expect(i640, 'la colonne 640 doit précéder le composeur').toBeLessThan(iComp);
    expect(accueil.slice(i640, iComp).includes('</div>'), 'la colonne 640 n’est pas fermée avant le composeur (composeur nesté → rétréci)').toBe(true);
  });

  it('la largeur de LECTURE reste bornée à la colonne prose (760) à l’intérieur', () => {
    expect(chat, 'les réponses ne bornent plus la lecture').toContain("maxWidth: 'min(760px, 92%)'");
    expect(chat, 'les bulles utilisateur ne bornent plus la lecture').toContain("maxWidth: 'min(760px, 86%)'");
  });
});

describe('Jarvis · SectionAttribution · h3 à la graisse charte (500, plus 800)', () => {
  const s = read('app/(app)/jarvis/sections/SectionAttribution.tsx');
  it('les h3 partagés sont en 500 (charte), plus en 800', () => {
    // Mutation : remettre fontWeight 800 sur ces h3 fait tomber.
    expect(s, 'un h3 est resté en graisse 800').not.toContain("fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>");
    expect(s, 'les h3 ne sont pas passés en 500').toContain("fontSize: 14, fontWeight: 500, color: 'var(--ink)' }}>");
  });
});
