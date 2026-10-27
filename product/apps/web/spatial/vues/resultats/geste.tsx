'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSpatial } from '../../coquille/contexte';

/**
 * Un geste RÉEL de la rubrique · appelle l'action serveur existante, affiche son
 * erreur telle quelle, et n'annonce une réussite (message + toast) que sur un
 * retour sans erreur. Un seul geste à la fois · la page se recalcule ensuite.
 */
export function useGeste() {
  const router = useRouter();
  const { toast } = useSpatial();
  const [occupe, setOccupe] = useState<string | null>(null);
  const [message, setMessage] = useState<{ texte: string; erreur: boolean } | null>(null);
  async function geste<T extends { error?: string }>(cle: string, f: () => Promise<T>, reussi: (r: T) => string | null, o: { rafraichir?: boolean } = {}): Promise<T | null> {
    if (occupe) return null;
    setOccupe(cle); setMessage(null);
    try {
      const r = await f();
      if (r.error) { setMessage({ texte: r.error, erreur: true }); return null; }
      const t = reussi(r);
      if (t) { setMessage({ texte: t, erreur: false }); toast(t); }
      if (o.rafraichir !== false) router.refresh();
      return r;
    } finally {
      setOccupe(null);
    }
  }
  return { occupe, message, setMessage, geste };
}

/** Le compte rendu d'un geste · une erreur se lit comme une alerte, une réussite comme un statut. */
export function Retour({ message }: { message: { texte: string; erreur: boolean } | null }) {
  if (!message) return null;
  return <p className="faint" role={message.erreur ? 'alert' : 'status'} style={{ fontSize: '12.5px', marginTop: 10, color: message.erreur ? 'var(--bad)' : undefined }}>{message.texte}</p>;
}
