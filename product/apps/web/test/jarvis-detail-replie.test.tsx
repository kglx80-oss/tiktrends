import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DetailJarvis } from '../app/(app)/jarvis/DetailJarvis';

/**
 * Jarvis, écran de conversation · le détail vient à la demande.
 *
 * La page « Jarvis » était un tableau de bord de huit blocs sous une
 * conversation reléguée. La direction validée met la conversation au premier
 * plan et REPLIE le détail. On vérifie le RÉSULTAT rendu, pas la présence d'un
 * état : au premier rendu, le détail n'est PAS dans le HTML · seul un
 * déclencheur qui l'annonce fermé l'est. Muter le défaut en ouvert fait
 * apparaître le témoin ci-dessous · la garde tombe.
 *
 * On rend en statique (comme assistant-rendu) · on ne clique pas.
 */
const TEMOIN = 'TEMOIN-DETAIL-JARVIS';

function rendu(): string {
  return renderToStaticMarkup(
    <DetailJarvis brandName="Neva">
      <div>{TEMOIN}</div>
    </DetailJarvis>,
  );
}

describe('DetailJarvis · replié par défaut, la conversation au premier plan', () => {
  const html = rendu();

  it('le détail n’est pas rendu tant qu’on ne l’a pas demandé', () => {
    expect(html, 'le détail s’affiche d’emblée · la conversation n’est plus au premier plan')
      .not.toContain(TEMOIN);
  });

  it('le déclencheur annonce l’écran replié et nomme la marque', () => {
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('ce que Jarvis sait sur Neva');
  });

  it('la région pilotée existe (aria-controls la vise) même repliée', () => {
    const m = html.match(/aria-controls="([^"]+)"/);
    expect(m, 'le déclencheur ne pilote aucune région').toBeTruthy();
    expect(html, 'la région pilotée est absente du DOM').toContain(`id="${m![1]}"`);
  });
});
