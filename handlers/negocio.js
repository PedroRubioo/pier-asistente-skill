// =====================================================================
// HANDLERS DEL NEGOCIO (empleado / gerencia / dirección)
// Operan la tienda por voz con los mismos endpoints que el panel web:
//   - Cambiar estado de pedidos (notifica al cliente automáticamente)
//   - Detalle de un pedido, avisar demora
//   - Entregas y repartidores (tablero + asignación)
//   - Inventario: consultar agotados/bajos, reponer, marcar agotado
//   - Ventas del día
// Los pedidos se refieren por los ÚLTIMOS DÍGITOS del número PIER-...
// =====================================================================
const Alexa = require('ask-sdk-core');
const { fetchPier, fetchPierAuth, obtenerCatalogoCompleto } = require('../lib/api');
const { obtenerToken, limpiarVinculacion } = require('../lib/auth');
const { normalizar, mejorProductoPorNombre } = require('../lib/texto');
const { ahoraEnMexico } = require('../lib/horario');
const { responder, responderVincular } = require('../lib/respuesta');
const { buildHeadline, buildImageList } = require('../lib/apl');
const { ESTADOS_VOZ, estadoLegible } = require('./cuenta');

function esIntent(h, nombre) {
  return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === nombre;
}

const ROLES_PERSONAL = ['empleado', 'gerencia', 'direccion_general'];

// Valida acceso de personal. Devuelve el token o una respuesta de rechazo.
function accesoPersonal(h) {
  const token = obtenerToken(h);
  const attrs = h.attributesManager.getSessionAttributes();
  const rol = attrs.usuarioAutenticado?.rol;
  if (!token) {
    return { rechazo: responderVincular(h, 'Esa operación es del personal de Pier. Vincula tu cuenta de empleado con el código de tu panel web.') };
  }
  if (rol && !ROLES_PERSONAL.includes(rol)) {
    return { rechazo: responder(h, 'Esa operación es solo para el personal de Pier. ¿Te ayudo con el catálogo o con tu pedido?') };
  }
  return { token };
}

async function conSesionExpirada(h) {
  await limpiarVinculacion(h);
  return responderVincular(h, 'Tu sesión expiró. Genera un código nuevo en tu panel web y dime: vincula mi cuenta con el código.');
}

function esError403(e) {
  return /-> 403/.test(String(e.message));
}

// Busca un pedido por los últimos dígitos de su número PIER-YYMMDD-NNNN
async function resolverPedidoPorDigitos(token, digitos) {
  const data = await fetchPierAuth('/api/pedidos?limite=100', token);
  const pedidos = data.pedidos || [];
  const d = String(digitos || '').replace(/\D/g, '');
  if (!d) return { pedidos, pedido: null };
  const pedido = pedidos.find(p => String(p.numero || '').replace(/\D/g, '').endsWith(d)) || null;
  return { pedidos, pedido };
}

function resolverSlotEstado(h, nombreSlot) {
  const slot = h.requestEnvelope.request.intent?.slots?.[nombreSlot];
  const resuelto = slot?.resolutions?.resolutionsPerAuthority?.[0]?.values?.[0]?.value?.name
    || slot?.value || '';
  return resuelto;
}

