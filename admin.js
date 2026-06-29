/* ============================================================
   ADMIN.JS — Painel administrativo
   ============================================================
   Responsabilidades:
   - Login / logout via Firebase Authentication
   - Carregar agendamentos em tempo real (Firestore)
   - Pesquisa por nome, e-mail e telefone
   - Ordenação da tabela por coluna
   - Cancelamento de agendamento com liberação de vaga
   - Exportação para Excel (.xlsx) via SheetJS
   - Atualização do dashboard em tempo real
   ============================================================ */

'use strict';

// ── Estado do painel ─────────────────────────────────────────
let allBookings   = [];          // Todos os agendamentos carregados
let filteredData  = [];          // Lista filtrada após pesquisa
let sortKey       = 'createdAt'; // Coluna de ordenação atual
let sortAsc       = false;       // Direção da ordenação
let cancelTarget  = null;        // { id, name, time } do agendamento a cancelar
let unsubAdmin    = null;        // Listener em tempo real

/* ============================================================
   AUTENTICAÇÃO
   ============================================================ */

/**
 * Verifica o estado de autenticação ao carregar a página.
 * Se já estiver logado, exibe o painel. Caso contrário, exibe o login.
 */
auth.onAuthStateChanged((user) => {
  if (user) {
    showPanel(user.email);
  } else {
    showLogin();
  }
});

/** Exibe a tela de login. */
function showLogin() {
  document.getElementById('admin-login').classList.add('active');
  document.getElementById('admin-panel').classList.remove('active');
  if (unsubAdmin) { unsubAdmin(); unsubAdmin = null; }
}

/** Exibe o painel e carrega os dados. */
function showPanel(email) {
  document.getElementById('admin-login').classList.remove('active');
  document.getElementById('admin-panel').classList.add('active');
  document.getElementById('admin-user-email').textContent = email;
  initAdminData();
}

// Formulário de login
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');

  setBtnLoadingAdmin('btn-login', 'btn-login-text', 'btn-login-spinner', true);
  errEl.style.display = 'none';

  try {
    await auth.signInWithEmailAndPassword(email, password);
    // onAuthStateChanged cuida do redirecionamento
  } catch (err) {
    console.error('Erro de login:', err);
    errEl.textContent   = traduzirErroLogin(err.code);
    errEl.style.display = 'block';
  } finally {
    setBtnLoadingAdmin('btn-login', 'btn-login-text', 'btn-login-spinner', false);
  }
});

/** Traduz códigos de erro do Firebase para português. */
function traduzirErroLogin(code) {
  const erros = {
    'auth/user-not-found':  'Usuário não encontrado.',
    'auth/wrong-password':  'Senha incorreta.',
    'auth/invalid-email':   'E-mail inválido.',
    'auth/too-many-requests':'Muitas tentativas. Aguarde alguns minutos.',
    'auth/invalid-credential': 'E-mail ou senha incorretos.'
  };
  return erros[code] || 'Erro ao fazer login. Verifique suas credenciais.';
}

/** Faz logout do administrador. */
async function adminLogout() {
  try {
    await auth.signOut();
  } catch (err) {
    console.error('Erro ao sair:', err);
  }
}

/* ============================================================
   DADOS — Tempo real via Firestore
   ============================================================ */

/** Assina agendamentos em tempo real e atualiza a tabela. */
function initAdminData() {
  unsubAdmin = db.collection('bookings')
    .orderBy('createdAt', 'desc')
    .onSnapshot(
      (snapshot) => {
        allBookings = [];
        snapshot.forEach(doc => {
          allBookings.push({ id: doc.id, ...doc.data() });
        });
        updateDashboard(allBookings.length);
        applySearch();
      },
      (err) => {
        console.error('Erro ao carregar agendamentos:', err);
        document.getElementById('bookings-tbody').innerHTML =
          '<tr><td colspan="6" class="table-empty">Erro ao carregar. Recarregue a página.</td></tr>';
      }
    );
}

