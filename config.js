/* ============================================================
   CONFIG.JS — Configurações do Firebase e EmailJS
   ============================================================
   ⚠️  IMPORTANTE: Substitua os valores abaixo com as suas
   credenciais reais antes de publicar o site.
   Veja o TUTORIAL.md para instruções passo a passo.
   ============================================================ */

// ── Firebase Configuration ──────────────────────────────────
// Obtenha esses valores em: Firebase Console → Configurações do Projeto → Seus apps
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBHqFRb6MmgZcePQ9jqrDYlN172-Livgl0",
  authDomain: "bemestar-agendamento.firebaseapp.com",
  projectId: "bemestar-agendamento",
  storageBucket: "bemestar-agendamento.firebasestorage.app",
  messagingSenderId: "575766606514",
  appId: "1:575766606514:web:1e21b6384c2b6b9881cfab"
};

// ── EmailJS Configuration ────────────────────────────────────
// Obtenha em: https://www.emailjs.com → Account → API Keys
const EMAILJS_CONFIG = {
  publicKey:           "ZRD1wbxity-5coBBT",       // Account → API Keys → Public Key
  serviceId:           "service_4vxr43f",        // ID do serviço criado
  templateColaborador: "template_zlw55kk",       // Template do colaborador
  templateAdmin:       "template_qvyjx3b"      // Template do admin
};

// ── E-mail do administrador ─────────────────────────────────
// Receberá cópia de todos os agendamentos
const ADMIN_EMAIL = "maria.sanguino09@gmail.com";

// ── Configuração do Evento ───────────────────────────────────
// Altere apenas se necessário
const EVENT_CONFIG = {
  date:       "30/06/2026",
  dateFull:   "30 de junho de 2026",
  maxPerSlot: 2,         // Vagas por horário
  totalSlots: 26,        // Total de horários disponíveis (sem contar intervalos)
  totalVagas: 52         // maxPerSlot × totalSlots
};

// ── Horários ─────────────────────────────────────────────────
// Cada item é { time: "HH:MM", isBreak: bool }
// isBreak: true = bloqueia agendamento, exibe "☕ Intervalo"
const SCHEDULE = [
  { time: "08:00", isBreak: false },
  { time: "08:15", isBreak: false },
  { time: "08:30", isBreak: false },
  { time: "08:45", isBreak: false },
  { time: "09:00", isBreak: false },
  { time: "09:15", isBreak: false },
  { time: "09:30", isBreak: false },
  { time: "09:45", isBreak: false },
  { time: "10:00", isBreak: false },
  { time: "10:15", isBreak: true  }, // ☕ Intervalo
  { time: "10:30", isBreak: false },
  { time: "10:45", isBreak: false },
  { time: "11:00", isBreak: false },
  { time: "11:15", isBreak: false },
  { time: "11:30", isBreak: false },
  { time: "11:45", isBreak: false },
  { time: "12:00", isBreak: true  }, // ☕ Intervalo
  { time: "12:15", isBreak: true  }, // ☕ Intervalo
  { time: "12:30", isBreak: true  }, // ☕ Intervalo
  { time: "12:45", isBreak: true  }, // ☕ Intervalo
  { time: "13:00", isBreak: false },
  { time: "13:15", isBreak: false },
  { time: "13:30", isBreak: false },
  { time: "13:45", isBreak: false },
  { time: "14:00", isBreak: false },
  { time: "14:15", isBreak: false },
  { time: "14:30", isBreak: false },
  { time: "14:45", isBreak: true  }, // ☕ Intervalo
  { time: "15:00", isBreak: false },
  { time: "15:15", isBreak: false },
  { time: "15:30", isBreak: false },
  { time: "15:45", isBreak: false }
];

/* ── Inicializa Firebase ─────────────────────────────────────
   Não altere este bloco.                                       */
firebase.initializeApp(FIREBASE_CONFIG);
const db   = firebase.firestore();
const auth = firebase.auth();

/* ── Inicializa EmailJS ─────────────────────────────────────── */
emailjs.init(EMAILJS_CONFIG.publicKey);
