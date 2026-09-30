const express = require('express');
const { db, hashPin, verifyPin } = require('./db');
const { createSession, destroySession, auth, admin } = require('./auth');
const printer = require('./printer');

const router = express.Router();

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
function hojeStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function locDia(iso) {
  const d = new Date(iso);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const STATUS_OK = ['enviado', 'em_preparo', 'entregue', 'fechado'];
const PAG_OK = ['pix', 'dinheiro', 'debito', 'credito'];
const PAG_LABEL = { pix: 'PIX', dinheiro: 'Dinheiro', debito: 'Cartão Débito', credito: 'Cartão Crédito' };

function getSettings() {
  const ler = (chave, padrao) => {
    const row = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave);
    if (!row) return padrao;
    try { return JSON.parse(row.valor); } catch { return padrao; }
  };
  return { ...ler('app', {}), ui: ler('ui', { tema: 'papel', fonte: 'sistema', tamanho: 'medio' }) };
}

function saveSettings(s) {
  const { ui, ...app } = s || {};
  if (ui !== undefined) {
    db.prepare("INSERT INTO configuracoes (chave, valor) VALUES ('ui', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
      .run(JSON.stringify({ tema: 'papel', fonte: 'sistema', tamanho: 'medio', ...ui }));
  }
  db.prepare("INSERT INTO configuracoes (chave, valor) VALUES ('app', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor")
    .run(JSON.stringify(app));
}

function isAssigned(userId, mesaId) {
  const r = db.prepare('SELECT 1 FROM mesa_funcionario WHERE mesa_id = ? AND funcionario_id = ?').get(mesaId, userId);
  return !!r;
}

function getOrderView(o) {
  const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(o.mesa_id);
  const func = db.prepare('SELECT id, codigo, nome, papel FROM usuarios WHERE id = ?').get(o.funcionario_id);
  const itens = db.prepare(
    'SELECT ip.*, p.nome, p.unidade FROM itens_pedido ip JOIN produtos p ON p.id = ip.produto_id WHERE ip.pedido_id = ? ORDER BY ip.id'
  ).all(o.id);
  return {
    ...o,
    mesa_numero: mesa ? mesa.numero : null,
    mesa_local: mesa ? mesa.local : null,
    funcionario: func || { id: null, codigo: '?', nome: 'Removido' },
    itens
  };
}

function checkOrgao(id) {
  const o = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
  if (!o) throw new Error('Pedido não encontrado');
  return o;
}

function recomputeMesa(mesaId) {
  const c = db.prepare("SELECT COUNT(*) c FROM pedidos WHERE mesa_id = ? AND status IN ('enviado','em_preparo','entregue')").get(mesaId).c;
  const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(mesaId);
  if (mesa) db.prepare('UPDATE mesas SET status = ? WHERE id = ?').run(c > 0 ? 'ocupada' : 'livre', mesaId);
}

function revertOrderItens(pedidoId) {
  const itens = db.prepare('SELECT * FROM itens_pedido WHERE pedido_id = ?').all(pedidoId);
  for (const it of itens) {
    db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(it.quantidade, it.produto_id);
    db.prepare("DELETE FROM movimentos WHERE tipo = 'saida_pedido' AND ref = ?").run('Pedido #' + pedidoId);
  }
  db.prepare('DELETE FROM itens_pedido WHERE pedido_id = ?').run(pedidoId);
}

function applyOrderItens(pedidoId, itens, usuarioId, acumular) {
  const now = new Date().toISOString();
  let total = 0;
  if (acumular) {
    const atual = db.prepare('SELECT total FROM pedidos WHERE id = ?').get(pedidoId);
    total = Number(atual && atual.total ? atual.total : 0) || 0;
  }
  const insItem = db.prepare('INSERT INTO itens_pedido (pedido_id, produto_id, quantidade, preco, subtotal) VALUES (?,?,?,?,?)');
  const updStock = db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?');
  const insMov = db.prepare('INSERT INTO movimentos (produto_id, tipo, quantidade, ref, usuario_id, data) VALUES (?,?,?,?,?,?)');
  for (const it of itens) {
    const p = db.prepare('SELECT * FROM produtos WHERE id = ?').get(it.produto_id);
    if (!p) throw new Error('Produto inválido (id ' + it.produto_id + ')');
    if (!p.ativo) throw new Error('Produto inativo: ' + p.nome);
    const q = Number(it.quantidade);
    if (!q || q <= 0) throw new Error('Quantidade inválida para ' + p.nome);
    if (p.estoque < q) throw new Error('Estoque insuficiente de ' + p.nome + ' (disponível: ' + p.estoque + ')');
    const sub = r2(q * p.preco);
    total = r2(total + sub);
    insItem.run(pedidoId, p.id, q, p.preco, sub);
    updStock.run(q, p.id);
    insMov.run(p.id, 'saida_pedido', -q, 'Pedido #' + pedidoId, usuarioId, now);
  }
  db.prepare('UPDATE pedidos SET total = ? WHERE id = ?').run(total, pedidoId);
}

function applyCompraItens(compraId, itens, usrId) {
  const now = new Date().toISOString();
  let total = 0;
  const insItem = db.prepare('INSERT INTO itens_compra (compra_id, produto_id, quantidade, embalagens, contem, preco_custo, subtotal) VALUES (?,?,?,?,?,?,?)');
  const updStock = db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?');
  const updCusto = db.prepare('UPDATE produtos SET preco_custo = ? WHERE id = ?');
  const insMov = db.prepare('INSERT INTO movimentos (produto_id, tipo, quantidade, ref, usuario_id, data) VALUES (?,?,?,?,?,?)');
  for (const it of itens) {
    const p = db.prepare('SELECT * FROM produtos WHERE id = ?').get(it.produto_id);
    if (!p) throw new Error('Produto inválido (id ' + it.produto_id + ')');
    const q = Number(it.quantidade);
    const contem = Number(it.contem);
    const custoPac = Number(it.preco_custo);
    if (!q || q <= 0) throw new Error('Quantidade inválida');
    if (Number.isFinite(contem) && contem <= 0) throw new Error('"Contém" (unidades por embalagem) inválido');
    const c = Number.isFinite(contem) && contem > 0 ? contem : 1;
    if (custoPac < 0) throw new Error('Custo inválido');
    const unidades = r2(q * c);
    const sub = r2(q * custoPac);
    total = r2(total + sub);
    insItem.run(compraId, p.id, unidades, q, c, custoPac, sub);
    updStock.run(unidades, p.id);
    if (custoPac > 0 && c > 0) updCusto.run(r2(custoPac / c), p.id);
    insMov.run(p.id, 'entrada_compra', unidades, 'Compra #' + compraId, usrId, now);
  }
  db.prepare('UPDATE compras SET total = ? WHERE id = ?').run(total, compraId);
}

function revertCompra(compraId) {
  const itens = db.prepare('SELECT ic.quantidade, ic.produto_id, p.nome FROM itens_compra ic JOIN produtos p ON p.id = ic.produto_id WHERE ic.compra_id = ?').all(compraId);
  const bloqueados = [];
  for (const it of itens) {
    const p = db.prepare('SELECT estoque FROM produtos WHERE id = ?').get(it.produto_id);
    if (p && Number(p.estoque) < Number(it.quantidade)) bloqueados.push(it.nome + ' (saldo ' + p.estoque + ', compra ' + it.quantidade + ')');
  }
  if (bloqueados.length) {
    throw new Error('Não dá para excluir: já foi vendido mais do que foi comprado de ' + bloqueados.join('; ') + '. O estoque ficaria negativo.');
  }
  for (const it of itens) {
    db.prepare('UPDATE produtos SET estoque = estoque - ? WHERE id = ?').run(it.quantidade, it.produto_id);
  }
  for (const it of itens) {
    const restante = db.prepare('SELECT ic.embalagens, ic.contem, ic.preco_custo FROM itens_compra ic WHERE ic.produto_id = ? AND ic.compra_id != ? ORDER BY ic.id DESC LIMIT 1').get(it.produto_id, compraId);
    if (restante && restante.contem > 0 && Number(restante.preco_custo) > 0) {
      db.prepare('UPDATE produtos SET preco_custo = ? WHERE id = ?').run(r2(Number(restante.preco_custo) / Number(restante.contem)), it.produto_id);
    }
  }
  db.prepare("DELETE FROM movimentos WHERE tipo = 'entrada_compra' AND ref = ?").run('Compra #' + compraId);
  db.prepare('DELETE FROM compras WHERE id = ?').run(compraId);
}

// ---------------- AUTH ----------------

router.get('/health', (req, res) => {
  res.json({ ok: true, agora: new Date().toISOString() });
});

router.post('/log', (req, res) => {
  const l = req.body || {};
  console.log(new Date().toISOString() + '  [APP] ' + (l.tipo || 'log') + ' | ' + JSON.stringify(l.msg || ''));
  res.json({ ok: true });
});

router.post('/auth/login', (req, res) => {
  const { codigo, pin } = req.body || {};
  if (!codigo || !pin) return res.status(400).json({ error: 'Informe código e PIN' });
  const u = db.prepare('SELECT * FROM usuarios WHERE codigo = ?').get(String(codigo).trim());
  if (!u || !verifyPin(pin, u.pin)) return res.status(401).json({ error: 'Código ou PIN incorretos' });
  if (!u.ativo) return res.status(403).json({ error: 'Usuário inativo. Procure o ADM.' });
  const token = createSession(u.id);
  const { pin: _, ...safe } = u;
  res.json({ token, usuario: safe });
});

router.get('/auth/me', auth, (req, res) => {
  const { pin, ...safe } = req.usuario;
  res.json({ usuario: safe });
});

router.post('/auth/logout', auth, (req, res) => {
  destroySession(req.token);
  res.json({ ok: true });
});

// ---------------- USUÁRIOS ----------------

router.get('/users', auth, admin, (req, res) => {
  res.json(db.prepare(
    'SELECT id, codigo, nome, papel, ativo, cpf, telefone, cargo, admissao, salario, endereco, criado_em FROM usuarios ORDER BY id'
  ).all());
});

router.post('/users', auth, admin, (req, res) => {
  const { codigo, nome, pin, papel, cpf, telefone, cargo, admissao, salario, endereco } = req.body || {};
  if (!codigo || !nome || !pin) return res.status(400).json({ error: 'Informe código, nome e PIN' });
  const exists = db.prepare('SELECT 1 FROM usuarios WHERE codigo = ?').get(String(codigo).trim());
  if (exists) return res.status(400).json({ error: 'Código já cadastrado' });
  const r = db.prepare(
    'INSERT INTO usuarios (codigo, nome, pin, papel, ativo, cpf, telefone, cargo, admissao, salario, endereco, criado_em) VALUES (?,?,?,?,1,?,?,?,?,?,?,?)'
  ).run(
    String(codigo).trim(), nome, hashPin(pin), papel === 'adm' ? 'adm' : 'func',
    cpf || '', telefone || '', cargo || '', admissao || '', Number(salario) || 0, endereco || '',
    new Date().toISOString()
  );
  res.json({ id: r.lastInsertRowid });
});

router.put('/users/:id', auth, admin, (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
  const { codigo, nome, pin, papel, ativo, cpf, telefone, cargo, admissao, salario, endereco } = req.body || {};
  if (id === req.usuario.id && papel === 'func') {
    return res.status(400).json({ error: 'Você não pode remover o próprio acesso de ADM' });
  }
  if (codigo !== undefined) {
    const exists = db.prepare('SELECT 1 FROM usuarios WHERE codigo = ? AND id != ?').get(String(codigo), id);
    if (exists) return res.status(400).json({ error: 'Código já em uso' });
  }
  const novoTipo = papel !== undefined ? (papel === 'adm' ? 'adm' : 'func') : u.papel;
  const novoAtivo = ativo !== undefined ? (ativo ? 1 : 0) : u.ativo;
  const novoNome = nome !== undefined ? nome : u.nome;
  const novoCodigo = codigo !== undefined ? String(codigo) : u.codigo;
  const novoCpf = cpf !== undefined ? cpf : u.cpf;
  const novoTelefone = telefone !== undefined ? telefone : u.telefone;
  const novoCargo = cargo !== undefined ? cargo : u.cargo;
  const novoAdmissao = admissao !== undefined ? admissao : u.admissao;
  const novoSalario = salario !== undefined ? Number(salario) : u.salario;
  const novoEndereco = endereco !== undefined ? endereco : u.endereco;
  if (pin !== undefined && pin !== '') {
    db.prepare('UPDATE usuarios SET codigo = ?, nome = ?, pin = ?, papel = ?, ativo = ?, cpf = ?, telefone = ?, cargo = ?, admissao = ?, salario = ?, endereco = ? WHERE id = ?')
      .run(novoCodigo, novoNome, hashPin(pin), novoTipo, novoAtivo, novoCpf, novoTelefone, novoCargo, novoAdmissao, novoSalario, novoEndereco, id);
  } else {
    db.prepare('UPDATE usuarios SET codigo = ?, nome = ?, papel = ?, ativo = ?, cpf = ?, telefone = ?, cargo = ?, admissao = ?, salario = ?, endereco = ? WHERE id = ?')
      .run(novoCodigo, novoNome, novoTipo, novoAtivo, novoCpf, novoTelefone, novoCargo, novoAdmissao, novoSalario, novoEndereco, id);
  }
  res.json({ ok: true });
});

router.delete('/users/:id', auth, admin, (req, res) => {
  const id = Number(req.params.id);
  if (id === req.usuario.id) return res.status(400).json({ error: 'Você não pode excluir a si mesmo' });
  db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---------------- MESAS ----------------

function mesaView(m) {
  const funcs = db.prepare(
    'SELECT u.id, u.codigo, u.nome FROM mesa_funcionario mf JOIN usuarios u ON u.id = mf.funcionario_id WHERE mf.mesa_id = ? ORDER BY u.nome'
  ).all(m.id);
  return { ...m, funcionarios: funcs };
}

router.get('/tables', auth, (req, res) => {
  const all = db.prepare('SELECT * FROM mesas ORDER BY numero').all();
  if (req.usuario.papel === 'adm') {
    res.json(all.map(mesaView));
  } else {
    const ids = db.prepare('SELECT mesa_id FROM mesa_funcionario WHERE funcionario_id = ?').all(req.usuario.id).map(r => r.mesa_id);
    res.json(all.filter(m => ids.includes(m.id)).map(mesaView));
  }
});

router.post('/tables', auth, admin, (req, res) => {
  const { numero, capacidade, local } = req.body || {};
  if (!numero) return res.status(400).json({ error: 'Informe o número da mesa' });
  const exists = db.prepare('SELECT 1 FROM mesas WHERE numero = ?').get(Number(numero));
  if (exists) return res.status(400).json({ error: 'Já existe mesa com esse número' });
  const r = db.prepare('INSERT INTO mesas (numero, capacidade, local, status) VALUES (?,?,?,?)')
    .run(Number(numero), Number(capacidade) || 4, local || 'Interno', 'livre');
  res.json({ id: r.lastInsertRowid });
});

router.put('/tables/:id', auth, admin, (req, res) => {
  const id = Number(req.params.id);
  const m = db.prepare('SELECT * FROM mesas WHERE id = ?').get(id);
  if (!m) return res.status(404).json({ error: 'Mesa não encontrada' });
  const { numero, capacidade, local } = req.body || {};
  if (numero !== undefined && Number(numero) !== m.numero) {
    const exists = db.prepare('SELECT 1 FROM mesas WHERE numero = ? AND id != ?').get(Number(numero), id);
    if (exists) return res.status(400).json({ error: 'Número já em uso' });
  }
  db.prepare('UPDATE mesas SET numero = ?, capacidade = ?, local = ? WHERE id = ?')
    .run(numero !== undefined ? Number(numero) : m.numero,
      capacidade !== undefined ? Number(capacidade) : m.capacidade,
      local !== undefined ? local : m.local, id);
  res.json({ ok: true });
});

router.delete('/tables/:id', auth, admin, (req, res) => {
  const id = Number(req.params.id);
  const open = db.prepare("SELECT 1 FROM pedidos WHERE mesa_id = ? AND status IN ('enviado','em_preparo','entregue')").get(id);
  if (open) return res.status(400).json({ error: 'Existem pedidos em aberto nesta mesa' });
  db.prepare('DELETE FROM mesas WHERE id = ?').run(id);
  res.json({ ok: true });
});

router.put('/tables/:id/funcionarios', auth, admin, (req, res) => {
  const id = Number(req.params.id);
  const m = db.prepare('SELECT 1 FROM mesas WHERE id = ?').get(id);
  if (!m) return res.status(404).json({ error: 'Mesa não encontrada' });
  const ids = (req.body || {}).ids || [];
  db.exec('BEGIN');
  try {
    db.prepare('DELETE FROM mesa_funcionario WHERE mesa_id = ?').run(id);
    const ins = db.prepare('INSERT OR IGNORE INTO mesa_funcionario (mesa_id, funcionario_id) VALUES (?,?)');
    for (const fid of ids) ins.run(id, Number(fid));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.json({ ok: true });
});

// ---------------- PRODUTOS ----------------

router.get('/products', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM produtos ORDER BY categoria, nome').all();
  res.json(rows);
});

router.post('/products', auth, admin, (req, res) => {
  const { nome, categoria, preco, preco_custo, estoque, estoque_min, unidade } = req.body || {};
  if (!nome) return res.status(400).json({ error: 'Informe o nome do produto' });
  const r = db.prepare(
    'INSERT INTO produtos (nome, categoria, preco, preco_custo, estoque, estoque_min, unidade, ativo) VALUES (?,?,?,?,?,?,?,1)'
  ).run(nome, categoria || '', Number(preco) || 0, Number(preco_custo) || 0, Number(estoque) || 0, Number(estoque_min) || 0, unidade || 'un');
  res.json({ id: r.lastInsertRowid });
});

router.put('/products/:id', auth, admin, (req, res) => {
  const id = Number(req.params.id);
  const p = db.prepare('SELECT * FROM produtos WHERE id = ?').get(id);
  if (!p) return res.status(404).json({ error: 'Produto não encontrado' });
  const b = req.body || {};
  db.prepare('UPDATE produtos SET nome = ?, categoria = ?, preco = ?, preco_custo = ?, estoque_min = ?, unidade = ?, ativo = ? WHERE id = ?')
    .run(b.nome !== undefined ? b.nome : p.nome,
      b.categoria !== undefined ? b.categoria : p.categoria,
      b.preco !== undefined ? Number(b.preco) : p.preco,
      b.preco_custo !== undefined ? Number(b.preco_custo) : p.preco_custo,
      b.estoque_min !== undefined ? Number(b.estoque_min) : p.estoque_min,
      b.unidade !== undefined ? b.unidade : p.unidade,
      b.ativo !== undefined ? (b.ativo ? 1 : 0) : p.ativo,
      id);
  if (b.estoque !== undefined) {
    const delta = r2(Number(b.estoque) - Number(p.estoque));
    if (delta !== 0) {
      db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(delta, id);
      db.prepare('INSERT INTO movimentos (produto_id, tipo, quantidade, ref, usuario_id, data) VALUES (?,?,?,?,?,?)')
        .run(id, 'ajuste', delta, 'Ajuste pelo cadastro', req.usuario.id, new Date().toISOString());
    }
  }
  res.json({ ok: true });
});

router.delete('/products/:id', auth, admin, (req, res) => {
  db.prepare('DELETE FROM produtos WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

// ---------------- PEDIDOS ----------------

router.get('/orders', auth, (req, res) => {
  const { status, mesa_id, limite } = req.query;
  let sql = 'SELECT * FROM pedidos';
  const where = [];
  const params = [];
  if (req.usuario.papel !== 'adm') {
    const ids = db.prepare('SELECT mesa_id FROM mesa_funcionario WHERE funcionario_id = ?').all(req.usuario.id).map(r => r.mesa_id);
    if (ids.length === 0) return res.json([]);
    where.push('mesa_id IN (' + ids.join(',') + ')');
  }
  if (status) {
    const list = String(status).split(',').map(s => s.trim()).filter(s => STATUS_OK.includes(s));
    if (list.length) {
      where.push('status IN (' + list.map(() => '?').join(',') + ')');
      params.push(...list);
    }
  }
  if (mesa_id) {
    where.push('mesa_id = ?');
    params.push(Number(mesa_id));
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY id DESC';
  if (limite) sql += ' LIMIT ' + Number(limite);
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(getOrderView));
});

router.get('/orders/:id', auth, (req, res) => {
  const id = Number(req.params.id);
  const o = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
  if (!o) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (req.usuario.papel !== 'adm' && o.funcionario_id !== req.usuario.id && !isAssigned(req.usuario.id, o.mesa_id)) {
    return res.status(403).json({ error: 'Pedido não disponível' });
  }
  res.json(getOrderView(o));
});

router.post('/orders', auth, (req, res) => {
  const { mesa_id, itens, observacao } = req.body || {};
  if (!mesa_id || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'Informe mesa e itens do pedido' });
  }
  const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(Number(mesa_id));
  if (!mesa) return res.status(404).json({ error: 'Mesa não encontrada' });
  if (req.usuario.papel !== 'adm' && !isAssigned(req.usuario.id, mesa.id)) {
    return res.status(403).json({ error: 'Esta mesa não está atribuída a você' });
  }
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    const r = db.prepare('INSERT INTO pedidos (mesa_id, funcionario_id, status, observacao, total, criado_em, atualizado_em) VALUES (?,?,?,?,?,?,?)')
      .run(mesa.id, req.usuario.id, 'enviado', observacao || '', 0, now, now);
    const pid = Number(r.lastInsertRowid);
    applyOrderItens(pid, itens, req.usuario.id);
    recomputeMesa(mesa.id);
    db.exec('COMMIT');
    res.json(getOrderView(checkOrgao(pid)));
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: e.message });
  }
});

router.post('/orders/:id/items', auth, (req, res) => {
  const id = Number(req.params.id);
  const { itens } = req.body || {};
  if (!Array.isArray(itens) || itens.length === 0) return res.status(400).json({ error: 'Informe itens' });
  let o;
  try { o = checkOrgao(id); } catch (e) { return res.status(404).json({ error: e.message }); }
  if (o.status === 'fechado') return res.status(400).json({ error: 'Pedido já fechado' });
  if (req.usuario.papel !== 'adm') {
    if (o.funcionario_id !== req.usuario.id) {
      return res.status(403).json({ error: 'Apenas o ADM pode alterar pedidos de outro funcionário' });
    }
    if (!isAssigned(req.usuario.id, o.mesa_id)) {
      return res.status(403).json({ error: 'Mesa não atribuída a você' });
    }
  }
  db.exec('BEGIN');
  try {
    applyOrderItens(id, itens, req.usuario.id, true);
    db.prepare('UPDATE pedidos SET atualizado_em = ? WHERE id = ?').run(new Date().toISOString(), id);
    recomputeMesa(o.mesa_id);
    db.exec('COMMIT');
    res.json(getOrderView(checkOrgao(id)));
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: e.message });
  }
});

