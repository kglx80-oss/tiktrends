'use client';

import { useState } from 'react';
import { renameBrandAction } from '../app/actions/brands';
import { SubmitButton } from './SubmitButton';
import { Icon } from './Icon';

/**
 * Le titre de la marque, modifiable EN PLACE.
 *
 * Le nom n'était éditable que dans le formulaire de profil, tout en bas de la
 * fiche · on ne le trouvait pas, la marque restait « Ma boutique ». Ici, un
 * crayon sur le titre ouvre une saisie · Entrée ou « Enregistrer » valide,
 * Échap ou « Annuler » referme. Le succès recharge la page (l'action redirige) ·
 * le composant revient à l'affichage avec le nouveau nom.
 */
export function RenameMarque({ id, name }: { id: string; name: string }) {
  const [edite, setEdite] = useState(false);

  if (!edite) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: 'var(--ink)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</h1>
        <button
          type="button" onClick={() => setEdite(true)}
          aria-label="Renommer la marque" title="Renommer la marque"
          style={{
            width: 34, height: 34, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 9, border: '1px solid var(--line-2)', background: 'var(--paper)', color: 'var(--ink-2)', cursor: 'pointer',
          }}
        >
          <Icon name="pen" size={15} />
        </button>
      </div>
    );
  }

  return (
    <form
      action={renameBrandAction}
      onKeyDown={(e) => { if (e.key === 'Escape') setEdite(false); }}
      style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}
    >
      <input type="hidden" name="id" value={id} />
      <input
        name="name" defaultValue={name} required autoFocus aria-label="Nom de la marque"
        style={{
          fontSize: 22, fontWeight: 800, color: 'var(--ink)', background: 'var(--bg, #0d070c)',
          border: '1px solid var(--line-2)', borderRadius: 10, padding: '6px 10px', minWidth: 0, flex: '1 1 220px',
        }}
      />
      <SubmitButton label="Enregistrer" pendingLabel="Enregistrement…" style={{ padding: '9px 16px' }} />
      <button
        type="button" onClick={() => setEdite(false)}
        style={{ padding: '9px 14px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
      >
        Annuler
      </button>
    </form>
  );
}
