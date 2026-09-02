import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Un lot annoncé comme contrôlé en est vraiment un.
 *
 * ── Pourquoi c'est plus grave qu'un bug ordinaire ────────────────────────────
 *
 * Un lot libre qui rate se voit : les publicités sont moches, on recommence. Un
 * lot d'essai qui n'en est pas un ne se voit PAS · il rend quatre publicités
 * normales, et on lui fait confiance pour conclure. On décide alors sur une
 * comparaison fausse, et on décide encore une fois par mois pendant six mois.
 *
 * Trois propriétés le tiennent, et aucune ne tient toute seule.
 */

const SRC = readFileSync(join(process.cwd(), 'app/actions/ads.ts'), 'utf8');

describe('le lot d’essai tient son contrat', () => {
  it('vérifie le lot AVANT de l’enregistrer', () => {
    const verif = SRC.indexOf('verifieEssai(');
    const insert = SRC.indexOf('db!.insert(schema.generations)');
    expect(verif, 'le contrôle du lot a disparu').toBeGreaterThan(-1);
    expect(insert, 'l’enregistrement a disparu').toBeGreaterThan(-1);
    expect(verif, 'le lot est enregistré avant d’être vérifié').toBeLessThan(insert);
  });

  it('retire la marque d’essai quand le contrat n’est pas tenu', () => {
    // Livrer les publicités est juste · elles ont été payées. Les livrer EN
    // DISANT que c'est un essai ne l'est pas.
    const bloc = SRC.slice(SRC.indexOf('verifieEssai('), SRC.indexOf('const ads: AdItem[] = []'));
    expect(bloc, 'la marque d’essai survit à un contrat rompu').toMatch(/recipe\.essai = null/);
    expect(bloc, 'l’appelant n’est pas prévenu').toMatch(/essaiRompu/);
  });

  it('facture les images produites, pas les publicités composées', () => {
    // Un essai compose quatre publicités sur une seule image · compter les
    // publicités ferait payer trois images jamais demandées.
    expect(SRC, 'le prix d’un essai ne passe plus par sa règle').toMatch(/prixEssai\(essaiVariable, count, modelSpec\.credits\)/);
    const bloc = SRC.slice(SRC.indexOf('Remboursement · images non produites') - 900);
    expect(bloc, 'le remboursement compte encore les publicités').toMatch(/imagesProduites/);
  });

  it('ne produit qu’une scène quand la scène est tenue', () => {
    // Sans cette carte, un essai d'accroches paierait quatre images pour un lot
    // dont tout l'intérêt est d'en partager une.
    expect(SRC).toMatch(/sceneFor:\s*essaiVariable && essaiVariable !== 'univers'/);
    expect(SRC, 'les scènes ne sont plus dédoublonnées').toMatch(/new Set\(slots\)/);
  });

  it('impose une coquille unique aux essais qui ne la testent pas', () => {
    // Sinon la longueur de chaque accroche fait basculer certaines publicités
    // vers une autre coquille, et DEUX choses varient.
    expect(SRC).toMatch(/coquilleImposee/);
    expect(SRC, 'la coquille imposée n’est plus lue au moment de choisir')
      .toMatch(/o\.coquilleImposee \? o\.coquilleImposee :/);
  });

  it('dit au modèle que son image servira plusieurs coquilles', () => {
    // Une image cadrée pour l'immersive et composée en affiche perd son sujet ·
    // le compromis doit être demandé, pas espéré.
    expect(SRC).toMatch(/cadragePolyvalent:\s*essaiVariable === 'mise_en_page'/);
    expect(SRC, 'le compromis n’est plus appliqué au prompt').toMatch(/polyvalent \? sceneFramingPolyvalent\(\)/);
  });
});