router.put('/orders/:id', auth, admin, (req, res) => {
  const id = Number(req.params.id);
  let o;
  try { o = checkOrgao(id); } catch (e) { return res.status(404).json({ error: e.message }); }
  const { status, itens } = req.body || {};
  db.exec('BEGIN');
  try {
    if (itens !== undefined) {
      if (!Array.isArray(itens) || itens.length === 0) throw new Error('Informe os itens do pedido');
      const federadoRestaurado = o.status === 'fechado';
      revertOrderItens(id);
      applyOrderItens(id, itens, req.usuario.id);
      if (federadoRestaurado) {
        db.prepare("UPDATE pedidos SET status = 'enviado', pagamento = NULL, fechado_em = NULL, desconto = 0, total_liquido = NULL, comissao_pct = 0, comissao = 0 WHERE id = ?").run(id);
      }
    }
    if (status) {
      if (!STATUS_OK.includes(status)) throw new Error('Status inválido');
      db.prepare('UPDATE pedidos SET status = ? WHERE id = ?').run(status, id);
    }
    db.prepare('UPDATE pedidos SET atualizado_em = ? WHERE id = ?').run(new Date().toISOString(), id);
    const novo = checkOrgao(id);
    recomputeMesa(novo.mesa_id);
    db.exec('COMMIT');
    res.json(getOrderView(checkOrgao(id)));
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: e.message });
  }
});

