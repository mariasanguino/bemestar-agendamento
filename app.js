/* ============================================================
   APP.JS — Lógica principal do site de agendamento
   ============================================================
   Responsabilidades:
   - Renderizar os cards de horário em tempo real
   - Controlar os modais de formulário e confirmação
   - Validar dados do colaborador
   - Verificar duplicidade por e-mail e telefone
   - Gravar agendamento no Firestore com transação atômica
   - Enviar e-mail de confirmação via EmailJS (Colaborador e Admin)
   - Atualizar contador e barra de progresso
   ============================================================ */

'use strict';

// ── Estado global da aplicação ──────────────────────────────
let selectedSlot    = null;   // Horário selecionado pelo usuário
let formData        = null;   // Dados do formulário validados
let pendingBookingId= null;   // ID do agendamento em transação
let unsubscribeSlots= null;   // Listener em tempo real do Firestore
let allBookings     = [];     // Cache local dos agendamentos (painel)

// ── Inicialização ────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initSlots();
  initForm();
});

/* ============================================================
   SLOTS — Renderização e atualização em tempo real
   ============================================================ */

/**
 * Assina o Firestore em tempo real.
 * Sempre que um agendamento é criado/cancelado,
 * todos os cards são atualizados automaticamente.
 */
function initSlots() {
  const grid = document.getElementById('slots-grid');

  // Escuta mudanças na coleção "bookings"
  unsubscribeSlots = db.collection('bookings').onSnapshot(
    (snapshot) => {
      // Conta quantas reservas existem por horário
      const counts = {};
      snapshot.forEach(doc => {
        const t = doc.data().time;
        counts[t] = (counts[t] || 0) + 1;
      });
      renderSlots(counts, snapshot.size);
    },
    (error) => {
      console.error('Erro ao carregar horários:', error);
      grid.innerHTML = `<div class="loading-slots"><p>Erro ao carregar horários. Recarregue a página.</p></div>`;
    }
  );
}

/**
 * Renderiza todos os cards de horário no grid.
 * @param {Object} counts  - { "08:00": 1, "09:15": 2, ... }
 * @param {number} total   - Total de agendamentos
 */
function renderSlots(counts, total) {
  const grid = document.getElementById('slots-grid');
  grid.innerHTML = '';

  SCHEDULE.forEach(slot => {
    const card = buildSlotCard(slot, counts[slot.time] || 0);
    grid.appendChild(card);
  });

  updateCounter(total);
}

/**
 * Constrói o elemento HTML de um card de horário.
 * @param {Object} slot   - { time, isBreak }
 * @param {number} booked - Quantas vagas já reservadas nesse horário
 * @returns {HTMLElement}
 */
function buildSlotCard(slot, booked) {
  const card  = document.createElement('div');
  const max   = EVENT_CONFIG.maxPerSlot;
  const left  = max - booked;

  if (slot.isBreak) {
    // ── Intervalo ────────────────────────────────────────────
    card.className = 'slot-card slot-break';
    card.innerHTML = `
      <span class="slot-time">☕ ${slot.time}</span>
      <span class="slot-status"><span class="status-dot"></span>Intervalo</span>
    `;
  } else if (left <= 0) {
    // ── Esgotado ─────────────────────────────────────────────
    card.className = 'slot-card slot-full';
    card.innerHTML = `
      <span class="slot-time">${slot.time}</span>
      <span class="slot-status"><span class="status-dot"></span>🔴 Horário esgotado</span>
    `;
  } else if (left === 1) {
    // ── Última vaga ──────────────────────────────────────────
    card.className = 'slot-card slot-last';
    card.innerHTML = `
      <span class="slot-time">${slot.time}</span>
      <span class="slot-status"><span class="status-dot"></span>🟡 Última vaga</span>
      <button class="btn-slot" onclick="openModal('${slot.time}')">Agendar</button>
    `;
  } else {
    // ── Disponível ───────────────────────────────────────────
    card.className = 'slot-card slot-available';
    card.innerHTML = `
      <span class="slot-time">${slot.time}</span>
      <span class="slot-status"><span class="status-dot"></span>🟢 ${left} vagas disponíveis</span>
      <button class="btn-slot" onclick="openModal('${slot.time}')">Agendar</button>
    `;
  }

  return card;
}

/**
 * Atualiza o contador e a barra de progresso no topo da página.
 * @param {number} filled - Total de agendamentos realizados
 */
function updateCounter(filled) {
  const total = EVENT_CONFIG.totalVagas;
  const pct   = Math.min((filled / total) * 100, 100);

  document.getElementById('counter-filled').textContent = filled;
  document.getElementById('counter-total').textContent  = total;
  document.getElementById('progress-bar').style.width   = pct + '%';
}

/* ============================================================
   MODAL — Formulário de agendamento
   ============================================================ */

/**
 * Abre o modal de formulário para o horário selecionado.
 * @param {string} time - Ex: "08:00"
 */
function openModal(time) {
  selectedSlot = time;
  document.getElementById('modal-slot-badge').textContent = time;
  document.getElementById('modal-form').classList.add('open');
  document.getElementById('input-name').focus();
  clearFormErrors();
}