// =====================================================================
// CAMBIAR ESTADO DE UN PEDIDO («marca el pedido 6651 como listo»)
// Con confirmación: el backend notifica al cliente (y email si es listo)
// =====================================================================
const CambiarEstadoPedidoIntentHandler = {
  canHandle(h) { return esIntent(h, 'CambiarEstadoPedidoIntent'); },
  async handle(h) {
    const acceso = accesoPersonal(h);
    if (acceso.rechazo) return acceso.rechazo;

    const numero = Alexa.getSlotValue(h.requestEnvelope, 'numero');
    // "cancela el pedido X" no trae slot de estado: se asume cancelado
    const dichoEstado = resolverSlotEstado(h, 'nuevoEstado') || 'cancelados';
    const estadoBD = ESTADOS_VOZ[normalizar(dichoEstado)] || ESTADOS_VOZ[dichoEstado];

    if (!numero) {
      return responder(h, '¿Cuál pedido? Dime los últimos cuatro dígitos del número, por ejemplo: marca el pedido sesenta y seis cincuenta y uno como listo.');
    }
    if (!estadoBD) {
      return responder(h, '¿A qué estado lo cambio? Puede ser listo, completado o cancelado.');
    }

    try {
      const { pedido } = await resolverPedidoPorDigitos(acceso.token, numero);
      if (!pedido) {
        return responder(h, `No encontré ningún pedido que termine en ${numero}. Revisa el número en tu panel.`);
      }
      const attrs = h.attributesManager.getSessionAttributes();
      attrs.confirmandoEstadoPedido = { id: pedido.id, numero: pedido.numero, estado: estadoBD };
      h.attributesManager.setSessionAttributes(attrs);
      const cliente = `${pedido.cliente_nombre || ''} ${pedido.cliente_apellido || ''}`.trim() || 'el cliente';
      return responder(
        h,
        `El pedido ${pedido.numero}, de ${cliente}, está ${estadoLegible(pedido.estado)}. ¿Lo cambio a ${estadoLegible(estadoBD)}? El cliente recibirá la notificación.`,
        buildHeadline({
          subtituloHeader: 'Cambiar estado',
          primario: pedido.numero,
          secundario: `${estadoLegible(pedido.estado)} → ${estadoLegible(estadoBD)}`,
          hint: 'Di "sí" para confirmar o "no" para cancelar',
        }),
        'estadoPedidoToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') return conSesionExpirada(h);
      if (esError403(e)) return responder(h, 'Esa operación es solo para el personal de Pier.');
      console.error('CambiarEstadoPedido error:', e);
      return responder(h, 'No pude consultar ese pedido en este momento.');
    }
  },
};

