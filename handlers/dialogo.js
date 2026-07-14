// =====================================================================
// HANDLERS DE DIÁLOGO - Sí / No / Siguiente / Resumen
// Administran las confirmaciones (vaciar carrito, ofertas de la IA) y
// la lectura por partes de respuestas largas: el usuario puede pedir
// CONTINUAR (sí / siguiente), RESUMIR (resumen) o DETENER (no / basta).
// Estado usado: attrs.confirmandoVaciar, attrs.paginacion,
// attrs.pendingCarrito, attrs.productoActivo.
// =====================================================================
const Alexa = require('ask-sdk-core');
const { obtenerCatalogoCompleto, productosEnCache } = require('../lib/api');
const { responderConIA } = require('../lib/ia');
const { responder } = require('../lib/respuesta');
const { buildImageList, buildMultipleChoice } = require('../lib/apl');
const { iniciarAgregadoProducto, ejecutarVaciado, ejecutarCrearPedido } = require('./carrito');
const { ejecutarCambioEstado, ejecutarAsignacion, ejecutarMarcarAgotado } = require('./negocio');

const TAM_PAGINA = 5;

function esIntent(h, nombre) {
  return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === nombre;
}

function productoAItem(p) {
  return {
    primario: p.nombre,
    secundario: '$' + Number(p.precio_chico || 0).toFixed(0) + ' MXN',
    terciario: p.categoria || '',
    imagen: p.imagen_url || '',
    id: p.id,
  };
}

// CONTINUAR: lee la siguiente página de la lista pendiente
async function continuarPaginacion(h) {
  const attrs = h.attributesManager.getSessionAttributes();
  const pag = attrs.paginacion;
  if (!pag) return null;

  let pagina;
  let quedan;
  let items;
  let habla;

  if (pag.tipo === 'catalogo') {
    const productos = await obtenerCatalogoCompleto();
    pagina = productos.slice(pag.offset, pag.offset + TAM_PAGINA);
    quedan = Math.max(0, productos.length - pag.offset - pagina.length);
    items = pagina.map(productoAItem);
    habla = pagina.map(p => `${p.nombre} a ${Number(p.precio_chico || 0).toFixed(0)} pesos`).join(', ');
  } else {
    const todos = pag.items || [];
    pagina = todos.slice(pag.offset, pag.offset + TAM_PAGINA);
    quedan = Math.max(0, todos.length - pag.offset - pagina.length);
    items = pagina;
    habla = pagina.map(i => i.habla || i.primario).join('; ');
  }

  if (pagina.length === 0) {
    delete attrs.paginacion;
    h.attributesManager.setSessionAttributes(attrs);
    return responder(h, 'Ya te conté todo. ¿Te ayudo con otra cosa?');
  }

  pag.offset += pagina.length;
  if (quedan <= 0) delete attrs.paginacion;
  h.attributesManager.setSessionAttributes(attrs);

  const cierre = quedan > 0
    ? ` Quedan ${quedan} más: dime continúa, pide un resumen, o di basta.`
    : ' Y con eso terminamos. ¿Cuál se te antojó?';
  return responder(
    h,
    `${habla}.${cierre}`,
    buildImageList(
      pag.titulo || 'Nuestro catálogo',
      items,
      quedan > 0 ? 'Di "continúa" para escuchar más' : 'Pide el que más se te antoje'
    ),
    'paginacionToken'
  );
}

// RESUMIR: en lugar de seguir leyendo, condensa lo que falta
async function resumirPaginacion(h) {
  const attrs = h.attributesManager.getSessionAttributes();
  const pag = attrs.paginacion;
  if (!pag) return null;

  let texto;
  if (pag.tipo === 'catalogo') {
    const productos = await obtenerCatalogoCompleto();
    const restantes = productos.slice(pag.offset);
    const precios = restantes.map(p => Number(p.precio_chico || 0)).filter(n => n > 0);
    const cats = [...new Set(restantes.map(p => p.categoria).filter(Boolean))].slice(0, 3).join(', ');
    const rango = precios.length
      ? `, con precios entre ${Math.min(...precios).toFixed(0)} y ${Math.max(...precios).toFixed(0)} pesos`
      : '';
    texto = `Te resumo lo que falta: ${restantes.length} productos más${cats ? `, sobre todo ${cats}` : ''}${rango}. El catálogo completo con fotos está en la web. ¿Se te antojó alguno?`;
  } else {
    const restantes = Math.max(0, (pag.items || []).length - pag.offset);
    texto = `Te quedan ${restantes} más por escuchar; el detalle completo lo tienes en la web. ¿Algo más en lo que te ayude?`;
  }

  delete attrs.paginacion;
  h.attributesManager.setSessionAttributes(attrs);
  return responder(h, texto);
}

