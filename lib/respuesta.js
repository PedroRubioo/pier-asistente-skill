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

// Igual que responder(), pero muestra en pantalla los pasos para
// vincular la cuenta con el código de un solo uso del perfil web.
// (Sin tarjeta LinkAccount: el Account Linking OAuth está desactivado
// para la certificación — respaldo en account-linking.respaldo.json)
function responderVincular(h, texto) {
  const rb = h.responseBuilder
    .speak(aSsml(texto))
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
