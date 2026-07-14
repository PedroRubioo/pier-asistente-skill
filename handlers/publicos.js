// =====================================================================
// HANDLERS PÚBLICOS - Launch, catálogo, categorías, promos, horario,
// ubicación y destacados (no requieren cuenta)
// =====================================================================
const Alexa = require('ask-sdk-core');
const { PIER_WEB, PIER_DIRECCION, PIER_TELEFONO } = require('../lib/config');
const { precalentarBackend, obtenerContexto, obtenerCatalogoCompleto } = require('../lib/api');
const { obtenerUsuarioAuth } = require('../lib/auth');
const { estaAbiertoAhora, describirHorario } = require('../lib/horario');
const { responderConIA } = require('../lib/ia');
const { responder } = require('../lib/respuesta');
const {
  buildHeadline,
  buildCardsCategorias,
  buildImageList,
  buildInfoNegocio,
} = require('../lib/apl');

function esIntent(h, nombre) {
  return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === nombre;
}

function productoAItemLista(p) {
  return {
    primario: p.nombre,
    secundario: '$' + Number(p.precio_chico || 0).toFixed(0) + ' MXN',
    terciario: p.rating && Number(p.rating) > 0 ? Number(p.rating).toFixed(1) + ' estrellas' : (p.categoria || ''),
    imagen: p.imagen_url || '',
    id: p.id,
  };
}

const LaunchRequestHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest';
  },
  handle(h) {
    precalentarBackend();
    const usuario = obtenerUsuarioAuth(h);
    const speak = usuario && usuario.nombre
      ? `¡Hola de nuevo, ${usuario.nombre}! Qué gusto tenerte por aquí. ¿Qué se te antoja hoy?`
      : usuario && usuario.id
        ? `¡Hola de nuevo! Qué gusto saludarte. ¿En qué te ayudo hoy?`
        : '¡Hola! Soy Pier, qué gusto saludarte. Soy tu asistente de Pier Repostería. Pregúntame lo que quieras: nuestros postres, precios, promociones, horario o lo que se te antoje saber. ¿En qué te ayudo?';

    return responder(
      h,
      speak,
      buildHeadline({
        primario: usuario?.nombre ? `Hola, ${usuario.nombre}` : '¡Bienvenido a Pier Repostería!',
        secundario: 'Pasteles y postres artesanales hechos el mismo día.',
        hint: 'Prueba, "qué me recomiendas" o "qué promociones hay"',
      }),
      'welcomeToken'
    );
  },
};

const ConsultarCatalogoIntentHandler = {
  canHandle(h) { return esIntent(h, 'ConsultarCatalogoIntent'); },
  async handle(h) {
    let respuesta;
    let aplDoc = null;
    try {
      // Catálogo completo para poder ofrecer lectura por partes
      const completo = await obtenerCatalogoCompleto();
      const total = completo.length;
      const instruccion = `El usuario pregunta qué productos vende Pier. Menciona 4 o 5 productos REALES del bloque PRODUCTOS DEL CATÁLOGO con sus precios, en tono natural y conversacional.${total > 6 ? ` En el catálogo hay ${total} productos en total: cierra diciéndoselo y preguntando si quiere escuchar más.` : ' Al final pregúntale qué se le antoja.'}`;
      respuesta = await responderConIA(h, instruccion, 'qué productos tienen');
      const items = completo.slice(0, 6).map(productoAItemLista);
      aplDoc = buildImageList('Nuestro catálogo', items, total > 6 ? 'Di "sí" o "continúa" para escuchar más' : 'Toca un producto para ver su detalle');
      // Deja lista la paginación: "sí"/"continúa" sigue, "resumen" resume, "no"/"basta" detiene
      if (total > 6) {
        const attrs = h.attributesManager.getSessionAttributes();
        attrs.paginacion = { tipo: 'catalogo', titulo: 'Nuestro catálogo', offset: 6 };
        h.attributesManager.setSessionAttributes(attrs);
      }
    } catch (e) {
      console.error(e);
      respuesta = `No pude consultar el catálogo en este momento. Visita ${PIER_WEB}.`;
    }
    return responder(h, respuesta, aplDoc, 'catalogoToken');
  },
};

const ConsultarCategoriasIntentHandler = {
  canHandle(h) { return esIntent(h, 'ConsultarCategoriasIntent'); },
  async handle(h) {
    const instruccion = 'El usuario pregunta qué categorías o tipos de productos maneja Pier. Enumera EXACTAMENTE las CATEGORÍAS DISPONIBLES del bloque de datos, sin agregar otras. No menciones precios ni productos específicos, solo las categorías, en tono natural. Cierra según el DISPOSITIVO: con pantalla invítalo a tocar una categoría; sin pantalla pregúntale de cuál quiere escuchar productos.';
    let respuesta;
    let aplDoc = null;
    try {
      respuesta = await responderConIA(h, instruccion, 'qué categorías manejan');
      const ctx = await obtenerContexto();
      const categorias = (ctx.cats?.categorias || []).filter(c => c.activo !== false);
      if (categorias.length > 0) aplDoc = buildCardsCategorias(categorias);
    } catch (e) {
      console.error(e);
      respuesta = `No pude consultar las categorías. Visita ${PIER_WEB}.`;
    }
    return responder(h, respuesta, aplDoc, 'categoriasToken');
  },
};