const YesIntentHandler = {
  canHandle(h) { return esIntent(h, 'AMAZON.YesIntent'); },
  async handle(h) {
    const attrs = h.attributesManager.getSessionAttributes();

    // 0) Confirmación pendiente de CREAR PEDIDO (checkout por voz)
    if (attrs.confirmandoPedido) {
      delete attrs.confirmandoPedido;
      h.attributesManager.setSessionAttributes(attrs);
      return ejecutarCrearPedido(h);
    }

    // 0.1) Confirmaciones del personal: estado de pedido, asignación, agotado
    if (attrs.confirmandoEstadoPedido) return ejecutarCambioEstado(h);
    if (attrs.confirmandoAsignacion) return ejecutarAsignacion(h);
    if (attrs.confirmandoAgotado) return ejecutarMarcarAgotado(h);

    // 1) Confirmación pendiente de vaciar carrito
    if (attrs.confirmandoVaciar) {
      delete attrs.confirmandoVaciar;
      h.attributesManager.setSessionAttributes(attrs);
      return ejecutarVaciado(h);
    }

    // 2) Lectura por partes pendiente
    if (attrs.paginacion) return continuarPaginacion(h);

    // 3) Elección de tamaño pendiente: "sí" no es un tamaño, reorientamos
    if (attrs.pendingCarrito) {
      const p = attrs.pendingCarrito;
      const precioC = Number(p.precio_chico).toFixed(0);
      const precioG = Number(p.precio_grande).toFixed(0);
      return responder(
        h,
        `Va, pero dime el tamaño del ${p.producto_nombre}: ¿chico o grande?`,
        buildMultipleChoice(`¿Qué tamaño de ${p.producto_nombre} prefieres?`, [
          { letra: 'A', texto: `Chico · $${precioC} MXN`, valor: 'chico' },
          { letra: 'B', texto: `Grande · $${precioG} MXN`, valor: 'grande' },
        ]),
        'tamanoToken'
      );
    }

    // 4) "Sí" a una oferta de la IA ("¿te lo aparto?"): agrega el producto activo
    const pa = attrs.productoActivo;
    const ultimaIA = (attrs.historial || []).filter(m => m.role === 'assistant').slice(-1)[0]?.content || '';
    if (pa && pa.id && /aparto|agrego|carrito|apartamos|pedido/i.test(ultimaIA)) {
      const full = productosEnCache().find(x => x.id === pa.id) || pa;
      return iniciarAgregadoProducto(h, full);
    }

    // 5) "Sí" conversacional: que la IA cumpla lo que ofreció
    let respuesta;
    try {
      respuesta = await responderConIA(h, 'El usuario respondió "sí" a lo último que le preguntaste (revisa tu último mensaje del historial). Cumple lo que ofreciste o avanza la conversación de forma natural. Breve.', 'sí');
    } catch (e) { console.error(e); respuesta = 'Va. ¿En qué más te ayudo?'; }
    return responder(h, respuesta);
  },
};

const NoIntentHandler = {
  canHandle(h) { return esIntent(h, 'AMAZON.NoIntent'); },
  async handle(h) {
    const attrs = h.attributesManager.getSessionAttributes();

    if (attrs.confirmandoPedido) {
      delete attrs.confirmandoPedido;
      h.attributesManager.setSessionAttributes(attrs);
      return responder(h, 'Va, no confirmo nada. Tu carrito se queda tal cual por si te animas después. ¿Algo más?');
    }

    if (attrs.confirmandoEstadoPedido || attrs.confirmandoAsignacion || attrs.confirmandoAgotado) {
      delete attrs.confirmandoEstadoPedido;
      delete attrs.confirmandoAsignacion;
      delete attrs.confirmandoAgotado;
      h.attributesManager.setSessionAttributes(attrs);
      return responder(h, 'Va, no hago ningún cambio. ¿Algo más?');
    }

    if (attrs.confirmandoVaciar) {
      delete attrs.confirmandoVaciar;
      h.attributesManager.setSessionAttributes(attrs);
      return responder(h, 'Va, tu carrito se queda como está. ¿Algo más en lo que te ayude?');
    }

    if (attrs.paginacion) {
      delete attrs.paginacion;
      h.attributesManager.setSessionAttributes(attrs);
      return responder(h, 'Va, ahí le paramos. ¿Te ayudo con otra cosa?');
    }

    if (attrs.pendingCarrito) {
      delete attrs.pendingCarrito;
      h.attributesManager.setSessionAttributes(attrs);
      return responder(h, 'Sin problema, no lo agrego. ¿Algo más se te antoja?');
    }

    let respuesta;
    try {
      respuesta = await responderConIA(h, 'El usuario respondió "no" a lo último que le preguntaste. Acepta con naturalidad y ofrece otra alternativa o pregunta abierta. Breve.', 'no');
    } catch (e) { console.error(e); respuesta = 'Está bien. ¿En qué más te ayudo?'; }
    return responder(h, respuesta);
  },
};

const NextIntentHandler = {
  canHandle(h) { return esIntent(h, 'AMAZON.NextIntent'); },
  async handle(h) {
    const attrs = h.attributesManager.getSessionAttributes();
    if (attrs.paginacion) return continuarPaginacion(h);
    let respuesta;
    try {
      respuesta = await responderConIA(h, 'El usuario pidió "más" o "siguiente". Ofrécele más opciones del CATÁLOGO que no hayas mencionado aún, con precios. Breve.', 'dame más opciones');
    } catch (e) { console.error(e); respuesta = '¿Más opciones? Pregúntame por alguna categoría, como cheesecakes o frappes.'; }
    return responder(h, respuesta);
  },
};

const ResumirIntentHandler = {
  canHandle(h) { return esIntent(h, 'ResumirIntent'); },
  async handle(h) {
    const attrs = h.attributesManager.getSessionAttributes();
    if (attrs.paginacion) return resumirPaginacion(h);
    let respuesta;
    try {
      respuesta = await responderConIA(h, 'El usuario pidió un resumen. Resume en 2 oraciones qué tipos de productos hay en el CATÁLOGO y el rango de precios, sin listar todo.', 'dame un resumen del catálogo');
    } catch (e) { console.error(e); respuesta = 'Tenemos pasteles, cheesecakes, pays, galletas y bebidas, desde 70 hasta 590 pesos. ¿Qué se te antoja?'; }
    return responder(h, respuesta);
  },
};

module.exports = {
  YesIntentHandler,
  NoIntentHandler,
  NextIntentHandler,
  ResumirIntentHandler,
};
