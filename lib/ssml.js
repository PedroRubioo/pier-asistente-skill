// =====================================================================
// SSML - Voz Mía (es-MX) con pausas naturales + reprompts variados
// =====================================================================
function aSsml(texto) {
  const safe = String(texto || '')
    .replace(/&/g, ' y ')
    .replace(/</g, ' menor que ')
    .replace(/>/g, ' mayor que ')
    .replace(/"/g, '')
    .trim();
  const conPausas = safe
    .replace(/\. /g, '. <break time="280ms"/>')
    .replace(/, /g, ', <break time="140ms"/>');
  return `<speak><voice name="Mia">${conPausas}</voice></speak>`;
}

const { esPersonal } = require('./auth');

// Rotamos el reprompt para no sonar robóticos repitiendo siempre la misma
// frase. El personal tiene su propio pool: operativo, sin tono de venta.
const REPROMPTS = [
  '¿Algo más en lo que te ayude?',
  '¿Qué más se te antoja saber?',
  '¿Te ayudo con otra cosa?',
  '¿Quieres que te recomiende algo?',
  '¿Alguna otra duda?',
];

const REPROMPTS_PERSONAL = [
  '¿Algo más que revisemos?',
  '¿Otra consulta del negocio?',
  '¿Te ayudo con algo más?',
  '¿Revisamos otra cosa?',
  '¿Alguna otra consulta?',
];

function siguienteReprompt(h) {
  const pool = esPersonal(h) ? REPROMPTS_PERSONAL : REPROMPTS;
  const attrs = h.attributesManager.getSessionAttributes();
  attrs.repromptIdx = ((attrs.repromptIdx || 0) + 1) % pool.length;
  h.attributesManager.setSessionAttributes(attrs);
  return pool[attrs.repromptIdx];
}

module.exports = { aSsml, siguienteReprompt };
