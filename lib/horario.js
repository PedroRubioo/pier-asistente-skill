// =====================================================================
// HORARIO - Estado abierto/cerrado en hora de Huejutla (UTC-6)
// =====================================================================
const { HORARIO } = require('./config');

function ahoraEnMexico() {
  const utc = new Date();
  return new Date(utc.getTime() - 6 * 60 * 60 * 1000);
}

function estaAbiertoAhora() {
  const ahora = ahoraEnMexico();
  const dia = ahora.getUTCDay();
  const hora = ahora.getUTCHours() + ahora.getUTCMinutes() / 60;
  const h = HORARIO[dia];
  if (!h) return { abierto: false, motivo: 'cerrado_hoy' };
  if (hora < h.abre) return { abierto: false, motivo: 'antes', abre: h.abre, cierra: h.cierra };
  if (hora >= h.cierra) return { abierto: false, motivo: 'despues', abre: h.abre, cierra: h.cierra };
  return { abierto: true, abre: h.abre, cierra: h.cierra };
}

function describirHorario() {
  const estado = estaAbiertoAhora();
  const ahora = ahoraEnMexico();
  const hh = ahora.getUTCHours().toString().padStart(2, '0');
  const mm = ahora.getUTCMinutes().toString().padStart(2, '0');
  const estadoTxt = estado.abierto ? 'ABIERTO ahora mismo' : 'CERRADO ahora mismo';
  return `Lunes a sábado de 8:00 a 21:00, domingo cerrado. Hora actual en Huejutla: ${hh}:${mm}. Estado: ${estadoTxt}.`;
}

module.exports = { ahoraEnMexico, estaAbiertoAhora, describirHorario };
