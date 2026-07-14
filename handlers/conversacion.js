// =====================================================================
// HANDLERS CONVERSACIONALES - Pregunta abierta (RAG), ayuda, despedida,
// fallback contextual, fin de sesión y errores
// =====================================================================
const Alexa = require('ask-sdk-core');
const { PIER_WEB } = require('../lib/config');
const { productosEnCache } = require('../lib/api');
const { obtenerToken } = require('../lib/auth');
const { responderConIA } = require('../lib/ia');
const { responder } = require('../lib/respuesta');
const { aSsml } = require('../lib/ssml');
const { buildDetalleProducto } = require('../lib/apl');

function esIntent(h, nombre) {
  return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === nombre;
}

// Si hay un producto activo en la conversación, mostramos su ficha
// (Image Right Detail) con el botón táctil "Agregar al pedido"
function aplParaProductoActivo(h) {
  const attrs = h.attributesManager.getSessionAttributes();
  const pa = attrs.productoActivo;
  if (!pa || !pa.id) return null;
  const full = productosEnCache().find(x => x.id === pa.id);
  return {
    doc: buildDetalleProducto({
      id: pa.id,
      nombre: pa.nombre,
      descripcion: full?.descripcion || '',
      imagen_url: full?.imagen_url || '',
      precio_chico: pa.precio_chico,
      precio_grande: pa.precio_grande,
      rating: full?.rating,
    }),
    token: 'productoToken',
  };
}

const PreguntaPierIntentHandler = {
  canHandle(h) { return esIntent(h, 'PreguntaPierIntent'); },
  async handle(h) {
    let pregunta = Alexa.getSlotValue(h.requestEnvelope, 'pregunta');

    // Caso A: viene SIN slot (matcheó un sample literal corto: "está rico", "me gusta", "gracias", etc.)
    let instruccion;
    if (!pregunta) {
      pregunta = 'el usuario hizo un comentario o pregunta corta';
      instruccion = `El usuario dijo algo corto sin contenido específico (probablemente un comentario casual tipo "está rico", "me gusta", "gracias", "ok", "perfecto"). Responde de forma natural y conversacional usando el ESTADO CONVERSACIONAL si existe:
- Si hay producto activo: refiérete a él ("qué bueno que te guste el Cheesecake Fresa, ¿te lo aparto?")
- Si es un agradecimiento: "de nada, ¿algo más en lo que te ayude?"
- Si es comentario positivo: agradece y ofrece otra opción o pregunta si quiere algo más.
- Máximo 1 a 2 oraciones cortas, tono cálido.`;
    } else {
      // Caso B: viene con slot (pregunta abierta libre)
      instruccion = `El usuario hizo una pregunta abierta. Recuerda el ESTADO CONVERSACIONAL y el historial:
- Si dice "ese", "el chocoflán", "los tres", "agrégame uno": usa el ESTADO (producto activo / productos listados) y el historial para entender a qué se refiere.
- Si es sobre PRECIO de producto específico: busca en CATÁLOGO y da precio exacto; si no está, dilo honestamente.
- Si es RECOMENDACIÓN para evento u ocasión: sugiere 2 o 3 productos REALES del CATÁLOGO.
- Si es PREGUNTA EDUCATIVA de repostería (qué es fondant, cómo se conserva un cheesecake): explica con tu conocimiento general, NO digas "no manejamos eso".
- Si es PRODUCTO QUE NO ESTÁ en el catálogo: sé honesto, di que no lo manejan, invita a ver el catálogo web.
- Si es FUERA de repostería y Pier (autos, política, escuela): rechaza amable.
- Máximo 3 oraciones, tono natural y conversacional.`;
    }

    let respuesta;
    try { respuesta = await responderConIA(h, instruccion, pregunta); }
    catch (e) { console.error(e); respuesta = `No pude procesar tu pregunta. Visita ${PIER_WEB}.`; }
    const apl = aplParaProductoActivo(h);
    return responder(h, respuesta, apl?.doc, apl?.token);
  },
};

