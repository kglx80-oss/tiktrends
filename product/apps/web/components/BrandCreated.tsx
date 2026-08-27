'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './Modal';
import { importProductsAction } from '../app/actions/brand-detail';
import { SubmitButton } from './SubmitButton';

/**
 * Fin de création d'une marque : on célèbre, on rappelle ce qui est débloqué, et on
 * propose d'enchaîner sur l'import des produits depuis le site (les visuels produit
 * alimentent directement les pubs IA).
 */
export function BrandCreated({ brandId, brandName, hasSite, importCost }: {
  brandId: string; brandName: string; hasSite: boolean; importCost: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const close = () => { setOpen(false); router.replace(`/brands/${brandId}`); };

  return (
    <Modal open={open} onClose={close} icon="🎉" title="Marque créée !" maxWidth={470}
      subtitle={`Jarvis a tout ce qu'il faut pour générer des créas sur la marque ${brandName}, surveiller tes concurrents et parler à la bonne audience.`}>
      <div style={{ display: 'grid', gap: 14 }}>
        <p style={{ margin: 0, fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
          Profil, charte, audience et concurrents restent modifiables à tout moment depuis la fiche de la marque.
        </p>

        {hasSite ? (
          <>
            <div style={{ border: '1px solid var(--line-2)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Importer les produits depuis ton site</div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>
                Jarvis lit ton site, crée tes fiches produit et récupère les visuels · {importCost} crédits.
              </div>
              <form action={importProductsAction} style={{ marginTop: 11 }}>
                <input type="hidden" name="brandId" value={brandId} />
                <SubmitButton label={`Importer mes produits · ${importCost} cr.`} pendingLabel="Import en cours…" style={{ width: '100%' }} />
              </form>
            </div>
            <button type="button" onClick={close} style={ghost}>Plus tard · voir ma marque →</button>
          </>
        ) : (
          <button type="button" onClick={close} style={{
            padding: '12px 20px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c',
            fontWeight: 800, fontSize: 14, cursor: 'pointer',
          }}>Voir ma marque →</button>
        )}
      </div>
    </Modal>
  );
}

const ghost = { padding: '10px 18px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', fontWeight: 700, fontSize: 13, cursor: 'pointer' } as const;