/** Fecha o modal de formulário e limpa os campos. */
function closeModal() {
  document.getElementById('modal-form').classList.remove('open');
  document.getElementById('booking-form').reset();
  clearFormErrors();
  selectedSlot = null;
}

/** Fecha o modal de confirmação. */
function closeConfirm() {
  document.getElementById('modal-confirm').classList.remove('open');
}

/** Limpa todas as mensagens de erro do formulário. */
function clearFormErrors() {
  ['err-name','err-email','err-phone'].forEach(id => {
    document.getElementById(id).textContent = '';
  });
  ['input-name','input-email','input-phone'].forEach(id => {
    document.getElementById(id).classList.remove('invalid');
  });
  const fe = document.getElementById('form-error');
  fe.style.display = 'none';
  fe.textContent   = '';
}

/* ============================================================
   FORMULÁRIO — Inicialização e validação
   ============================================================ */

/** Inicializa máscara de telefone e validação em tempo real. */
function initForm() {
  const phoneInput = document.getElementById('input-phone');
  const emailInput = document.getElementById('input-email');

  // Máscara automática de telefone: (11) 99999-9999
  phoneInput.addEventListener('input', (e) => {
    let v = e.target.value.replace(/\D/g, '').slice(0, 11);
    if (v.length <= 10) {
      v = v.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    } else {
      v = v.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
    }
    e.target.value = v.replace(/-$/, '');
  });

  // Validação em tempo real do e-mail
  emailInput.addEventListener('blur', () => {
    if (emailInput.value && !isValidEmail(emailInput.value)) {
      setFieldError('input-email', 'err-email', 'E-mail inválido.');
    } else {
      clearFieldError('input-email', 'err-email');
    }
  });

  // Submissão do formulário
  document.getElementById('booking-form').addEventListener('submit', handleFormSubmit);
}

/**
 * Processa o envio do formulário: valida os campos,
 * verifica duplicidade e abre a tela de confirmação.
 * @param {Event} e
 */
async function handleFormSubmit(e) {
  e.preventDefault();
  clearFormErrors();

  const name  = document.getElementById('input-name').value.trim();
  const email = document.getElementById('input-email').value.trim().toLowerCase();
  const phone = document.getElementById('input-phone').value.trim();

  // ── Validações locais ─────────────────────────────────────
  let hasError = false;

  if (!name || name.length < 3) {
    setFieldError('input-name', 'err-name', 'Informe seu nome completo.');
    hasError = true;
  }
  if (!email || !isValidEmail(email)) {
    setFieldError('input-email', 'err-email', 'Informe um e-mail válido.');
    hasError = true;
  }
  const rawPhone = phone.replace(/\D/g, '');
  if (!phone || rawPhone.length < 10) {
    setFieldError('input-phone', 'err-phone', 'Informe um telefone válido.');
    hasError = true;
  }
  if (hasError) return;

  // ── Ativa estado de carregamento ──────────────────────────
  setBtnLoading('btn-submit', 'btn-submit-text', 'btn-submit-spinner', true);

  try {
    // ── Verifica duplicidade no Firestore ─────────────────────
    const dupEmail = await db.collection('bookings')
      .where('email', '==', email).limit(1).get();
    if (!dupEmail.empty) {
      showFormError('Este e-mail já possui um agendamento.');
      return;
    }

    const dupPhone = await db.collection('bookings')
      .where('phone', '==', rawPhone).limit(1).get();
    if (!dupPhone.empty) {
      showFormError('Este telefone já possui um agendamento.');
      return;
    }

    // ── Abre confirmação ──────────────────────────────────────
    formData = { name, email, phone: rawPhone, phoneFormatted: phone, time: selectedSlot };
    document.getElementById('conf-name').textContent  = name;
    document.getElementById('conf-time').textContent  = selectedSlot;
    document.getElementById('conf-email').textContent = email;
    closeModal();
    document.getElementById('modal-confirm').classList.add('open');

  } catch (err) {
    console.error('Erro na verificação:', err);
    showFormError('Erro ao verificar dados. Tente novamente.');
  } finally {
    setBtnLoading('btn-submit', 'btn-submit-text', 'btn-submit-spinner', false);
  }
}

/* ============================================================
   AGENDAMENTO — Gravação no Firestore
   ============================================================ */

/**
 * Finaliza o agendamento com transação atômica.
 * Garante que a vaga não seja ultrapassada mesmo com
 * múltiplos usuários acessando simultaneamente.
 */
