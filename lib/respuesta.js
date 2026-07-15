// =====================================================================
// RESPUESTA - Helper único para hablar + reprompt variado + APL.
// COBERTURA TOTAL: si el handler no manda una plantilla propia, se
// muestra la pantalla de texto de respaldo (foto de la sucursal de
// fondo) — así TODA respuesta tiene experiencia multimodal.
// =====================================================================
const { aSsml, siguienteReprompt } = require('./ssml');
const { inyectarAPL, buildPantallaTexto, buildHeadline } = require('./apl');

function responder(h, texto, aplDoc, token) {
  const rb = h.responseBuilder
    .speak(aSsml(texto))
    .reprompt(aSsml(siguienteReprompt(h)));
  inyectarAPL(rb, h, aplDoc || buildPantallaTexto(texto), token || 'pierTextoToken');
  return rb.getResponse();
}

// Igual que responder(), pero manda la tarjeta LinkAccount a la app de
// Alexa y muestra en pantalla los pasos para vincular la cuenta
function responderVincular(h, texto) {
  const rb = h.responseBuilder
    .speak(aSsml(texto))
    .withLinkAccountCard()
    .reprompt(aSsml(siguienteReprompt(h)));
  inyectarAPL(rb, h, buildHeadline({
    subtituloHeader: 'Vincula tu cuenta',
    primario: 'Vincula tu cuenta',
    secundario: '1. Entra a tu perfil en la web  ·  2. Genera tu código  ·  3. Dime: "vincula mi cuenta con el código..."',
    hint: 'pier-reposteria.vercel.app',
  }), 'vincularToken');
  return rb.getResponse();
}

module.exports = { responder, responderVincular };