const ConsultarPromocionesIntentHandler = {
  canHandle(h) { return esIntent(h, 'ConsultarPromocionesIntent'); },
  async handle(h) {
    const instruccion = 'El usuario pregunta por promociones, ofertas o descuentos. Lee EXACTAMENTE el bloque PROMOCIONES ACTIVAS y enuméralo de forma natural (tipo, producto, % descuento, precio rebajado, fecha fin). Si está vacío, di con honestidad que ahora no hay promociones activas e invita a estar pendiente.';
    let respuesta;
    let aplDoc = null;
    try {
      respuesta = await responderConIA(h, instruccion, 'qué promociones hay');
      const ctx = await obtenerContexto();
      const promos = ctx.promos?.promociones || [];
      if (promos.length > 0) {
        const items = promos.slice(0, 6).map(p => ({
          primario: p.producto_nombre || p.titulo_banner || 'Promoción',
          secundario: p.descuento_porcentaje ? `${parseFloat(p.descuento_porcentaje).toFixed(0)}% de descuento` : (p.tipo || 'Oferta'),
          terciario: p.precio_oferta ? '$' + parseFloat(p.precio_oferta).toFixed(0) + ' MXN' : '',
          imagen: p.producto_imagen || '',
          id: p.producto_id,
        }));
        aplDoc = buildImageList('Promociones activas', items);
      } else {
        aplDoc = buildHeadline({
          subtituloHeader: 'Promociones',
          primario: 'Sin promos activas por ahora',
          secundario: 'Pronto sacaremos algo rico, mantente pendiente.',
          hint: `Síguenos en ${PIER_WEB}`,
        });
      }
    } catch (e) {
      console.error(e);
      respuesta = `No pude consultar las promociones. Visita ${PIER_WEB}.`;
    }
    return responder(h, respuesta, aplDoc, 'promosToken');
  },
};

const ConsultarHorarioIntentHandler = {
  canHandle(h) { return esIntent(h, 'ConsultarHorarioIntent'); },
  async handle(h) {
    const instruccion = 'El usuario pregunta por el horario o si está abierto ahora. Lee el bloque HORARIO (incluye el estado actual: ABIERTO o CERRADO). Si está ABIERTO di hasta qué hora cierra hoy. Si está CERRADO di cuándo vuelve a abrir. Tono natural, breve.';
    let respuesta;
    try { respuesta = await responderConIA(h, instruccion, 'a qué hora abren'); }
    catch (e) { console.error(e); respuesta = 'Atendemos de lunes a sábado de 8 de la mañana a 9 de la noche, domingo cerrado.'; }
    const estado = estaAbiertoAhora();
    return responder(
      h,
      respuesta,
      buildHeadline({
        subtituloHeader: estado.abierto ? 'Abierto ahora' : 'Cerrado ahora',
        primario: estado.abierto ? 'Estamos abiertos' : 'Cerrados por ahora',
        secundario: 'Lunes a sábado de 8:00 a 21:00. Domingo cerrado.',
        hint: estado.abierto ? `Hoy cerramos a las ${estado.cierra}:00` : 'Te esperamos pronto',
      }),
      'horarioToken'
    );
  },
};

const ConsultarUbicacionIntentHandler = {
  canHandle(h) { return esIntent(h, 'ConsultarUbicacionIntent'); },
  async handle(h) {
    const instruccion = `El usuario pregunta por la ubicación, dirección o cómo contactar. Responde brevemente con la dirección (${PIER_DIRECCION}) y el teléfono (${PIER_TELEFONO}). Tono natural, sin mencionar horario ni productos.`;
    let respuesta;
    try { respuesta = await responderConIA(h, instruccion, 'dónde están ubicados'); }
    catch (e) { console.error(e); respuesta = `Estamos en ${PIER_DIRECCION}. Nuestro teléfono es ${PIER_TELEFONO}.`; }
    return responder(h, respuesta, buildInfoNegocio(describirHorario()), 'ubicacionToken');
  },
};

const ConsultarDestacadosIntentHandler = {
  canHandle(h) { return esIntent(h, 'ConsultarDestacadosIntent'); },
  async handle(h) {
    const instruccion = 'El usuario pide una recomendación o pregunta qué es lo más popular. Menciona 2 o 3 productos del bloque MÁS POPULARES ESTA SEMANA (o del CATÁLOGO si MÁS POPULARES está vacío), con precios. Tono natural, como recomendación personal.';
    let respuesta;
    let aplDoc = null;
    try {
      respuesta = await responderConIA(h, instruccion, 'qué me recomiendas');
      const ctx = await obtenerContexto();
      const destacados = (ctx.destacados?.productos || []).length > 0
        ? ctx.destacados.productos : (ctx.prods?.productos || []);
      const items = destacados.slice(0, 5).map(p => ({
        ...productoAItemLista(p),
        terciario: 'Popular esta semana',
      }));
      aplDoc = buildImageList('Lo más popular', items, 'Toca un producto para ver su detalle');
    } catch (e) {
      console.error(e);
      respuesta = `No pude consultar los populares. Visita ${PIER_WEB}.`;
    }
    return responder(h, respuesta, aplDoc, 'destacadosToken');
  },
};

module.exports = {
  LaunchRequestHandler,
  ConsultarCatalogoIntentHandler,
  ConsultarCategoriasIntentHandler,
  ConsultarPromocionesIntentHandler,
  ConsultarHorarioIntentHandler,
  ConsultarUbicacionIntentHandler,
  ConsultarDestacadosIntentHandler,
  productoAItemLista,
};
