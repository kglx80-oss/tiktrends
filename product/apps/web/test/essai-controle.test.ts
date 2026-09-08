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
    // publicités ferait payer trois images jamais demandées. Et une pub
    // rattrapée a coûté deux images · le compteur `imagesFal` tient les deux
    // cas, là où compter les publicités livrées les perdrait tous les deux.
    expect(SRC, 'le prix d’un essai ne passe plus par sa règle').toMatch(/prixEssai\(essaiVariable, count, modelSpec\.credits\)/);
    const bloc = SRC.slice(SRC.indexOf('Remboursement · images non produites') - 900);
    expect(bloc, 'le remboursement ne compte plus les images réellement produites').toMatch(/creditsPerImage \* facturables/);
    expect(bloc, 'le remboursement facture les publicités composées, pas les images').not.toMatch(/creditsPerImage \* ads\.length/);
  });

  it('réserve la marge de reprise en entière · le prix est annoncé, jamais découvert', () => {
    // Une pub entière cassée est reprise une fois · cette image de plus doit
    // être RÉSERVÉE avant le clic, sinon on dépenserait un dollar sans l'avoir
    // dit. La marge n'existe qu'en entière hors essai, et le non-utilisé est
    // remboursé par le compteur d'images réel.
    expect(SRC, 'la réservation n’inclut plus la marge de reprise').toMatch(/imagesAReserver\(count, reprisesBudget > 0\)/);
    expect(SRC, 'la reprise n’est plus bornée à l’entière hors essai')
      .toMatch(/reprisesBudget = mode === 'entiere' && !essaiVariable \? budgetReprises\(count\) : 0/);
    expect(SRC, 'la reprise ne passe plus par la règle du noyau').toMatch(/indicesARattraper\(constats, o\.reprisesBudget/);
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
