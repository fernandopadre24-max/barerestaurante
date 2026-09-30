const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'barraca.db');
let db;
try {
  db = new DatabaseSync(dbPath, { enableForeignKeyConstraints: true });
} catch {
  db = new DatabaseSync(dbPath);
}

db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  pin TEXT NOT NULL,
  papel TEXT NOT NULL DEFAULT 'func',
  ativo INTEGER NOT NULL DEFAULT 1,
  cpf TEXT NOT NULL DEFAULT '',
  telefone TEXT NOT NULL DEFAULT '',
  cargo TEXT NOT NULL DEFAULT '',
  admissao TEXT NOT NULL DEFAULT '',
  salario REAL NOT NULL DEFAULT 0,
  endereco TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mesas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numero INTEGER UNIQUE NOT NULL,
  capacidade INTEGER NOT NULL DEFAULT 4,
  local TEXT NOT NULL DEFAULT 'Interno',
  status TEXT NOT NULL DEFAULT 'livre'
);

CREATE TABLE IF NOT EXISTS mesa_funcionario (
  mesa_id INTEGER NOT NULL REFERENCES mesas(id) ON DELETE CASCADE,
  funcionario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  PRIMARY KEY (mesa_id, funcionario_id)
);

CREATE TABLE IF NOT EXISTS produtos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT '',
  preco REAL NOT NULL DEFAULT 0,
  preco_custo REAL NOT NULL DEFAULT 0,
  estoque REAL NOT NULL DEFAULT 0,
  estoque_min REAL NOT NULL DEFAULT 0,
  unidade TEXT NOT NULL DEFAULT 'un',
  ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mesa_id INTEGER NOT NULL REFERENCES mesas(id),
  funcionario_id INTEGER NOT NULL REFERENCES usuarios(id),
  status TEXT NOT NULL DEFAULT 'enviado',
  observacao TEXT NOT NULL DEFAULT '',
  total REAL NOT NULL DEFAULT 0,
  desconto REAL NOT NULL DEFAULT 0,
  total_liquido REAL NOT NULL DEFAULT 0,
  comissao_pct REAL NOT NULL DEFAULT 0,
  comissao REAL NOT NULL DEFAULT 0,
  pagamento TEXT NOT NULL DEFAULT '',
  fechado_em TEXT NOT NULL DEFAULT '',
  criado_em TEXT NOT NULL,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS itens_pedido (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  quantidade REAL NOT NULL,
  preco REAL NOT NULL,
  subtotal REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS fornecedores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nome TEXT NOT NULL,
  contato TEXT NOT NULL DEFAULT '',
  telefone TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  cnpj TEXT NOT NULL DEFAULT '',
  endereco TEXT NOT NULL DEFAULT '',
  obs TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS compras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fornecedor_id INTEGER REFERENCES fornecedores(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  data TEXT NOT NULL,
  total REAL NOT NULL DEFAULT 0,
  obs TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS itens_compra (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id INTEGER NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  quantidade REAL NOT NULL,
  preco_custo REAL NOT NULL,
  subtotal REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS movimentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produto_id INTEGER NOT NULL REFERENCES produtos(id),
  tipo TEXT NOT NULL,
  quantidade REAL NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  usuario_id INTEGER REFERENCES usuarios(id),
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT
);

CREATE TABLE IF NOT EXISTS financeiro (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  categoria TEXT NOT NULL DEFAULT '',
  descricao TEXT NOT NULL DEFAULT '',
  valor REAL NOT NULL DEFAULT 0,
  data TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id),
  criado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS lembretes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  texto TEXT NOT NULL,
  feito INTEGER NOT NULL DEFAULT 0,
  criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_pedidos_status ON pedidos(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_mesa ON pedidos(mesa_id);
CREATE INDEX IF NOT EXISTS idx_movimentos_produto ON movimentos(produto_id);
CREATE INDEX IF NOT EXISTS idx_financeiro_data ON financeiro(data);
CREATE INDEX IF NOT EXISTS idx_lembretes_feito ON lembretes(feito);
`);

function migrarUsuarios() {
  const cols = db.prepare('PRAGMA table_info(usuarios)').all().map((c) => c.name);
  const novos = [
    ['cpf', "TEXT NOT NULL DEFAULT ''"],
    ['telefone', "TEXT NOT NULL DEFAULT ''"],
    ['cargo', "TEXT NOT NULL DEFAULT ''"],
    ['admissao', "TEXT NOT NULL DEFAULT ''"],
    ['salario', 'REAL NOT NULL DEFAULT 0'],
    ['endereco', "TEXT NOT NULL DEFAULT ''"]
  ];
  for (const [nome, tipo] of novos) {
    if (!cols.includes(nome)) {
      db.exec('ALTER TABLE usuarios ADD COLUMN ' + nome + ' ' + tipo);
    }
  }
}

migrarUsuarios();

function migrarPedidos() {
  const cols = db.prepare('PRAGMA table_info(pedidos)').all().map((c) => c.name);
  const novos = [
    ['pagamento', "TEXT NOT NULL DEFAULT ''"],
    ['fechado_em', "TEXT NOT NULL DEFAULT ''"],
    ['desconto', 'REAL NOT NULL DEFAULT 0'],
    ['total_liquido', 'REAL NOT NULL DEFAULT 0'],
    ['comissao_pct', 'REAL NOT NULL DEFAULT 0'],
    ['comissao', 'REAL NOT NULL DEFAULT 0']
  ];
  for (const [nome, tipo] of novos) {
    if (!cols.includes(nome)) {
      db.exec('ALTER TABLE pedidos ADD COLUMN ' + nome + ' ' + tipo);
    }
  }
  db.prepare('UPDATE pedidos SET total_liquido = total WHERE total_liquido = 0 AND total > 0').run();
}

migrarPedidos();

function migrarCompras() {
  const cols = db.prepare('PRAGMA table_info(itens_compra)').all().map((c) => c.name);
  const novos = [
    ['embalagens', 'REAL NOT NULL DEFAULT 1'],
    ['contem', 'REAL NOT NULL DEFAULT 1']
  ];
  for (const [nome, tipo] of novos) {
    if (!cols.includes(nome)) {
      db.exec('ALTER TABLE itens_compra ADD COLUMN ' + nome + ' ' + tipo);
    }
  }
  db.prepare('UPDATE itens_compra SET embalagens = quantidade WHERE embalagens = 1 AND contem = 1 AND quantidade != 1').run();
}

migrarCompras();

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = crypto.scryptSync(String(pin), salt, 64).toString('hex');
  return `${salt}:${h}`;
}

function verifyPin(pin, stored) {
  if (!stored) return false;
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, h] = parts;
  const hh = crypto.scryptSync(String(pin), salt, 64).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(h, 'hex'), Buffer.from(hh, 'hex'));
  } catch {
    return false;
  }
}

function seed() {
  const total = db.prepare('SELECT COUNT(*) c FROM usuarios').get().c;
  if (total > 0) return;

  const now = new Date().toISOString();
  const insUser = db.prepare('INSERT INTO usuarios (codigo,nome,pin,papel,ativo,criado_em) VALUES (?,?,?,?,?,?)');

  db.exec('BEGIN');
  try {
    insUser.run('1', 'Administrador', hashPin('1234'), 'adm', 1, now);
    insUser.run('2', 'Garçom Demo', hashPin('1234'), 'func', 1, now);

    const insMesa = db.prepare('INSERT INTO mesas (numero,capacidade,local,status) VALUES (?,?,?,?)');
    for (let i = 1; i <= 8; i++) {
      insMesa.run(i, (i % 3) + 2, i % 2 ? 'Interno' : 'Externo', 'livre');
    }

    const produtos = [
      ['Cerveja Long Neck', 'Bebidas', 9.90, 4.5, 48, 24, 'un'],
      ['Cerveja Lata', 'Bebidas', 6.50, 3.2, 72, 36, 'un'],
      ['Refrigerante Lata', 'Bebidas', 5.00, 2.5, 60, 24, 'un'],
      ['Água 500ml', 'Bebidas', 3.50, 1.2, 48, 12, 'un'],
      ['Coca-Cola 600ml', 'Bebidas', 8.00, 3.5, 36, 12, 'un'],
      ['Suco de Laranja', 'Bebidas', 7.00, 2.0, 24, 8, 'un'],
      ['Porção de Batata Frita', 'Porções', 24.90, 9.0, 15, 5, 'porção'],
      ['Porção de Frango à Passarinho', 'Porções', 39.90, 16.0, 10, 4, 'porção'],
      ['Petisco de Calabresa', 'Porções', 22.90, 11.0, 12, 4, 'porção'],
      ['Espetinho de Carne', 'Porções', 15.00, 6.0, 30, 10, 'un'],
      ['Picanha na Chapa (kg)', 'Porções', 129.90, 60.0, 6, 2, 'kg'],
      ['Bolo no Pote', 'Sobremesas', 12.00, 4.0, 12, 4, 'un']
    ];
    const insProd = db.prepare('INSERT INTO produtos (nome,categoria,preco,preco_custo,estoque,estoque_min,unidade,ativo) VALUES (?,?,?,?,?,?,?,1)');
    for (const p of produtos) insProd.run(...p);

    const assign = db.prepare('INSERT OR IGNORE INTO mesa_funcionario (mesa_id,funcionario_id) VALUES (?,?)');
    for (let i = 1; i <= 8; i++) assign.run(i, 2);

    db.prepare('INSERT INTO configuracoes (chave,valor) VALUES (?,?)').run('app', JSON.stringify({
      estabelecimento: 'Bar do Zé',
      endereco: 'Rua das Flores, 123',
      telefone: '(11) 99999-0000',
      cnpj: '',
      printerMode: 'navegador',
      printerIp: '',
      printerPort: 9100,
      rodapeCupom: 'Obrigado pela preferência!'
    }));

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

seed();

module.exports = { db, hashPin, verifyPin };