// =====================================================================
// RESPUESTA - Helper único para hablar + reprompt variado + APL opcional
// =====================================================================
const { aSsml, siguienteReprompt } = require('./ssml');
const { inyectarAPL } = require('./apl');

function responder(h, texto, aplDoc, token) {
  const rb = h.responseBuilder
    .speak(aSsml(texto))
    .reprompt(aSsml(siguienteReprompt(h)));
  if (aplDoc) inyectarAPL(rb, h, aplDoc, token);
  return rb.getResponse();
}

// Igual que responder(), pero manda la tarjeta LinkAccount a la app de Alexa
// (aparece en inicio/actividad con el botón oficial de "Vincular cuenta")
function responderVincular(h, texto) {
  return h.responseBuilder
    .speak(aSsml(texto))
    .withLinkAccountCard()
    .reprompt(aSsml(siguienteReprompt(h)))
    .getResponse();
}

module.exports = { responder, responderVincular };