router.post('/orders/:id/status', auth, admin, (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body || {};
  if (!STATUS_OK.includes(status)) return res.status(400).json({ error: 'Status inválido' });
  let o;
  try { o = checkOrgao(id); } catch (e) { return res.status(404).json({ error: e.message }); }
  db.prepare('UPDATE pedidos SET status = ?, atualizado_em = ? WHERE id = ?').run(status, new Date().toISOString(), id);
  recomputeMesa(o.mesa_id);
  res.json(getOrderView(checkOrgao(id)));
});

function computeVenda(total, desconto, comissaoPct) {
  const desc = r2(Math.max(0, Math.min(Number(desconto) || 0, Number(total))));
  const liquido = r2(Math.max(0, Number(total) - desc));
  const pct = Math.min(100, Math.max(0, Number(comissaoPct) || 0));
  const comissao = r2(liquido * pct / 100);
  return { desconto: desc, total_liquido: liquido, comissao_pct: pct, comissao };
}

router.post('/orders/:id/fechar', auth, admin, (req, res) => {
  const id = Number(req.params.id);
  const { pagamento, desconto, comissao_pct } = req.body || {};
  if (!PAG_OK.includes(pagamento)) return res.status(400).json({ error: 'Escolha a forma de pagamento (PIX, Dinheiro, Débito ou Crédito)' });
  let o;
  try { o = checkOrgao(id); } catch (e) { return res.status(404).json({ error: e.message }); }
  if (o.status === 'fechado') return res.status(400).json({ error: 'Pedido já fechado' });
  const v = computeVenda(o.total, desconto, comissao_pct);
  const now = new Date().toISOString();
  db.prepare('UPDATE pedidos SET status = ?, pagamento = ?, fechado_em = ?, desconto = ?, total_liquido = ?, comissao_pct = ?, comissao = ?, atualizado_em = ? WHERE id = ?')
    .run('fechado', pagamento, now, v.desconto, v.total_liquido, v.comissao_pct, v.comissao, now, id);
  recomputeMesa(o.mesa_id);
  res.json(getOrderView(checkOrgao(id)));
});

