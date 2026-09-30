import { useState } from 'react';
import { api } from './api';
import { usePolling, Badge, Btn, Empty, Field, Modal, Spinner, Toast } from './ui';

export default function Usuarios() {
  const [users, err] = usePolling(() => api.get('/api/users'), 20000);
  const [edit, setEdit] = useState(null);
  const [msg, setMsg] = useState('');

  async function salvar(form) {
    if (form.id) await api.put('/api/users/' + form.id, form);
    else await api.post('/api/users', form);
    setMsg('Usuário salvo!');
    setEdit(null);
  }

  async function excluir(u) {
    if (!window.confirm('Excluir o usuário "' + u.nome + '"?')) return;
    try {
      await api.del('/api/users/' + u.id);
      setMsg('Usuário excluído');
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div>
      <div className="section-head">
        <div>
          <h2>Usuários / Funcionários</h2>
          <p className="subtle">Funcionários atendem as mesas atribuídas. Só o ADM edita ou exclui pedidos.</p>
        </div>
        <Btn variant="primary" onClick={() => setEdit({ codigo: '', nome: '', pin: '', papel: 'func', ativo: 1, cpf: '', telefone: '', cargo: '', admissao: '', salario: 0, endereco: '' })}>+ Novo funcionário</Btn>
      </div>

      {err && <div className="form-error">{err}</div>}
      {!users && <Spinner />}

      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Código</th><th>Nome</th><th>Cargo</th><th>Telefone</th><th>Função</th><th>Situação</th><th></th></tr>
          </thead>
          <tbody>
            {(users || []).map((u) => (
              <tr key={u.id}>
                <td><b>{u.codigo}</b></td>
                <td>{u.nome}</td>
                <td>{u.cargo || <span className="subtle">—</span>}</td>
                <td>{u.telefone || <span className="subtle">—</span>}</td>
                <td>{u.papel === 'adm' ? <Badge color="#c0392b">ADM</Badge> : 'Funcionário'}</td>
                <td>{u.ativo ? '✅ Ativo' : '🚫 Inativo'}</td>
                <td>
                  <div className="row-gap">
                    <Btn onClick={() => setEdit(u)}>✏️</Btn>
                    <Btn variant="danger" onClick={() => excluir(u)}>🗑</Btn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {users && users.length === 0 && <Empty text="Nenhum usuário." />}

      {edit && <FormUsuario inicial={edit} onClose={() => setEdit(null)} onSalvar={salvar} meId={edit.id} />}
      <Toast msg={msg} />
    </div>
  );
}

function FormUsuario({ inicial, onClose, onSalvar }) {
  const [form, setForm] = useState(inicial);
  const [erro, setErro] = useState('');
  const [busy, setBusy] = useState(false);
  const novo = !form.id;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function ok() {
    setBusy(true); setErro('');
    try { await onSalvar(form); } catch (e) { setErro(e.message); setBusy(false); }
  }

  return (
    <Modal title={novo ? 'Novo usuário' : 'Editar usuário'} onClose={onClose}>
      <div className="campo-linha">
        <Field label="Código">
          <input className="input" value={form.codigo} onChange={set('codigo')} placeholder="Ex: 3" />
        </Field>
        <Field label="Nome">
          <input className="input" value={form.nome} onChange={set('nome')} />
        </Field>
      </div>
      <Field label={novo ? 'PIN (senha do celular)' : 'Novo PIN (deixe vazio para manter)'}>
        <input className="input" inputMode="numeric" value={form.pin} onChange={set('pin')} />
      </Field>
      <div className="campo-linha">
        <Field label="Função">
          <select className="input" value={form.papel} onChange={set('papel')}>
            <option value="func">Funcionário</option>
            <option value="adm">ADM (controle total)</option>
          </select>
        </Field>
        <Field label="Ativo">
          <select className="input" value={form.ativo} onChange={set('ativo')}>
            <option value={1}>Sim</option>
            <option value={0}>Não</option>
          </select>
        </Field>
      </div>
      <div className="campo-linha">
        <Field label="Cargo">
          <input className="input" value={form.cargo} onChange={set('cargo')} list="cargos-sug" placeholder="Ex: Garçom" />
          <datalist id="cargos-sug">
            <option value="Garçom" /><option value="Garçonete" /><option value="Cozinheiro" />
            <option value="Pizzaiolo" /><option value="Caixa" /><option value="Gerente" />
          </datalist>
        </Field>
        <Field label="Data de admissão">
          <input className="input" type="date" value={form.admissao} onChange={set('admissao')} />
        </Field>
      </div>
      <div className="campo-linha">
        <Field label="Salário (R$)">
          <input className="input" type="number" step="0.01" min="0" value={form.salario} onChange={set('salario')} />
        </Field>
        <Field label="Telefone">
          <input className="input" value={form.telefone} onChange={set('telefone')} placeholder="(11) 99999-9999" />
        </Field>
      </div>
      <div className="campo-linha">
        <Field label="CPF">
          <input className="input" value={form.cpf} onChange={set('cpf')} placeholder="000.000.000-00" />
        </Field>
      </div>
      <Field label="Endereço">
        <input className="input" value={form.endereco} onChange={set('endereco')} placeholder="Rua, nº, bairro, cidade" />
      </Field>
      {erro && <div className="form-error">{erro}</div>}
      <div className="row-gap"><Btn variant="primary" onClick={ok} disabled={busy || !form.codigo || !form.nome}>Salvar</Btn></div>
    </Modal>
  );
}