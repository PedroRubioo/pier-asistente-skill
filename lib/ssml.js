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

// Rotamos el reprompt para no sonar robóticos repitiendo siempre la misma frase
const REPROMPTS = [
  '¿Algo más en lo que te ayude?',
  '¿Qué más se te antoja saber?',
  '¿Te ayudo con otra cosa?',
  '¿Quieres que te recomiende algo?',
  '¿Alguna otra duda?',
];

function siguienteReprompt(h) {
  const attrs = h.attributesManager.getSessionAttributes();
  attrs.repromptIdx = ((attrs.repromptIdx || 0) + 1) % REPROMPTS.length;
  h.attributesManager.setSessionAttributes(attrs);
  return REPROMPTS[attrs.repromptIdx];
}

module.exports = { aSsml, siguienteReprompt };