async function finalizeBooking() {
  setBtnLoading('btn-confirm', 'btn-confirm-text', 'btn-confirm-spinner', true);
  document.getElementById('confirm-error').style.display = 'none';

  const time    = formData.time;
  const max     = EVENT_CONFIG.maxPerSlot;
  const slotRef = db.collection('slots').doc(time);
  const newId = Math.random().toString(36).slice(2) + Date.now().toString(36);

  try {
    await db.runTransaction(async (tx) => {
      const slotDoc = await tx.get(slotRef);
      const current = slotDoc.exists ? (slotDoc.data().booked || 0) : 0;

      if (current >= max) throw new Error('SLOT_FULL');

      tx.set(slotRef, { booked: current + 1 }, { merge: true });

      const newRef = db.collection('bookings').doc(newId);
      tx.set(newRef, {
        name:           formData.name,
        email:          formData.email,
        phone:          formData.phone,
        phoneFormatted: formData.phoneFormatted,
        time:           time,
        date:           EVENT_CONFIG.date,
        createdAt:      firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    try { await sendConfirmationEmail(formData.name, formData.email, time); }
    catch (emailErr) { console.warn('E-mail não enviado:', emailErr); }

    closeConfirm();
    showSuccessScreen(formData.name, time, formData.email);

  } catch (err) {
    console.error('Erro ao agendar:', err);
    const msg = err.message === 'SLOT_FULL'
      ? 'Este horário acabou de ser preenchido. Escolha outro.'
      : 'Erro ao confirmar. Tente novamente.';
    document.getElementById('confirm-error').textContent = msg;
    document.getElementById('confirm-error').style.display = 'block';
  } finally {
    setBtnLoading('btn-confirm', 'btn-confirm-text', 'btn-confirm-spinner', false);
  }
}

/* ============================================================
   EMAILJS — Envio de e-mails
   ============================================================ */

/**
 * Envia e-mail de confirmação para o colaborador
 * e também dispara a notificação para o administrador.
 * @param {string} name   - Nome do colaborador
 * @param {string} email  - E-mail do colaborador
 * @param {string} time   - Horário agendado
 */
async function sendConfirmationEmail(name, email, time) {
  const templateParams = {
    to_name:    name,
    to_email:   email,
    horario:    time,
    data:       EVENT_CONFIG.dateFull,
    admin_email: ADMIN_EMAIL
  };

  // 1. Envia o e-mail de confirmação para o colaborador
  await emailjs.send(
    EMAILJS_CONFIG.serviceId,
    EMAILJS_CONFIG.templateColaborador,
    templateParams
  );

  // 2. Envia a notificação de novo agendamento para o Administrador
  if (EMAILJS_CONFIG.templateAdmin) {
    await emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.templateAdmin,
      templateParams
    );
  } else {
    // Caso não exista 'templateAdmin' definido no seu config.js, 
    // substitua 'contact_form' pelo ID real do seu template de administrador do EmailJS
    await emailjs.send(
      EMAILJS_CONFIG.serviceId,
      'contact_form', 
      templateParams
    );
  }
}

/* ============================================================
   TELA DE SUCESSO
   ============================================================ */

/**
 * Exibe a tela de sucesso com os dados do agendamento.
 * @param {string} name  - Nome do colaborador
 * @param {string} time  - Horário
 * @param {string} email - E-mail (para mostrar nota de confirmação)
 */
function showSuccessScreen(name, time, email) {
  document.getElementById('suc-name').textContent = name;
  document.getElementById('suc-time').textContent = time;
  document.getElementById('suc-email-note').textContent =
    `Uma confirmação foi enviada para ${email}`;

  // Oculta a tela principal e mostra o sucesso
  document.getElementById('screen-main').classList.remove('active');
  document.getElementById('screen-success').classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Limpa os dados do formulário
  formData     = null;
  selectedSlot = null;
}

/** Volta para a tela principal. */
function resetToMain() {
  document.getElementById('screen-success').classList.remove('active');
  document.getElementById('screen-main').classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ============================================================
   UTILITÁRIOS
   ============================================================ */

/** Valida formato de e-mail. */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Define erro em um campo do formulário. */
function setFieldError(inputId, errId, message) {
  document.getElementById(inputId).classList.add('invalid');
  document.getElementById(errId).textContent = message;
}

/** Limpa erro de um campo. */
function clearFieldError(inputId, errId) {
  document.getElementById(inputId).classList.remove('invalid');
  document.getElementById(errId).textContent = '';
}

/** Exibe mensagem de erro global no formulário. */
function showFormError(message) {
  const el = document.getElementById('form-error');
  el.textContent = message;
  el.style.display = 'block';
}

/**
 * Ativa/desativa o estado de carregamento de um botão.
 * @param {string}  btnId      - ID do botão
 * @param {string}  textId     - ID do span de texto
 * @param {string}  spinnerId  - ID do span de spinner
 * @param {boolean} loading    - true = carregando
 */
function setBtnLoading(btnId, textId, spinnerId, loading) {
  const btn     = document.getElementById(btnId);
  const txtEl   = document.getElementById(textId);
  const spinEl  = document.getElementById(spinnerId);
  btn.disabled  = loading;
  txtEl.style.display   = loading ? 'none' : 'inline';
  spinEl.style.display  = loading ? 'inline-block' : 'none';
}

// Fecha modal ao clicar no overlay
document.getElementById('modal-form').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});
document.getElementById('modal-confirm').addEventListener('click', function(e) {
  if (e.target === this) closeConfirm();
});
