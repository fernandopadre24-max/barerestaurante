export async function req(method, path, body) {
  const token = localStorage.getItem('token');
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) {
    localStorage.removeItem('token');
    window.dispatchEvent(new Event('sessao-modal'));
    throw new Error(json.error || 'Sessão expirada');
  }
  if (!res.ok) throw new Error(json.error || 'Erro inesperado');
  return json;
}

export const api = {
  get: (p) => req('GET', p),
  post: (p, b) => req('POST', p, b),
  put: (p, b) => req('PUT', p, b),
  del: (p) => req('DELETE', p)
};

const brlFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const numFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export function fmtBRL(n) {
  const v = Number(n);
  return Number.isFinite(v) ? brlFmt.format(v) : 'R$ 0,00';
}

export function fmtNum(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '0';
  return numFmt.format(v);
}

export function fmtDT(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function liqOrder(o) {
  const t = Number(o.total) || 0;
  const d = Number(o.desconto) || 0;
  const l = o.total_liquido;
  if (o.status === 'fechado' && l !== null && l !== undefined && l !== '') {
    return Math.max(0, Number(l));
  }
  return Math.max(0, t - d);
}

export const STATUS_LABEL = {
  enviado: 'Enviado',
  em_preparo: 'Em preparo',
  entregue: 'Entregue',
  fechado: 'Fechado'
};

export const STATUS_COLOR = {
  enviado: '#ffb020',
  em_preparo: '#4da8ff',
  entregue: '#2ecc71',
  fechado: '#7a869a'
};

export const PAG_LABEL = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  debito: 'Cartão Débito',
  credito: 'Cartão Crédito'
};

export const PAG_ICON = {
  pix: '💠',
  dinheiro: '💵',
  debito: '💳',
  credito: '💳'
};

export const PAG_COLOR = {
  pix: '#4fae4e',
  dinheiro: '#2ecc71',
  debito: '#4da8ff',
  credito: '#9b59b6'
};