router.post('/mesas/:id/fechar', auth, admin, (req, res) => {
  const id = Number(req.params.id);
  const { pagamento, desconto, comissao_pct } = req.body || {};
  if (!PAG_OK.includes(pagamento)) return res.status(400).json({ error: 'Escolha a forma de pagamento (PIX, Dinheiro, Débito ou Crédito)' });
  const mesa = db.prepare('SELECT * FROM mesas WHERE id = ?').get(id);
  if (!mesa) return res.status(404).json({ error: 'Mesa não encontrada' });
  const abertos = db.prepare("SELECT * FROM pedidos WHERE mesa_id = ? AND status != 'fechado'").all(id);
  if (abertos.length === 0) return res.status(400).json({ error: 'Não há pedidos em aberto nesta mesa' });
  const totalMesa = abertos.reduce((s, p) => s + Number(p.total), 0);
  const descontoTotal = r2(Math.max(0, Math.min(Number(desconto) || 0, totalMesa)));
  const pct = Math.min(100, Math.max(0, Number(comissao_pct) || 0));
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    let acumulado = 0;
    for (let i = 0; i < abertos.length; i++) {
      const p = abertos[i];
      const ultimo = i === abertos.length - 1;
      const share = r2(Math.min(Number(p.total), descontoTotal * (Number(p.total) / totalMesa)));
      const desc = ultimo ? r2(Math.max(0, Math.min(descontoTotal - acumulado, Number(p.total)))) : share;
      acumulado = r2(acumulado + desc);
      const liquido = r2(Math.max(0, Number(p.total) - desc));
      const comissao = r2(liquido * pct / 100);
      db.prepare("UPDATE pedidos SET status = 'fechado', pagamento = ?, fechado_em = ?, desconto = ?, total_liquido = ?, comissao_pct = ?, comissao = ?, atualizado_em = ? WHERE id = ?")
        .run(pagamento, now, desc, liquido, pct, comissao, now, p.id);
    }
    recomputeMesa(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  const totalLiquidoMesa = r2(totalMesa - descontoTotal);
  res.json({ ok: true, fechados: abertos.length, total: totalLiquidoMesa, desconto: descontoTotal, pagamento });
});

router.delete('/orders/:id', auth, admin, (req, res) => {
  const id = Number(req.params.id);
  let o;
  try { o = checkOrgao(id); } catch (e) { return res.status(404).json({ error: e.message }); }
  db.exec('BEGIN');
  try {
    revertOrderItens(id);
    db.prepare('DELETE FROM pedidos WHERE id = ?').run(id);
    recomputeMesa(o.mesa_id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(400).json({ error: e.message });
  }
  res.json({ ok: true });
});

router.post('/orders/:id/print', auth, admin, async (req, res) => {
  const id = Number(req.params.id);
  let o;
  try { o = checkOrgao(id); } catch (e) { return res.status(404).json({ error: e.message }); }
  const cfg = getSettings();
  if (cfg.printerMode !== 'rede') {
    return res.json({ ok: true, mode: 'navegador', mensagem: 'Use a impressão pelo navegador (botão Imprimir no cupom)' });
  }
  if (!cfg.printerIp) return res.status(400).json({ error: 'Configure o IP da impressora em Configurações' });
  const order = getOrderView(o);
  try {
    await printer.printCupom(cfg, order);
    res.json({ ok: true, mode: 'rede', mensagem: 'Cupom enviado para a impressora' });
  } catch (e) {
    res.status(500).json({ error: 'Falha na impressão: ' + e.message });
  }
});

router.post('/print/teste', auth, admin, async (req, res) => {
  const cfg = getSettings();
  if (cfg.printerMode !== 'rede') {
    return res.json({ ok: true, mode: 'navegador', mensagem: 'Configure o modo de rede para teste direto' });
  }
  try {
    await printer.printTeste(cfg);
    res.json({ ok: true, mode: 'rede', mensagem: 'Teste enviado para a impressora' });
  } catch (e) {
    res.status(500).json({ error: 'Falha no teste: ' + e.message });
  }
});

// ---------------- FORNECEDORES ----------------

router.get('/suppliers', auth, admin, (req, res) => {
  res.json(db.prepare('SELECT * FROM fornecedores ORDER BY nome').all());
});

router.post('/suppliers', auth, admin, (req, res) => {
  const { nome, contato, telefone, email, cnpj, endereco, obs } = req.body || {};
  if (!nome) return res.status(400).json({ error: 'Informe o nome do fornecedor' });
  const r = db.prepare('INSERT INTO fornecedores (nome, contato, telefone, email, cnpj, endereco, obs) VALUES (?,?,?,?,?,?,?)')
    .run(nome, contato || '', telefone || '', email || '', cnpj || '', endereco || '', obs || '');
  res.json({ id: r.lastInsertRowid });
});

router.put('/suppliers/:id', auth, admin, (req, res) => {
  const id = Number(req.params.id);
  const f = db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(id);
  if (!f) return res.status(404).json({ error: 'Fornecedor não encontrado' });
  const b = req.body || {};
  db.prepare('UPDATE fornecedores SET nome=?, contato=?, telefone=?, email=?, cnpj=?, endereco=?, obs=? WHERE id=?')
    .run(b.nome !== undefined ? b.nome : f.nome,
      b.contato !== undefined ? b.contato : f.contato,
      b.telefone !== undefined ? b.telefone : f.telefone,
      b.email !== undefined ? b.email : f.email,
      b.cnpj !== undefined ? b.cnpj : f.cnpj,
      b.endereco !== undefined ? b.endereco : f.endereco,
      b.obs !== undefined ? b.obs : f.obs, id);
  res.json({ ok: true });
});

router.delete('/suppliers/:id', auth, admin, (req, res) => {
  const id = Number(req.params.id);
  const f = db.prepare('SELECT * FROM fornecedores WHERE id = ?').get(id);
  if (!f) return res.status(404).json({ error: 'Fornecedor não encontrado' });
  const n = db.prepare('SELECT COUNT(*) c FROM compras WHERE fornecedor_id = ?').get(id).c;
  if (n > 0) return res.status(400).json({ error: 'Este fornecedor possui ' + n + ' compra(s) vinculadas. Exclua as compras primeiro.' });
  db.prepare('DELETE FROM fornecedores WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ---------------- COMPRAS ----------------

router.get('/purchases', auth, admin, (req, res) => {
  const rows = db.prepare('SELECT * FROM compras ORDER BY id DESC').all();
  res.json(rows.map(c => {
    const f = c.fornecedor_id ? db.prepare('SELECT nome FROM fornecedores WHERE id = ?').get(c.fornecedor_id) : null;
    const u = db.prepare('SELECT nome FROM usuarios WHERE id = ?').get(c.usuario_id);
    const itens = db.prepare(
      'SELECT ic.*, p.nome, p.unidade, p.preco FROM itens_compra ic JOIN produtos p ON p.id = ic.produto_id WHERE ic.compra_id = ? ORDER BY ic.id'
    ).all(c.id);
    return { ...c, fornecedor: f ? f.nome : '—', usuario: u ? u.nome : '—', itens };
  }));
});

router.post('/purchases', auth, admin, (req, res) => {
  const { fornecedor_id, obs, itens } = req.body || {};
  if (!Array.isArray(itens) || itens.length === 0) return res.status(400).json({ error: 'Informe os itens da compra' });
  const now = new Date().toISOString();
  db.exec('BEGIN');
  try {
    const r = db.prepare('INSERT INTO compras (fornecedor_id, usuario_id, data, total, obs) VALUES (?,?,?,?,?)')
      .run(fornecedor_id || null, req.usuario.id, now, 0, obs || '');
    const cid = Number(r.lastInsertRowid);
    applyCompraItens(cid, itens, req.usuario.id);
    db.exec('COMMIT');
    res.json({ id: cid });
  } catch (e) {
    db.exec('ROLLBACK');
    res.status(400).json({ error: e.message });
  }
});

router.delete('/purchases/:id', auth, admin, (req, res) => {
  const id = Number(req.params.id);
  const c = db.prepare('SELECT * FROM compras WHERE id = ?').get(id);
  if (!c) return res.status(404).json({ error: 'Compra não encontrada' });
  db.exec('BEGIN');
  try {
    revertCompra(id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    return res.status(400).json({ error: e.message });
  }
  res.json({ ok: true });
});

// ---------------- ESTOQUE / MOVIMENTOS ----------------

router.get('/stock/movements', auth, admin, (req, res) => {
  const { limite, produto_id } = req.query;
  let sql = 'SELECT m.*, p.nome AS produto_nome FROM movimentos m JOIN produtos p ON p.id = m.produto_id';
  const where = [];
  const params = [];
  if (produto_id) {
    where.push('m.produto_id = ?');
    params.push(Number(produto_id));
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY m.id DESC';
  if (limite) sql += ' LIMIT ' + Number(limite);
  res.json(db.prepare(sql).all(...params));
});

router.post('/stock/movements', auth, admin, (req, res) => {
  const { produto_id, tipo, quantidade, ref } = req.body || {};
  const p = db.prepare('SELECT * FROM produtos WHERE id = ?').get(Number(produto_id));
  if (!p) return res.status(404).json({ error: 'Produto não encontrado' });
  const q = Number(quantidade);
  if (!q || q <= 0) return res.status(400).json({ error: 'Quantidade inválida' });
  let delta = 0;
  let tipoMov = '';
  if (tipo === 'entrada') { delta = q; tipoMov = 'entrada_manual'; }
  else if (tipo === 'saida') { delta = -q; tipoMov = 'saida_manual'; }
  else if (tipo === 'ajuste') {
    delta = q - Number(p.estoque);
    tipoMov = 'ajuste';
  } else return res.status(400).json({ error: 'Tipo inválido' });
  db.exec('BEGIN');
  try {
    db.prepare('UPDATE produtos SET estoque = estoque + ? WHERE id = ?').run(delta, p.id);
    db.prepare('INSERT INTO movimentos (produto_id, tipo, quantidade, ref, usuario_id, data) VALUES (?,?,?,?,?,?)')
      .run(p.id, tipoMov, r2(delta), ref || 'Lançamento manual', req.usuario.id, new Date().toISOString());
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.json({ ok: true });
});

// ---------------- FINANCEIRO ----------------

function financeiroView(l) {
  const u = l.usuario_id ? db.prepare('SELECT nome FROM usuarios WHERE id = ?').get(l.usuario_id) : null;
  return { ...l, usuario: u ? u.nome : '—' };
}

router.get('/financeiro', auth, admin, (req, res) => {
  const { mes } = req.query;
  let sql = 'SELECT * FROM financeiro';
  const params = [];
  if (mes && /^\d{4}-\d{2}$/.test(String(mes))) {
    sql += ' WHERE substr(data, 1, 7) = ?';
    params.push(String(mes));
  }
  sql += ' ORDER BY data DESC, id DESC';
  res.json(db.prepare(sql).all(...params).map(financeiroView));
});

router.post('/financeiro', auth, admin, (req, res) => {
  const { tipo, categoria, descricao, valor, data } = req.body || {};
  if (!['entrada', 'saida'].includes(tipo)) return res.status(400).json({ error: 'Escolha o tipo (Entrada ou Saída)' });
  const v = Number(valor);
  if (!v || v <= 0) return res.status(400).json({ error: 'Informe um valor maior que zero' });
  if (!categoria) return res.status(400).json({ error: 'Informe a categoria (ex.: Luz, Água, Salário)' });
  const dia = String(data || '').trim();
  const dataOk = /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : hojeStr();
  const r = db.prepare('INSERT INTO financeiro (tipo, categoria, descricao, valor, data, usuario_id, criado_em) VALUES (?,?,?,?,?,?,?)')
    .run(tipo, String(categoria).trim(), String(descricao || '').trim(), r2(v), dataOk, req.usuario.id, new Date().toISOString());
  res.json({ id: r.lastInsertRowid });
});

router.delete('/financeiro/:id', auth, admin, (req, res) => {
  const r = db.prepare('DELETE FROM financeiro WHERE id = ?').run(Number(req.params.id));
  if (r.changes === 0) return res.status(404).json({ error: 'Lançamento não encontrado' });
  res.json({ ok: true });
});

// ---------------- DASHBOARD ----------------

router.get('/dashboard', auth, admin, (req, res) => {
  const pedidos = db.prepare('SELECT * FROM pedidos ORDER BY id DESC').all().map(getOrderView);
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime();

  let faturamento = 0;
  let pedidosHoje = 0;
  const pagamentos = { pix: 0, dinheiro: 0, debito: 0, credito: 0 };
  let comissaoHoje = 0;
  for (const p of pedidos) {
    const criado = new Date(p.criado_em).getTime() || 0;
    if (criado >= inicio) pedidosHoje++;
    if (p.status === 'fechado') {
      const fech = p.fechado_em ? new Date(p.fechado_em).getTime() : criado;
      if (fech >= inicio) {
        const l = p.total_liquido;
        const liquido = (l !== null && l !== undefined && l !== '')
          ? Math.max(0, Number(l))
          : Math.max(0, Number(p.total) - (Number(p.desconto) || 0));
        faturamento += liquido;
        comissaoHoje += Number(p.comissao) || 0;
        if (pagamentos[p.pagamento] !== undefined) {
          pagamentos[p.pagamento] = r2(pagamentos[p.pagamento] + liquido);
        }
      }
    }
  }

  const mesas = db.prepare('SELECT * FROM mesas').all();
  const emCurso = pedidos.filter(p => ['enviado', 'em_preparo', 'entregue'].includes(p.status));
  const estoque_baixo = db.prepare('SELECT * FROM produtos WHERE ativo = 1 AND estoque <= estoque_min ORDER BY nome').all();
  const ultimos = pedidos.slice(0, 6);
  const financeiroHoje = db.prepare('SELECT tipo, SUM(valor) v FROM financeiro WHERE data = ? GROUP BY tipo').all(hojeStr());
  let receitasExtra = 0, despesas = 0;
  for (const f of financeiroHoje) {
    if (f.tipo === 'entrada') receitasExtra = Number(f.v) || 0;
    else despesas = Number(f.v) || 0;
  }

  const hojeChave = hojeStr();
  const dias = [];
  {
    const map = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - i);
      const chave = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const row = { dia: chave, vendas: 0, fechados: 0, gastos: 0, entradas: 0 };
      dias.push(row);
      map[chave] = row;
    }
    for (const p of pedidos) {
      if (p.status === 'fechado') {
        const k = p.fechado_em ? locDia(p.fechado_em) : locDia(p.criado_em);
        const r = map[k];
        if (r) {
          const l = (p.total_liquido !== null && p.total_liquido !== undefined && p.total_liquido !== '') ? Number(p.total_liquido) : 0;
          r.vendas = r2(r.vendas + Math.max(0, l));
          r.fechados++;
        }
      }
    }
    for (const f of db.prepare('SELECT tipo, valor, data FROM financeiro').all()) {
      const r = map[f.data];
      if (r) {
        if (f.tipo === 'entrada') r.entradas = r2(r.entradas + (Number(f.valor) || 0));
        else r.gastos = r2(r.gastos + (Number(f.valor) || 0));
      }
    }
  }

  let fechadosHoje = 0;
  let ticketSoma = 0;
  const topMap = {};
  for (const p of pedidos) {
    if (p.status === 'fechado') {
      const k = p.fechado_em ? locDia(p.fechado_em) : locDia(p.criado_em);
      if (k === hojeChave) {
        fechadosHoje++;
        const l = (p.total_liquido !== null && p.total_liquido !== undefined && p.total_liquido !== '') ? Number(p.total_liquido) : 0;
        ticketSoma += l;
        for (const it of (p.itens || [])) {
          const nome = it.nome || '?';
          topMap[nome] = topMap[nome] || { qtd: 0, total: 0 };
          topMap[nome].qtd += Number(it.quantidade) || 0;
          topMap[nome].total += Number(it.subtotal) || 0;
        }
      }
    }
  }
  const top_produtos = Object.entries(topMap)
    .map(([nome, v]) => ({ nome, qtd: r2(v.qtd), total: r2(v.total) }))
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, 6);
  const pedidos_por_status = { enviado: 0, em_preparo: 0, entregue: 0, fechado: 0 };
  for (const p of pedidos) if (pedidos_por_status[p.status] !== undefined) pedidos_por_status[p.status]++;

  const mesasPorId = {};
  for (const m of mesas) mesasPorId[m.id] = m;
  const mesasFechadas = {};
  for (const p of pedidos) {
    if (p.status === 'fechado') {
      const k = p.fechado_em ? locDia(p.fechado_em) : locDia(p.criado_em);
      if (k === hojeChave) {
        const l = (p.total_liquido !== null && p.total_liquido !== undefined && p.total_liquido !== '') ? Number(p.total_liquido) : 0;
        const mf = mesasFechadas[p.mesa_id] || (mesasFechadas[p.mesa_id] = { mesa_id: p.mesa_id, pedidos: 0, total: 0, ultimo_fechado: '' });
        mf.pedidos++;
        mf.total = r2(mf.total + Math.max(0, l));
        const fech = p.fechado_em || p.criado_em;
        if (fech > mf.ultimo_fechado) mf.ultimo_fechado = fech;
      }
    }
  }
  const mesas_fechadas_hoje = Object.values(mesasFechadas)
    .map((m) => ({ ...m, mesa_numero: mesasPorId[m.mesa_id] ? mesasPorId[m.mesa_id].numero : m.mesa_id }))
    .sort((a, b) => b.total - a.total);

  res.json({
    faturamento_hoje: r2(faturamento),
    pedidos_hoje: pedidosHoje,
    pagamentos_hoje: pagamentos,
    comissao_hoje: r2(comissaoHoje),
    mesas_ocupadas: mesas.filter(m => m.status === 'ocupada').length,
    mesas_livres: mesas.filter(m => m.status === 'livre').length,
    pedidos_em_curso: emCurso.length,
    estoque_baixo,
    ultimos_pedidos: ultimos,
    receitas_extra_hoje: r2(receitasExtra),
    despesas_hoje: r2(despesas),
    dias,
    top_produtos,
    pedidos_por_status,
    fechados_hoje: fechadosHoje,
    ticket_medio: r2(fechadosHoje ? ticketSoma / fechadosHoje : 0),
    mesas_fechadas_hoje
  });
});

router.get('/settings', auth, (req, res) => {
  res.json(getSettings());
});

router.put('/settings', auth, admin, (req, res) => {
  const cfg = { ...getSettings(), ...(req.body || {}) };
  saveSettings(cfg);
  res.json(cfg);
});

// ---------------- LEMBRETES ----------------

router.get('/lembretes', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM lembretes ORDER BY feito ASC, id DESC').all();
  res.json(rows);
});

router.post('/lembretes', auth, admin, (req, res) => {
  const { texto } = req.body || {};
  if (!texto || !String(texto).trim()) return res.status(400).json({ error: 'texto obrigatório' });
  const now = new Date().toISOString();
  const r = db.prepare('INSERT INTO lembretes (texto, criado_em) VALUES (?, ?)').run(String(texto).trim(), now);
  res.json({ id: r.lastInsertRowid, texto: String(texto).trim(), feito: 0, criado_em: now });
});

router.put('/lembretes/:id', auth, admin, (req, res) => {
  const feito = req.body && req.body.feito ? 1 : 0;
  const d = db.prepare('UPDATE lembretes SET feito = ? WHERE id = ?').run(feito, req.params.id);
  if (d.changes === 0) return res.status(404).json({ error: 'Lembrete não encontrado' });
  res.json({ ok: true });
});

router.delete('/lembretes/:id', auth, admin, (req, res) => {
  const d = db.prepare('DELETE FROM lembretes WHERE id = ?').run(req.params.id);
  if (d.changes === 0) return res.status(404).json({ error: 'Lembrete não encontrado' });
  res.json({ ok: true });
});

// ---------------- BACKUP ----------------

const TABELAS_BACKUP = ['usuarios', 'mesas', 'mesa_funcionario', 'produtos', 'pedidos', 'itens_pedido', 'fornecedores', 'compras', 'itens_compra', 'movimentos', 'financeiro', 'lembretes', 'configuracoes'];

router.get('/backup', auth, admin, (req, res) => {
  const dados = {};
  for (const t of TABELAS_BACKUP) {
    dados[t] = db.prepare('SELECT * FROM ' + t).all();
  }
  const payload = { app: 'barraca', versao: 1, criado_em: new Date().toISOString(), tabelas: dados };
  res.attachment('backup-barraca-' + hojeStr() + '.json');
  res.json(payload);
});

router.post('/backup', auth, admin, (req, res) => {
  const { tabelas } = req.body || {};
  if (!tabelas || typeof tabelas !== 'object') return res.status(400).json({ error: 'Backup inválido (objeto "tabelas" ausente)' });
  const resumo = {};
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    for (const t of TABELAS_BACKUP) {
      const list = tabelas[t];
      if (!Array.isArray(list)) continue;
      db.prepare('DELETE FROM ' + t).run();
      if (list.length === 0) { resumo[t] = 0; continue; }
      const cols = db.prepare('PRAGMA table_info(' + t + ')').all().map((c) => c.name);
      const usaveis = cols.filter((cx) => Object.prototype.hasOwnProperty.call(list[0], cx));
      if (usaveis.length === 0) continue;
      const ins = db.prepare('INSERT INTO ' + t + ' (' + usaveis.join(',') + ') VALUES (' + usaveis.map(() => '?').join(',') + ')');
      for (const linha of list) ins.run(...usaveis.map((cx) => linha[cx]));
      resumo[t] = list.length;
    }
    db.exec('COMMIT');
    db.exec('PRAGMA foreign_keys = ON');
  } catch (e) {
    db.exec('ROLLBACK');
    db.exec('PRAGMA foreign_keys = ON');
    return res.status(400).json({ error: 'Falha na restauração: ' + e.message });
  }
  res.json({ ok: true, restaurado: resumo });
});

module.exports = router;