/** Atualiza os cards de estatísticas e barra de progresso. */
function updateDashboard(booked) {
  const total     = EVENT_CONFIG.totalVagas;
  const remaining = Math.max(total - booked, 0);
  const pct       = Math.min((booked / total) * 100, 100);

  document.getElementById('stat-slots').textContent        = EVENT_CONFIG.totalSlots;
  document.getElementById('stat-vagas').textContent        = total;
  document.getElementById('stat-booked').textContent       = booked;
  document.getElementById('stat-remaining').textContent    = remaining;
  document.getElementById('admin-counter-filled').textContent = booked;
  document.getElementById('admin-progress-bar').style.width   = pct + '%';
}

/* ============================================================
   PESQUISA
   ============================================================ */

/** Filtra a lista de agendamentos pela busca do usuário. */
function filterBookings() {
  applySearch();
}

/** Limpa o campo de busca e reexibe todos os registros. */
function clearSearch() {
  document.getElementById('search-input').value = '';
  applySearch();
}

/** Aplica o filtro de pesquisa e renderiza a tabela. */
function applySearch() {
  const q = document.getElementById('search-input').value.trim().toLowerCase();

  if (!q) {
    filteredData = [...allBookings];
  } else {
    filteredData = allBookings.filter(b =>
      (b.name  || '').toLowerCase().includes(q) ||
      (b.email || '').toLowerCase().includes(q) ||
      (b.phone || '').includes(q.replace(/\D/g, '')) ||
      (b.phoneFormatted || '').includes(q)
    );
  }

  sortData();
  renderTable();
}

// Pesquisa em tempo real enquanto digita
document.getElementById('search-input').addEventListener('input', applySearch);

/* ============================================================
   ORDENAÇÃO
   ============================================================ */

/**
 * Alterna a ordenação da tabela pela coluna clicada.
 * @param {string} key - Chave do campo a ordenar
 */
function sortTable(key) {
  if (sortKey === key) {
    sortAsc = !sortAsc;
  } else {
    sortKey = key;
    sortAsc = true;
  }
  sortData();
  renderTable();
}

/** Ordena filteredData com base em sortKey e sortAsc. */
function sortData() {
  filteredData.sort((a, b) => {
    let va = a[sortKey] ?? '';
    let vb = b[sortKey] ?? '';

    // Para timestamps do Firestore
    if (va && va.toDate) va = va.toDate().getTime();
    if (vb && vb.toDate) vb = vb.toDate().getTime();

    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ?  1 : -1;
    return 0;
  });
}

/* ============================================================
   TABELA — Renderização
   ============================================================ */

