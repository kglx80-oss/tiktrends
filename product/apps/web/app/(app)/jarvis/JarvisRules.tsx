'use client';

import { useState } from 'react';
import { saveJarvisRulesAction, proposeJarvisRulesAction } from '../../actions/jarvis';

const PRESET = `Style visuel : premium, lumineux, épuré. Le produit toujours net, au premier plan, proportions réelles.
Ton : direct, expert, chaleureux. Pas de superlatifs creux ni de promesses non tenables.
Toujours : accroche qui claque en 3-5 mots, CTA orienté action, packaging fidèle.
Jamais : le mot « miracle », fausses réductions, texte illisible, mannequins hors-cible.
Mentions obligatoires : « Complément alimentaire » si produit santé.`;

// Playbooks maison par typologie · point de départ rapide.
const PLAYBOOKS: Array<{ key: string; label: string; rules: string }> = [
  { key: 'dtc', label: 'DTC premium', rules: `Style visuel : premium, lumière douce, fond épuré, macro produit net, proportions réelles.
Ton : expert, désirable, rassurant.
Toujours : bénéfice concret en accroche, preuve (chiffre/ingrédient), CTA clair, packaging fidèle.
Jamais : superlatifs creux, avant/après trompeur, texte illisible.
Mentions obligatoires : aucune sauf obligation légale.
Edge concurrentiel : plus concret et spécifique que la moyenne, zéro promesse gonflée.` },
  { key: 'beauty', label: 'Beauté / soin', rules: `Style visuel : peau réaliste, lumière flatteuse, textures visibles, palette marque.
Ton : sensoriel, sûr de soi, inclusif.
Toujours : résultat crédible, ingrédient héros nommé, diversité des profils.
Jamais : retouche irréaliste, promesse médicale, « miracle ».
Mentions obligatoires : mentions cosmétiques si allégation.
Edge concurrentiel : preuve + inclusivité, pas de perfection artificielle.` },
  { key: 'supp', label: 'Compléments', rules: `Style visuel : clean, énergique, produit net, ingrédients naturels visibles.
Ton : pédagogue, motivant, honnête.
Toujours : bénéfice fonctionnel précis, dosage/ingrédient clé, CTA action.
Jamais : allégation santé interdite, « guérit », fausse urgence.
Mentions obligatoires : « Complément alimentaire · ne remplace pas une alimentation variée ».
Edge concurrentiel : transparence des actifs, ton anti-hype.` },
  { key: 'fashion', label: 'Mode / lifestyle', rules: `Style visuel : éditorial, mouvement, lumière naturelle, cadrage dynamique.
Ton : affirmé, tendance, désirable.
Toujours : matière et coupe mises en valeur, contexte d'usage réel, CTA désir.
Jamais : proportions déformées, logos parasites, texte qui charge l'image.
Mentions obligatoires : aucune.
Edge concurrentiel : direction artistique forte et cohérente, reconnaissable.` },
];

const DIMS: Array<{ label: string; re: RegExp }> = [
  { label: 'Style visuel', re: /style visuel|lumi|cadrage|couleur|palette/i },
  { label: 'Ton', re: /\bton\b|voix|registre/i },
  { label: 'Toujours', re: /toujours/i },
  { label: 'Jamais', re: /jamais/i },
  { label: 'Mentions', re: /mention/i },
  { label: 'Edge concurrentiel', re: /edge|démarqu|concurrent|différenci/i },
];

export function JarvisRules({ brandName, initial }: { brandName: string | null; initial: string }) {
  const [rules, setRules] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(true);

  const covered = DIMS.filter((d) => d.re.test(rules));
  const score = Math.round((covered.length / DIMS.length) * 100);
  const words = rules.trim() ? rules.trim().split(/\s+/).length : 0;

  async function save() {
    if (busy) return;
    setBusy(true); setMsg('');
    const r = await saveJarvisRulesAction({ creativeRules: rules });
    setBusy(false);
    if (r.error) { setOk(false); setMsg(r.error); return; }
    setOk(true); setMsg('Règles Jarvis enregistrées. Elles s\'appliquent dès la prochaine génération.');
  }

  async function generate() {
    if (aiBusy) return;
    if (rules.trim() && !confirm('Remplacer le règlement actuel par la proposition de Jarvis ?')) return;
    setAiBusy(true); setMsg('');
    const r = await proposeJarvisRulesAction();
    setAiBusy(false);
    if (r.error) { setOk(false); setMsg(r.error); return; }
    if (r.rules) { setRules(r.rules); setOk(true); setMsg(`Proposition générée par Jarvis${r.cost ? ` (${r.cost} crédits)` : ''}. Vérifie, ajuste, puis enregistre.`); }
  }

  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 18, background: 'var(--surface)', padding: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Règles créatives</h2>
        <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{brandName ? `· ${brandName}` : '· marque active'}</span>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={generate} disabled={aiBusy} style={{ fontSize: 12.5, fontWeight: 800, padding: '8px 14px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', cursor: aiBusy ? 'default' : 'pointer', opacity: aiBusy ? .6 : 1 }}>
          {aiBusy ? 'Jarvis réfléchit…' : '✦ Générer par IA (marque + concurrents)'}
        </button>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
        Tes consignes maison, en langage naturel. Jarvis les impose à <b>chaque</b> génération (image et vidéo), en priorité sur tout le reste : style, ton, obligations, interdits, mentions.
      </p>

      {/* Score de force du règlement */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
          <span style={{ position: 'relative', width: 30, height: 30, borderRadius: '50%', background: `conic-gradient(${score >= 80 ? '#3ddc97' : 'var(--accent-strong)'} ${score * 3.6}deg, var(--line-2) 0)`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--surface)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: 'var(--ink)' }}>{score}</span>
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>Force du règlement</span>
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {DIMS.map((d) => {
            const on = d.re.test(rules);
            return <span key={d.label} style={{ fontSize: 10.5, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color: on ? '#0d3d2a' : 'var(--muted)', background: on ? 'rgba(126,232,191,.2)' : 'var(--line)' }}>{on ? '✓' : '·'} {d.label}</span>;
          })}
        </div>
        <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>{words} mots</span>
      </div>

      <textarea
        value={rules}
        onChange={(e) => setRules(e.target.value)}
        placeholder={PRESET}
        style={{ width: '100%', minHeight: 240, padding: '13px 15px', borderRadius: 14, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 14, lineHeight: 1.6, outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
      />

      {/* Playbooks */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>Playbooks :</span>
        {PLAYBOOKS.map((p) => (
          <button key={p.key} type="button" onClick={() => { if (!rules.trim() || confirm(`Charger le playbook « ${p.label} » ? Cela remplace le texte actuel.`)) setRules(p.rules); }}
            style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer' }}>{p.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14, flexWrap: 'wrap' }}>
        <span style={{ flex: 1 }} />
        {msg && <span style={{ fontSize: 12.5, color: ok ? '#9fe6b3' : '#f5b043' }}>{msg}</span>}
        <button type="button" onClick={save} disabled={busy} style={{ padding: '11px 20px', borderRadius: 999, border: 'none', fontWeight: 800, fontSize: 13.5, cursor: busy ? 'default' : 'pointer', background: 'var(--grad-accent)', color: '#0d070c', opacity: busy ? .6 : 1 }}>{busy ? 'Enregistrement…' : 'Enregistrer les règles'}</button>
      </div>
    </div>
  );
}
