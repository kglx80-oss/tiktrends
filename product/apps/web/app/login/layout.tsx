import type { ReactNode } from 'react';
// Ancienne interface · ses styles viennent de `globals.css`, importé par chacun
// de ses segments (le layout racine n'en charge aucun · garde `spatial-fondation`).
import '../globals.css';

export default function Segment({ children }: { children: ReactNode }) {
  return children;
}
