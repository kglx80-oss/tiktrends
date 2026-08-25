'use client';

import { useState } from 'react';
import { saveEdenRulesAction } from '../../actions/eden';

const PRESET = `Style visuel : premium, lumineux, épuré. Le produit toujours net, au premier plan, proportions réelles.
Ton : direct, expert, chaleureux. Pas de superlatifs creux ni de promesses non tenables.
Toujours : accroche qui claque en 3-5 mots, CTA orienté action, packaging fidèle.
Jamais : le mot « miracle », fausses réductions, texte illisible, mannequins hors-cible.
Mentions obligatoires : « Complément alimentaire » si produit santé.`;

export function EdenRules({ brandName, initial }: { brandName: string | null; initial: string }) {
  const [rules, setRules] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(true);

  async function save() {
    if (busy) return;
    setBusy(true); setMsg('');
    const r = await saveEdenRulesAction({ creativeRules: rules });
    setBusy(false);
    if (r.error) { setOk(false); setMsg(r.error); return; }
    setOk(true); setMsg('Règles EDEN enregistrées. Elles s\'appliquent dès la prochaine génération.');
  }

  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 18, background: 'var(--surface)', padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Règles créatives</h2>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{brandName ? `· ${brandName}` : '· marque active'}</span>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
        Tes consignes maison, en langage naturel. EDEN les impose à <b>chaque</b> génération (image et vidéo), en priorité sur tout le reste : style, ton, obligations, interdits, mentions.
      </p>
      <textarea
        value={rules}
        onChange={(e) => setRules(e.target.value)}
        placeholder={PRESET}
        style={{ width: '100%', minHeight: 220, padding: '13px 15px', borderRadius: 14, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 14, lineHeight: 1.6, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
      />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
        {!rules.trim() && <button type="button" onClick={() => setRules(PRESET)} style={{ fontSize: 12, fontWeight: 700, padding: '8px 13px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>Charger un exemple</button>}
        <span style={{ flex: 1 }} />
        {msg && <span style={{ fontSize: 12.5, color: ok ? '#9fe6b3' : '#f5b043' }}>{msg}</span>}
        <button type="button" onClick={save} disabled={busy} style={{ padding: '11px 20px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13.5, cursor: busy ? 'default' : 'pointer', background: 'var(--grad-accent)', color: '#0d070c', opacity: busy ? .6 : 1 }}>{busy ? 'Enregistrement…' : 'Enregistrer les règles'}</button>
      </div>
    </div>
  );
}
