// =====================================================================
// EVENTOS APL (táctil) - Atiende los SendEvent de las plantillas:
//   ['categoria', nombre]  <- Cards Layout
//   ['producto', id]       <- Image List
//   ['agregar', id]        <- Image Right Detail (botón)
//   ['tamano', valor]      <- Multiple Choice
//   ['horario', '']        <- Image Left Detail (botón)
// =====================================================================
const Alexa = require('ask-sdk-core');
const { fetchPier, obtenerContexto, productosEnCache } = require('../lib/api');
const { describirHorario, estaAbiertoAhora } = require('../lib/horario');
const { responder } = require('../lib/respuesta');
const { buildImageList, buildDetalleProducto, buildHeadline } = require('../lib/apl');
const { manejarEleccionTamano, iniciarAgregadoProducto } = require('./carrito');

function buscarProductoPorId(id) {
  return productosEnCache().find(p => String(p.id) === String(id)) || null;
}

async function manejarCategoria(h, nombreCategoria) {
  const ctx = await obtenerContexto().catch(() => null);
  let productos = (ctx?.prods?.productos || []).filter(
    p => p.categoria && p.categoria.toLowerCase() === String(nombreCategoria).toLowerCase()
  );

  // Si el contexto (top 10) no trae productos de esa categoría, pedimos al backend
  if (productos.length === 0) {
    const data = await fetchPier(
      `/api/productos?limite=6&categoria=${encodeURIComponent(nombreCategoria)}`,
      4000
    ).catch(() => ({ productos: [] }));
    productos = data.productos || [];
  }

  if (productos.length === 0) {
    return responder(h, `De ${nombreCategoria} no tengo productos a la mano en este momento. Encuentra la categoría completa en la web. ¿Te ayudo con otra cosa?`);
  }

  const attrs = h.attributesManager.getSessionAttributes();
  attrs.productosListados = productos.slice(0, 6).map(p => ({
    id: p.id, nombre: p.nombre, precio_chico: p.precio_chico,
  }));
  attrs.productoActivo = null;
  h.attributesManager.setSessionAttributes(attrs);

  const items = productos.slice(0, 6).map(p => ({
    primario: p.nombre,
    secundario: '$' + Number(p.precio_chico || 0).toFixed(0) + ' MXN',
    terciario: p.rating && Number(p.rating) > 0 ? Number(p.rating).toFixed(1) + ' estrellas' : '',
    imagen: p.imagen_url || '',
    id: p.id,
  }));
  const nombres = productos.slice(0, 3).map(p => p.nombre).join(', ');
  return responder(
    h,
    `De ${nombreCategoria} tenemos ${nombres}${productos.length > 3 ? ', entre otros' : ''}. Toca uno para ver su detalle o dime cuál se te antoja.`,
    buildImageList(nombreCategoria, items, 'Toca un producto para ver su detalle'),
    'categoriaProductosToken'
  );
}

function manejarDetalleProducto(h, id) {
  const producto = buscarProductoPorId(id);
  if (!producto) {
    return responder(h, 'No encontré ese producto en este momento. ¿Te ayudo con otro?');
  }
  const attrs = h.attributesManager.getSessionAttributes();
  attrs.productoActivo = {
    id: producto.id, nombre: producto.nombre,
    precio_chico: producto.precio_chico, precio_grande: producto.precio_grande,
  };
  h.attributesManager.setSessionAttributes(attrs);

  const precioC = Number(producto.precio_chico || 0).toFixed(0);
  const tieneGrande = producto.precio_grande && Number(producto.precio_grande) !== Number(producto.precio_chico);
  const habla = tieneGrande
    ? `El ${producto.nombre} está en ${precioC} pesos el chico y ${Number(producto.precio_grande).toFixed(0)} el grande. ¿Te lo agrego al carrito?`
    : `El ${producto.nombre} está en ${precioC} pesos. ¿Te lo agrego al carrito?`;
  return responder(h, habla, buildDetalleProducto(producto), 'productoToken');
}

async function manejarAgregar(h, id) {
  const producto = buscarProductoPorId(id);
  if (!producto) {
    return responder(h, 'No pude identificar el producto. Dime su nombre y te lo agrego.');
  }
  return iniciarAgregadoProducto(h, producto);
}

function manejarHorario(h) {
  const estado = estaAbiertoAhora();
  return responder(
    h,
    describirHorario(),
    buildHeadline({
      subtituloHeader: estado.abierto ? 'Abierto ahora' : 'Cerrado ahora',
      primario: estado.abierto ? 'Estamos abiertos' : 'Cerrados por ahora',
      secundario: 'Lunes a sábado de 8:00 a 21:00. Domingo cerrado.',
      hint: estado.abierto ? `Hoy cerramos a las ${estado.cierra}:00` : 'Te esperamos pronto',
    }),
    'horarioToken'
  );
}

const AplUserEventHandler = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'Alexa.Presentation.APL.UserEvent';
  },
  async handle(h) {
    const args = h.requestEnvelope.request.arguments || [];
    const accion = args[0];
    const valor = args[1];

    switch (accion) {
      case 'categoria':
        return manejarCategoria(h, valor);
      case 'producto':
        return manejarDetalleProducto(h, valor);
      case 'agregar':
        return manejarAgregar(h, valor);
      case 'tamano':
        return manejarEleccionTamano(h, valor);
      case 'horario':
        return manejarHorario(h);
      default:
        return responder(h, '¿En qué más te ayudo?');
    }
  },
};

module.exports = { AplUserEventHandler };
