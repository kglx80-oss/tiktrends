// @vitest-environment jsdom
import { it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentVide } from '../components/studios/editeur/DocumentVide';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
it('finalisation : aucun enregistrement au montage, média et textes exacts transmis seulement au clic', async () => {
  const conteneur = document.createElement('div');
  document.body.appendChild(conteneur);
  const root = createRoot(conteneur);
  const onCreer = vi.fn();
  try {
    await act(async () => root.render(<DocumentVide formatPropose={{ format: '1:1', depuisBrief: true, texte: '1:1' }} produitDisponible peutEnregistrer enCours={false} onCreer={onCreer} medias={[{ assetId: 'asset_image', nom: 'Image', mime: 'image/png', width: 1024, height: 1024 }]} textes={['HYDRA THERAPY', 'Soin BTX · 300 g']} />));
    expect(onCreer).not.toHaveBeenCalled();
    expect(conteneur.querySelector('textarea')!.value).toBe('HYDRA THERAPY\nSoin BTX · 300 g');
    const bouton = Array.from(conteneur.querySelectorAll('button')).find(b => b.textContent === 'Ouvrir ma création dans l’éditeur')!;
    await act(async () => bouton.click());
    expect(onCreer).toHaveBeenCalledTimes(1);
    expect(onCreer).toHaveBeenCalledWith('1:1', false, 'asset_image', ['HYDRA THERAPY', 'Soin BTX · 300 g']);
  } finally { await act(async () => root.unmount()); conteneur.remove(); }
});
