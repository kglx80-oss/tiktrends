'use client';

import { useRef, useState, useTransition } from 'react';
import { askAssistant } from '../app/actions/assistant';
import type { ChatMessage } from '@tiktrends/ai';

const SUGGESTIONS = [
  'Quelles créas devrais-je couper ou scaler ?',
  'Donne-moi 5 hooks pour ma marque',
  'Que font mes concurrents en ce moment ?',
  'Analyse ma performance de la semaine',
];

export function AssistantChat({ ready }: { ready: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  function send(q: string) {
    const question = q.trim();
    if (!question || pending) return;
    setError('');
    const history = messages;
    setMessages((m) => [...m, { role: 'user', content: question }]);
    setValue('');
    start(async () => {
      const res = await askAssistant(history, question);
      if (res.error) { setError(res.error); setMessages((m) => m.slice(0, -1).concat({ role: 'user', content: question })); }
      else if (res.reply) setMessages((m) => [...m, { role: 'assistant', content: res.reply! }]);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }));
    });
  }

  return (
    <div style={{ border: '1px solid var(--line-2)', borderRadius: 18, background: 'var(--surface)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: 'var(--grad-accent)', color: '#0d070c', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>✦</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Assistant TikTrends</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{ready ? 'Pose ta question, je connais ton espace' : "S'active dès que la clé IA est posée"}</div>
        </div>
      </div>

      {messages.length > 0 && (
        <div ref={scrollRef} style={{ maxHeight: 340, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '86%' }}>
              <div style={{
                padding: '10px 13px', borderRadius: 14, fontSize: 13.5, lineHeight: 1.55, whiteSpace: 'pre-wrap',
                background: m.role === 'user' ? 'var(--grad-accent)' : 'var(--surface-2, rgba(255,255,255,.04))',
                color: m.role === 'user' ? '#0d070c' : 'var(--ink-2)',
                border: m.role === 'user' ? 'none' : '1px solid var(--line)',
              }}>{m.content}</div>
            </div>
          ))}
          {pending && <div style={{ alignSelf: 'flex-start', fontSize: 12.5, color: 'var(--muted)', padding: '4px 6px' }}>L'assistant réfléchit…</div>}
        </div>
      )}

      {messages.length === 0 && (
        <div style={{ padding: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SUGGESTIONS.map((sug) => (
            <button key={sug} type="button" disabled={!ready || pending} onClick={() => send(sug)} style={{
              fontSize: 12.5, fontWeight: 600, padding: '8px 12px', borderRadius: 999, cursor: ready ? 'pointer' : 'default',
              border: '1px solid var(--line-2)', background: 'transparent', color: ready ? 'var(--ink-2)' : 'var(--muted)', opacity: ready ? 1 : .6,
            }}>{sug}</button>
          ))}
        </div>
      )}

      {error && <div style={{ padding: '0 16px 10px', fontSize: 12.5, color: '#ff9db0' }}>{error}</div>}

      <form onSubmit={(e) => { e.preventDefault(); send(value); }} style={{ display: 'flex', gap: 8, padding: 14, borderTop: '1px solid var(--line)' }}>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={!ready || pending}
          placeholder={ready ? 'Pose ta question…' : 'Assistant en veille (clé IA requise)'}
          style={{ flex: 1, padding: '11px 14px', borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--bg, #0d070c)', color: 'var(--ink)', fontSize: 14, outline: 'none' }}
        />
        <button type="submit" disabled={!ready || pending || !value.trim()} style={{
          padding: '0 18px', borderRadius: 12, border: 'none', fontWeight: 800, fontSize: 14, cursor: ready && value.trim() ? 'pointer' : 'default',
          background: 'var(--grad-accent)', color: '#0d070c', opacity: ready && value.trim() && !pending ? 1 : .5,
        }}>Envoyer</button>
      </form>
    </div>
  );
}