// Se ejecuta al confirmar con "sí"
async function ejecutarCambioEstado(h) {
  const attrs = h.attributesManager.getSessionAttributes();
  const pend = attrs.confirmandoEstadoPedido;
  delete attrs.confirmandoEstadoPedido;
  h.attributesManager.setSessionAttributes(attrs);
  if (!pend) return responder(h, '¿Cuál pedido querías actualizar?');

  const token = obtenerToken(h);
  if (!token) return conSesionExpirada(h);
  try {
    const body = { estado: pend.estado };
    if (pend.estado === 'cancelado') body.nota_cancelacion = 'Cancelado por el personal vía Alexa';
    await fetchPierAuth(`/api/pedidos/${pend.id}/estado`, token, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return responder(
      h,
      `Listo, el pedido ${pend.numero} ahora está ${estadoLegible(pend.estado)} y el cliente ya fue notificado. ¿Algo más?`,
      buildHeadline({
        subtituloHeader: 'Estado actualizado',
        primario: pend.numero,
        secundario: `Ahora: ${estadoLegible(pend.estado)} · Cliente notificado`,
      }),
      'estadoPedidoToken'
    );
  } catch (e) {
    if (String(e.message) === 'token_invalido') return conSesionExpirada(h);
    console.error('ejecutarCambioEstado error:', e);
    return responder(h, `No pude actualizar el pedido ${pend.numero}. Inténtalo desde tu panel.`);
  }
}

// =====================================================================
// DETALLE DE UN PEDIDO («qué lleva el pedido 6651»)
// =====================================================================
const DetallePedidoIntentHandler = {
  canHandle(h) { return esIntent(h, 'DetallePedidoIntent'); },
  async handle(h) {
    const acceso = accesoPersonal(h);
    if (acceso.rechazo) return acceso.rechazo;
    const numero = Alexa.getSlotValue(h.requestEnvelope, 'numero');
    if (!numero) {
      return responder(h, '¿Cuál pedido? Dime los últimos cuatro dígitos del número.');
    }
    try {
      const { pedido } = await resolverPedidoPorDigitos(acceso.token, numero);
      if (!pedido) {
        return responder(h, `No encontré ningún pedido que termine en ${numero}.`);
      }
      const detalle = await fetchPierAuth(`/api/pedidos/${pedido.id}`, acceso.token);
      const items = detalle.items || [];
      const habla = items.slice(0, 5).map(i => `${i.cantidad} ${i.nombre_producto}${i.tamano ? ' ' + i.tamano : ''}`).join(', ');
      const cliente = `${pedido.cliente_nombre || ''} ${pedido.cliente_apellido || ''}`.trim() || 'cliente';
      const itemsApl = items.slice(0, 6).map(i => ({
        primario: i.nombre_producto,
        secundario: `Cantidad: ${i.cantidad}${i.tamano ? ` (${i.tamano})` : ''}`,
        terciario: '$' + Number(i.subtotal || 0).toFixed(0),
      }));
      return responder(
        h,
        `El pedido ${pedido.numero}, de ${cliente}, lleva: ${habla}. Total ${Number(pedido.total || 0).toFixed(0)} pesos, estado ${estadoLegible(pedido.estado)}.`,
        buildImageList(`${pedido.numero} · $${Number(pedido.total || 0).toFixed(0)}`, itemsApl, `Cliente: ${cliente} · ${estadoLegible(pedido.estado)}`),
        'detallePedidoToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') return conSesionExpirada(h);
      if (esError403(e)) return responder(h, 'Esa operación es solo para el personal de Pier.');
      console.error('DetallePedido error:', e);
      return responder(h, 'No pude consultar ese pedido en este momento.');
    }
  },
};

// =====================================================================
// AVISAR DEMORA («avisa demora del pedido 6651»)
// Solo pedidos a domicilio en estado listo; el backend manda correo
// =====================================================================
const AvisarDemoraIntentHandler = {
  canHandle(h) { return esIntent(h, 'AvisarDemoraIntent'); },
  async handle(h) {
    const acceso = accesoPersonal(h);
    if (acceso.rechazo) return acceso.rechazo;
    const numero = Alexa.getSlotValue(h.requestEnvelope, 'numero');
    if (!numero) {
      return responder(h, '¿De cuál pedido aviso la demora? Dime los últimos cuatro dígitos.');
    }
    try {
      const { pedido } = await resolverPedidoPorDigitos(acceso.token, numero);
      if (!pedido) {
        return responder(h, `No encontré ningún pedido que termine en ${numero}.`);
      }
      await fetchPierAuth('/api/entregas/avisar-demora', acceso.token, {
        method: 'POST',
        body: JSON.stringify({ pedido_id: pedido.id }),
      });
      return responder(
        h,
        `Listo, le avisé al cliente del pedido ${pedido.numero} que su entrega viene con demora. Le llegó notificación y correo.`,
        buildHeadline({
          subtituloHeader: 'Aviso de demora',
          primario: pedido.numero,
          secundario: 'Cliente notificado por correo y app',
        }),
        'demoraToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') return conSesionExpirada(h);
      if (/-> 400/.test(String(e.message))) {
        return responder(h, 'Solo puedo avisar demora en pedidos a domicilio que ya están listos y esperando repartidor.');
      }
      console.error('AvisarDemora error:', e);
      return responder(h, 'No pude enviar el aviso en este momento.');
    }
  },
};

// =====================================================================
// TABLERO DE ENTREGAS («qué entregas están en camino»)
// =====================================================================
const ESTADOS_ENTREGA_VOZ = {
  'asignadas': 'asignada',
  'en camino': 'en_camino',
};

// Plural hablado correcto: "asignadas", pero "en camino" (nunca "en caminos")
function pluralEntrega(estadoBD) {
  return estadoBD === 'asignada' ? 'asignadas' : 'en camino';
}

const EntregasIntentHandler = {
  canHandle(h) { return esIntent(h, 'EntregasIntent'); },
  async handle(h) {
    const acceso = accesoPersonal(h);
    if (acceso.rechazo) return acceso.rechazo;
    const dicho = resolverSlotEstado(h, 'estadoEntrega');
    const estadoBD = ESTADOS_ENTREGA_VOZ[normalizar(dicho)] || null;
    try {
      const query = estadoBD ? `/api/entregas?estado=${encodeURIComponent(estadoBD)}` : '/api/entregas';
      const data = await fetchPierAuth(query, acceso.token);
      const entregas = (data.entregas || []).slice(0, 6);
      if (entregas.length === 0) {
        return responder(h, estadoBD
          ? `No hay entregas ${pluralEntrega(estadoBD)} en este momento.`
          : 'No hay entregas registradas por ahora.');
      }
      const habla = entregas.slice(0, 3).map(en =>
        `${en.numero} con ${en.repartidor_nombre || 'repartidor por asignar'}, ${estadoLegible(en.estado)}`
      ).join('; ');
      const items = entregas.map(en => ({
        primario: en.numero || `#${en.pedido_id}`,
        secundario: `${en.repartidor_nombre || ''} ${en.repartidor_apellido || ''}`.trim() || 'Sin repartidor',
        terciario: estadoLegible(en.estado),
      }));
      return responder(
        h,
        `${entregas.length === 1 ? 'Hay 1 entrega' : `Hay ${entregas.length} entregas`}${estadoBD ? ` ${entregas.length === 1 ? estadoLegible(estadoBD) : pluralEntrega(estadoBD)}` : ''}: ${habla}.`,
        buildImageList('Entregas a domicilio', items, 'El tablero completo está en tu panel'),
        'entregasToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') return conSesionExpirada(h);
      if (esError403(e)) return responder(h, 'Esa operación es solo para el personal de Pier.');
      console.error('Entregas error:', e);
      return responder(h, 'No pude consultar las entregas en este momento.');
    }
  },
};

// =====================================================================
// REPARTIDORES DISPONIBLES
// =====================================================================
const RepartidoresIntentHandler = {
  canHandle(h) { return esIntent(h, 'RepartidoresIntent'); },
  async handle(h) {
    const acceso = accesoPersonal(h);
    if (acceso.rechazo) return acceso.rechazo;
    try {
      const data = await fetchPierAuth('/api/entregas/repartidores', acceso.token);
      const reps = data.repartidores || [];
      if (reps.length === 0) {
        return responder(h, 'No hay repartidores registrados todavía.');
      }
      const disponibles = reps.filter(r => r.disponible);
      const habla = disponibles.length === 0
        ? 'Ningún repartidor está disponible ahorita.'
        : `Disponibles: ${disponibles.map(r => `${r.nombre}${Number(r.entregas_activas) > 0 ? ` con ${r.entregas_activas} entregas activas` : ''}`).join(', ')}.`;
      const items = reps.map(r => ({
        primario: `${r.nombre} ${r.apellido || ''}`.trim(),
        secundario: r.disponible ? 'Disponible' : 'No disponible',
        terciario: `${r.entregas_activas || 0} entregas activas`,
      }));
      return responder(h, habla, buildImageList('Repartidores', items, 'Di: "asigna el pedido X a [nombre]"'), 'repartidoresToken');
    } catch (e) {
      if (String(e.message) === 'token_invalido') return conSesionExpirada(h);
      if (esError403(e)) return responder(h, 'Esa operación es solo para el personal de Pier.');
      console.error('Repartidores error:', e);
      return responder(h, 'No pude consultar los repartidores en este momento.');
    }
  },
};

// =====================================================================
// ASIGNAR REPARTIDOR («asigna el pedido 6651 a Carlos»)
// Con confirmación; el pedido pasa a "asignado" y se notifica al repartidor
// =====================================================================
const AsignarRepartidorIntentHandler = {
  canHandle(h) { return esIntent(h, 'AsignarRepartidorIntent'); },
  async handle(h) {
    const acceso = accesoPersonal(h);
    if (acceso.rechazo) return acceso.rechazo;
    const numero = Alexa.getSlotValue(h.requestEnvelope, 'numero');
    const nombreDicho = Alexa.getSlotValue(h.requestEnvelope, 'repartidor');
    if (!numero || !nombreDicho) {
      return responder(h, 'Dime el pedido y el repartidor, por ejemplo: asigna el pedido sesenta y seis cincuenta y uno a Carlos.');
    }
    try {
      const [{ pedido }, dataReps] = await Promise.all([
        resolverPedidoPorDigitos(acceso.token, numero),
        fetchPierAuth('/api/entregas/repartidores', acceso.token),
      ]);
      if (!pedido) {
        return responder(h, `No encontré ningún pedido que termine en ${numero}.`);
      }
      const reps = dataReps.repartidores || [];
      const rep = reps.find(r => normalizar(`${r.nombre} ${r.apellido || ''}`).includes(normalizar(nombreDicho)));
      if (!rep) {
        const disponibles = reps.filter(r => r.disponible).map(r => r.nombre).join(', ');
        return responder(h, `No encontré a ${nombreDicho} entre los repartidores. ${disponibles ? `Disponibles: ${disponibles}.` : 'No hay repartidores registrados.'}`);
      }
      const attrs = h.attributesManager.getSessionAttributes();
      attrs.confirmandoAsignacion = {
        pedido_id: pedido.id,
        numero: pedido.numero,
        repartidor_id: rep.id,
        repartidor_nombre: `${rep.nombre} ${rep.apellido || ''}`.trim(),
      };
      h.attributesManager.setSessionAttributes(attrs);
      return responder(
        h,
        `¿Asigno el pedido ${pedido.numero} a ${rep.nombre}${rep.disponible ? '' : ', que ahorita aparece como NO disponible'}? Di sí para confirmar.`,
        buildHeadline({
          subtituloHeader: 'Asignar repartidor',
          primario: pedido.numero,
          secundario: `→ ${rep.nombre} ${rep.apellido || ''}`,
          hint: 'Di "sí" para confirmar o "no" para cancelar',
        }),
        'asignarToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') return conSesionExpirada(h);
      if (esError403(e)) return responder(h, 'Esa operación es solo para el personal de Pier.');
      console.error('AsignarRepartidor error:', e);
      return responder(h, 'No pude preparar la asignación en este momento.');
    }
  },
};

async function ejecutarAsignacion(h) {
  const attrs = h.attributesManager.getSessionAttributes();
  const pend = attrs.confirmandoAsignacion;
  delete attrs.confirmandoAsignacion;
  h.attributesManager.setSessionAttributes(attrs);
  if (!pend) return responder(h, '¿Cuál asignación querías confirmar?');

  const token = obtenerToken(h);
  if (!token) return conSesionExpirada(h);
  try {
    await fetchPierAuth('/api/entregas', token, {
      method: 'POST',
      body: JSON.stringify({ pedido_id: pend.pedido_id, repartidor_id: pend.repartidor_id }),
    });
    return responder(
      h,
      `Listo, el pedido ${pend.numero} quedó asignado a ${pend.repartidor_nombre} y ya le llegó la notificación.`,
      buildHeadline({
        subtituloHeader: 'Entrega asignada',
        primario: pend.numero,
        secundario: `Repartidor: ${pend.repartidor_nombre}`,
      }),
      'asignarToken'
    );
  } catch (e) {
    if (String(e.message) === 'token_invalido') return conSesionExpirada(h);
    if (/-> 400/.test(String(e.message))) {
      return responder(h, `No se pudo asignar: el pedido debe ser a domicilio y estar listo, y el repartidor disponible sin otra entrega activa. Revisa el panel.`);
    }
    console.error('ejecutarAsignacion error:', e);
    return responder(h, 'No pude completar la asignación en este momento.');
  }
}

// =====================================================================
// INVENTARIO: CONSULTAR AGOTADOS Y STOCK BAJO
// =====================================================================
const ConsultarStockIntentHandler = {
  canHandle(h) { return esIntent(h, 'ConsultarStockIntent'); },
  async handle(h) {
    const acceso = accesoPersonal(h);
    if (acceso.rechazo) return acceso.rechazo;
    try {
      const data = await fetchPier('/api/productos?limite=100', 5000);
      const productos = (data.productos || []).filter(p => p.activo !== false);
      const agotados = productos.filter(p => Number(p.stock_online) === 0);
      const bajos = productos.filter(p => Number(p.stock_online) > 0 && Number(p.stock_online) <= 5);
      if (agotados.length === 0 && bajos.length === 0) {
        return responder(h, 'El inventario en línea está sano: nada agotado ni bajo de stock.');
      }
      const partes = [];
      if (agotados.length) partes.push(`Agotados: ${agotados.slice(0, 4).map(p => p.nombre).join(', ')}${agotados.length > 4 ? ` y ${agotados.length - 4} más` : ''}`);
      if (bajos.length) partes.push(`Con poco stock: ${bajos.slice(0, 4).map(p => `${p.nombre} con ${p.stock_online}`).join(', ')}${bajos.length > 4 ? ` y ${bajos.length - 4} más` : ''}`);
      const items = [...agotados, ...bajos].slice(0, 6).map(p => ({
        primario: p.nombre,
        secundario: Number(p.stock_online) === 0 ? 'AGOTADO' : `Quedan ${p.stock_online}`,
        terciario: p.categoria || '',
        imagen: p.imagen_url || '',
      }));
      return responder(
        h,
        `${partes.join('. ')}. Puedes decir: repón diez unidades de tal producto.`,
        buildImageList('Inventario en línea', items, 'Di: "repón N unidades de [producto]"'),
        'stockToken'
      );
    } catch (e) {
      console.error('ConsultarStock error:', e);
      return responder(h, 'No pude consultar el inventario en este momento.');
    }
  },
};

// =====================================================================
// REPONER STOCK («repón 10 unidades del chocoflán»)
// =====================================================================
const ReponerStockIntentHandler = {
  canHandle(h) { return esIntent(h, 'ReponerStockIntent'); },
  async handle(h) {
    const acceso = accesoPersonal(h);
    if (acceso.rechazo) return acceso.rechazo;
    const cantidad = parseInt(Alexa.getSlotValue(h.requestEnvelope, 'cantidad') || '0');
    const dicho = Alexa.getSlotValue(h.requestEnvelope, 'productoInventario') || '';
    if (!cantidad || cantidad < 1) {
      return responder(h, '¿Cuántas unidades repongo y de qué producto? Por ejemplo: repón diez unidades del chocoflán.');
    }
    try {
      const catalogo = await obtenerCatalogoCompleto();
      const producto = mejorProductoPorNombre(dicho, catalogo);
      if (!producto) {
        return responder(h, `No encontré "${dicho}" en el catálogo. ¿De cuál producto repongo stock?`);
      }
      const actual = Number(producto.stock_online) || 0;
      const nuevo = actual + cantidad;
      await fetchPierAuth(`/api/productos/${producto.id}`, acceso.token, {
        method: 'PUT',
        body: JSON.stringify({ stock_online: nuevo }),
      });
      return responder(
        h,
        `Listo, ${producto.nombre} pasó de ${actual} a ${nuevo} unidades en línea.`,
        buildHeadline({
          subtituloHeader: 'Stock actualizado',
          primario: producto.nombre,
          secundario: `${actual} → ${nuevo} unidades en línea`,
        }),
        'stockToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') return conSesionExpirada(h);
      if (esError403(e)) return responder(h, 'Esa operación es solo para el personal de Pier.');
      console.error('ReponerStock error:', e);
      return responder(h, 'No pude actualizar el stock en este momento.');
    }
  },
};

// =====================================================================
// MARCAR AGOTADO («se acabó el chocoflán») — con confirmación,
// porque bloquea la venta en línea del producto
// =====================================================================
const MarcarAgotadoIntentHandler = {
  canHandle(h) { return esIntent(h, 'MarcarAgotadoIntent'); },
  async handle(h) {
    const acceso = accesoPersonal(h);
    if (acceso.rechazo) return acceso.rechazo;
    const dicho = Alexa.getSlotValue(h.requestEnvelope, 'productoInventario') || '';
    try {
      const catalogo = await obtenerCatalogoCompleto();
      const producto = mejorProductoPorNombre(dicho, catalogo);
      if (!producto) {
        return responder(h, `No encontré "${dicho}" en el catálogo. ¿Cuál producto marco como agotado?`);
      }
      const attrs = h.attributesManager.getSessionAttributes();
      attrs.confirmandoAgotado = { id: producto.id, nombre: producto.nombre };
      h.attributesManager.setSessionAttributes(attrs);
      return responder(
        h,
        `¿Marco ${producto.nombre} como agotado? Ya no se podrá comprar en línea hasta que repongas stock. Di sí o no.`,
        buildHeadline({
          subtituloHeader: 'Marcar agotado',
          primario: producto.nombre,
          secundario: 'Bloqueará su venta en línea',
          hint: 'Di "sí" para confirmar o "no" para cancelar',
        }),
        'stockToken'
      );
    } catch (e) {
      console.error('MarcarAgotado error:', e);
      return responder(h, 'No pude consultar el catálogo en este momento.');
    }
  },
};

async function ejecutarMarcarAgotado(h) {
  const attrs = h.attributesManager.getSessionAttributes();
  const pend = attrs.confirmandoAgotado;
  delete attrs.confirmandoAgotado;
  h.attributesManager.setSessionAttributes(attrs);
  if (!pend) return responder(h, '¿Cuál producto querías marcar como agotado?');

  const token = obtenerToken(h);
  if (!token) return conSesionExpirada(h);
  try {
    await fetchPierAuth(`/api/productos/${pend.id}`, token, {
      method: 'PUT',
      body: JSON.stringify({ stock_online: 0 }),
    });
    return responder(
      h,
      `Listo, ${pend.nombre} quedó marcado como agotado en línea. Cuando llegue producto, dime: repón unidades de ${pend.nombre}.`,
      buildHeadline({
        subtituloHeader: 'Producto agotado',
        primario: pend.nombre,
        secundario: 'Venta en línea pausada',
        hint: 'Repón stock por voz cuando llegue producto',
      }),
      'stockToken'
    );
  } catch (e) {
    if (String(e.message) === 'token_invalido') return conSesionExpirada(h);
    console.error('ejecutarMarcarAgotado error:', e);
    return responder(h, 'No pude actualizar el producto en este momento.');
  }
}

// =====================================================================
// VENTAS DEL DÍA («cómo van las ventas hoy»)
// Calculado desde los pedidos, igual que los contadores del panel web
// =====================================================================
const VentasHoyIntentHandler = {
  canHandle(h) { return esIntent(h, 'VentasHoyIntent'); },
  async handle(h) {
    const acceso = accesoPersonal(h);
    if (acceso.rechazo) return acceso.rechazo;
    try {
      const data = await fetchPierAuth('/api/pedidos?limite=100', acceso.token);
      const ahora = ahoraEnMexico();
      const hoyStr = `${ahora.getUTCFullYear()}-${String(ahora.getUTCMonth() + 1).padStart(2, '0')}-${String(ahora.getUTCDate()).padStart(2, '0')}`;
      const deHoy = (data.pedidos || []).filter(p => {
        if (!p.created_at) return false;
        const f = new Date(new Date(p.created_at).getTime() - 6 * 60 * 60 * 1000);
        const fStr = `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, '0')}-${String(f.getUTCDate()).padStart(2, '0')}`;
        return fStr === hoyStr;
      });
      if (deHoy.length === 0) {
        return responder(h, 'Hoy todavía no entran pedidos. ¡Ánimo, el día es joven!');
      }
      const validos = deHoy.filter(p => p.estado !== 'cancelado');
      const total = validos.reduce((s, p) => s + (Number(p.total) || 0), 0);
      const conteo = {};
      deHoy.forEach(p => { conteo[p.estado] = (conteo[p.estado] || 0) + 1; });
      const desglose = Object.entries(conteo).map(([e, n]) => `${n} ${estadoLegible(e)}`).join(', ');
      return responder(
        h,
        `Hoy van ${deHoy.length} ${deHoy.length === 1 ? 'pedido' : 'pedidos'} por ${total.toFixed(0)} pesos sin contar cancelados. Desglose: ${desglose}.`,
        buildHeadline({
          subtituloHeader: 'Ventas de hoy',
          primario: `$${total.toFixed(0)} MXN`,
          secundario: `${deHoy.length} pedidos · ${desglose}`,
          hint: 'El detalle completo está en tu panel',
        }),
        'ventasToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') return conSesionExpirada(h);
      if (esError403(e)) return responder(h, 'Esa consulta es solo para el personal de Pier.');
      console.error('VentasHoy error:', e);
      return responder(h, 'No pude calcular las ventas en este momento.');
    }
  },
};

module.exports = {
  CambiarEstadoPedidoIntentHandler,
  DetallePedidoIntentHandler,
  AvisarDemoraIntentHandler,
  EntregasIntentHandler,
  RepartidoresIntentHandler,
  AsignarRepartidorIntentHandler,
  ConsultarStockIntentHandler,
  ReponerStockIntentHandler,
  MarcarAgotadoIntentHandler,
  VentasHoyIntentHandler,
  ejecutarCambioEstado,
  ejecutarAsignacion,
  ejecutarMarcarAgotado,
};