// Ayuda CONTEXTUAL: cambia según en qué punto de la conversación esté el usuario
const HelpIntentHandler = {
  canHandle(h) { return esIntent(h, 'AMAZON.HelpIntent'); },
  handle(h) {
    const attrs = h.attributesManager.getSessionAttributes();
    let speak;
    if (attrs.confirmandoVaciar) {
      speak = 'Te pregunté si vacío tu carrito. Dime sí para vaciarlo, o no para dejarlo como está.';
    } else if (attrs.pendingCarrito) {
      speak = `Estamos eligiendo el tamaño del ${attrs.pendingCarrito.producto_nombre}: dime chico o grande, o di no para cancelar.`;
    } else if (attrs.paginacion) {
      speak = 'Te estoy leyendo la lista por partes: di continúa para escuchar más, pide un resumen, o di basta para parar.';
    } else if (!obtenerToken(h)) {
      speak = 'Puedes preguntarme por postres, precios, promociones u horario. Y si vinculas tu cuenta con el código de tu perfil en la web, también te ayudo con tu carrito, tus pedidos y tus favoritos. ¿Qué se te antoja?';
    } else {
      speak = 'Puedes preguntarme lo que quieras: qué postres tenemos, cuánto cuesta un cheesecake, agregar algo a tu carrito, revisar tus pedidos, o pedirme consejo para tu evento. ¿En qué te ayudo?';
    }
    return responder(h, speak);
  },
};

const CancelAndStopIntentHandler = {
  canHandle(h) {
    return esIntent(h, 'AMAZON.CancelIntent') || esIntent(h, 'AMAZON.StopIntent');
  },
  handle(h) {
    // "Basta / detente" durante una lectura por partes: DETIENE la lectura
    // pero mantiene la conversación abierta (no cierra la skill)
    const attrs = h.attributesManager.getSessionAttributes();
    if (attrs.paginacion) {
      delete attrs.paginacion;
      h.attributesManager.setSessionAttributes(attrs);
      return responder(h, 'Va, ahí le paramos con la lectura. ¿Algo más en lo que te ayude?');
    }
    return h.responseBuilder
      .speak(aSsml('¡Gracias por visitar Pier Repostería! Te esperamos pronto. ¡Hasta luego!'))
      .getResponse();
  },
};

const FallbackIntentHandler = {
  canHandle(h) { return esIntent(h, 'AMAZON.FallbackIntent'); },
  async handle(h) {
    // Atrapamos lo que ningún intent matcheó. Alexa NO nos dice qué dijo el usuario,
    // pero podemos usar el estado conversacional para responder de forma natural.
    const attrs = h.attributesManager.getSessionAttributes();
    const tieneContexto = attrs.productoActivo || (attrs.productosListados && attrs.productosListados.length) || (attrs.historial && attrs.historial.length);

    const instruccion = tieneContexto
      ? `El usuario dijo algo corto que no logramos transcribir bien. Pero hay contexto previo en la conversación. Responde de forma natural usando ese contexto: si estaban hablando de un producto, sigue la conversación con una pregunta abierta tipo "¿quieres saber otra cosa del Cheesecake Fresa?" o ofrece otra opción relacionada. Sé breve, máximo 1 o 2 oraciones, conversacional. NO digas "no te entendí".`
      : `El usuario dijo algo que no logramos transcribir bien y no hay contexto previo. Da un saludo corto recordando qué puedes hacer ("te puedo decir precios, recomendarte algo, darte el horario o las promos, qué se te antoja"). Máximo 2 oraciones, tono amigable. NO digas "no te entendí" de forma seca.`;

    let respuesta;
    try { respuesta = await responderConIA(h, instruccion, 'continúa la conversación de forma natural'); }
    catch (e) { console.error(e); respuesta = '¿Me lo repites por favor? No alcancé a captarlo bien.'; }
    return responder(h, respuesta);
  },
};

const SessionEndedRequestHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(h) {
    return h.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() { return true; },
  handle(h, error) {
    console.error('ERROR:', error);
    return h.responseBuilder
      .speak(aSsml('Hubo un error procesando tu solicitud. ¿Me lo repites?'))
      .reprompt(aSsml('¿En qué te ayudo?'))
      .getResponse();
  },
};

module.exports = {
  PreguntaPierIntentHandler,
  HelpIntentHandler,
  CancelAndStopIntentHandler,
  FallbackIntentHandler,
  SessionEndedRequestHandler,
  ErrorHandler,
  aplParaProductoActivo,
};
