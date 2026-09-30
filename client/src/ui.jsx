import { useEffect, useRef, useState } from 'react';

export function usePolling(fn, ms) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [k, setK] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const d = await fnRef.current();
        if (alive) { setData(d); setErr(''); }
      } catch (e) {
        if (alive) setErr(e.message);
      }
    }
    tick();
    const it = setInterval(tick, ms);
    return () => { alive = false; clearInterval(it); };
  }, [ms, k]);

  return [data, err, () => setK((v) => v + 1)];
}

export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className={'modal' + (wide ? ' modal-wide' : '')} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Btn({ children, onClick, variant, disabled, type, title }) {
  const cls = 'btn' + (variant ? ' btn-' + variant : '');
  return (
    <button type={type || 'button'} className={cls} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}

export function Badge({ children, color }) {
  return <span className="badge" style={{ background: color || '#7a869a' }}>{children}</span>;
}

export function Toast({ msg, tipo }) {
  if (!msg) return null;
  return <div className={'toast toast-' + (tipo || 'ok')}>{msg}</div>;
}

export function Empty({ text }) {
  return <div className="empty">{text || 'Nada por aqui ainda'}</div>;
}

export function Spinner() {
  return <div className="spinner"></div>;
}