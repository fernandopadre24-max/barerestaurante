export const UI_PADRAO = { tema: 'papel', fonte: 'sistema', tamanho: 'medio' };

export function applyUI(ui) {
  const u = { ...UI_PADRAO, ...(ui || {}) };
  const el = document.documentElement;
  el.setAttribute('data-tema', u.tema || 'papel');
  el.setAttribute('data-fonte', u.fonte || 'sistema');
  el.setAttribute('data-tam', u.tamanho || 'medio');
}

export const TEMA_OPCOES = [
  { valor: 'papel', nome: 'Papel', desc: 'Estilo nota de pedido, tom de papel' },
  { valor: 'claro', nome: 'Claro', desc: 'Fundo branco, visual limpo' },
  { valor: 'escuro', nome: 'Escuro', desc: 'Tema escuro, cansa menos à noite' }
];

export const FONTE_OPCOES = [
  { valor: 'sistema', nome: 'Sistema', desc: 'Fonte padrão do Windows/celular' },
  { valor: 'serif', nome: 'Leitura', desc: 'Letra serifada, estilo livro' },
  { valor: 'mono', nome: 'Terminal', desc: 'Monospace, estilo máquina/cupom' }
];

export const TAMANHO_OPCOES = [
  { valor: 'pequeno', nome: 'P', desc: '12px · cabe mais na tela' },
  { valor: 'medio', nome: 'M', desc: '14px · padrão' },
  { valor: 'grande', nome: 'G', desc: '16px · mais confortável' },
  { valor: 'xxg', nome: 'GG', desc: '18px · bem grande' }
];