/** Renderiza os dados filtrados na tabela HTML. */
function renderTable() {
  const tbody = document.getElementById('bookings-tbody');
  const count = document.getElementById('table-count');

  count.textContent = `${filteredData.length} registro${filteredData.length !== 1 ? 's' : ''}`;

  if (filteredData.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Nenhum agendamento encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = filteredData.map(b => {
    // Formata a data de cadastro
    let createdStr = '—';
    if (b.createdAt && b.createdAt.toDate) {
      const d = b.createdAt.toDate();
      createdStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }

    // Formata o telefone para exibição
    const phoneDisplay = b.phoneFormatted || formatPhone(b.phone || '');

    return `
      <tr>
        <td><strong>${escapeHtml(b.name || '—')}</strong></td>
        <td>${escapeHtml(b.email || '—')}</td>
        <td>${escapeHtml(phoneDisplay)}</td>
        <td><strong>${escapeHtml(b.time || '—')}</strong></td>
        <td style="font-size:.82rem; color:var(--gray-dark)">${createdStr}</td>
        <td>
          <button class="btn-cancel-row" onclick="openCancelModal('${b.id}','${escapeHtml(b.name)}','${b.time}')">
            Cancelar
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

/* ============================================================
   CANCELAMENTO
   ============================================================ */

/**
 * Abre o modal de confirmação de cancelamento.
 * @param {string} id    - ID do documento no Firestore
 * @param {string} name  - Nome do colaborador
 * @param {string} time  - Horário do agendamento
 */
function openCancelModal(id, name, time) {
  cancelTarget = { id, name, time };
  document.getElementById('cancel-name').textContent = name;
  document.getElementById('cancel-time').textContent = time;
  document.getElementById('cancel-error').style.display = 'none';
  document.getElementById('modal-cancel').classList.add('open');
}

/** Fecha o modal de cancelamento. */
function closeCancelModal() {
  document.getElementById('modal-cancel').classList.remove('open');
  cancelTarget = null;
}

/**
 * Cancela o agendamento e libera a vaga via transação atômica.
 */
async function confirmCancelBooking() {
  if (!cancelTarget) return;

  setBtnLoadingAdmin('btn-confirm-cancel', 'btn-cancel-text', 'btn-cancel-spinner', true);
  document.getElementById('cancel-error').style.display = 'none';

  const { id, time } = cancelTarget;
  const slotRef      = db.collection('slots').doc(time);
  const bookingRef   = db.collection('bookings').doc(id);

  try {
    await db.runTransaction(async (tx) => {
      const slotDoc = await tx.get(slotRef);
      const current = slotDoc.exists ? (slotDoc.data().booked || 0) : 0;

      // Decrementa o contador da vaga (mínimo 0)
      tx.set(slotRef, { booked: Math.max(current - 1, 0) }, { merge: true });

      // Remove o agendamento
      tx.delete(bookingRef);
    });

    closeCancelModal();
    // O listener em tempo real atualizará a tabela automaticamente

  } catch (err) {
    console.error('Erro ao cancelar:', err);
    const errEl = document.getElementById('cancel-error');
    errEl.textContent   = 'Erro ao cancelar. Tente novamente.';
    errEl.style.display = 'block';
  } finally {
    setBtnLoadingAdmin('btn-confirm-cancel', 'btn-cancel-text', 'btn-cancel-spinner', false);
  }
}

// Fecha modal ao clicar no overlay
document.getElementById('modal-cancel').addEventListener('click', function(e) {
  if (e.target === this) closeCancelModal();
});

/* ============================================================
   EXPORTAÇÃO PARA EXCEL
   ============================================================ */

/**
 * Exporta os agendamentos exibidos na tabela para .xlsx
 * usando a biblioteca SheetJS (XLSX).
 */
function exportToExcel() {
  if (filteredData.length === 0) {
    alert('Nenhum dado para exportar.');
    return;
  }

  // Formata os dados para o Excel
  const rows = filteredData.map(b => {
    let createdStr = '';
    if (b.createdAt && b.createdAt.toDate) {
      const d = b.createdAt.toDate();
      createdStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    }
    return {
      'Nome':        b.name   || '',
      'E-mail':      b.email  || '',
      'Telefone':    b.phoneFormatted || formatPhone(b.phone || ''),
      'Horário':     b.time   || '',
      'Data Evento': b.date   || EVENT_CONFIG.date,
      'Cadastro':    createdStr
    };
  });

  // Cria a planilha
  const ws = XLSX.utils.json_to_sheet(rows);

  // Ajusta a largura das colunas
  ws['!cols'] = [
    { wch: 30 }, // Nome
    { wch: 35 }, // E-mail
    { wch: 18 }, // Telefone
    { wch: 10 }, // Horário
    { wch: 15 }, // Data Evento
    { wch: 18 }  // Cadastro
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Agendamentos');

  // Gera e faz download do arquivo
  const filename = `agendamentos_massagem_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, filename);
}

/* ============================================================
   UTILITÁRIOS
   ============================================================ */

/** Formata número de telefone puro para exibição. */
function formatPhone(raw) {
  const d = raw.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return raw;
}

/** Escapa caracteres HTML para prevenir XSS na tabela. */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/** Ativa/desativa estado de carregamento em botão do admin. */
function setBtnLoadingAdmin(btnId, textId, spinnerId, loading) {
  const btn    = document.getElementById(btnId);
  const txtEl  = document.getElementById(textId);
  const spinEl = document.getElementById(spinnerId);
  if (!btn) return;
  btn.disabled           = loading;
  txtEl.style.display    = loading ? 'none' : 'inline';
  spinEl.style.display   = loading ? 'inline-block' : 'none';
}
