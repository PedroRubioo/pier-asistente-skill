// =====================================================================
// HANDLERS DE CARRITO - Agregar (con elección de tamaño por voz o
// pantalla Multiple Choice), consultar y vaciar
// =====================================================================
const Alexa = require('ask-sdk-core');
const { PIER_WEB } = require('../lib/config');
const { fetchPierAuth, obtenerCatalogoCompleto } = require('../lib/api');
const { obtenerToken, limpiarVinculacion } = require('../lib/auth');
const { normalizar, cantidadDesdeTexto } = require('../lib/texto');
const { responderConIA } = require('../lib/ia');
const { responder, responderVincular } = require('../lib/respuesta');
const { buildImageList, buildMultipleChoice, buildHeadline } = require('../lib/apl');

function esIntent(h, nombre) {
  return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === nombre;
}

function resolverProductoDesdePregunta(texto, attrs, catalogo) {
  // 1) Si el texto menciona un producto del catálogo, ese gana.
  // Comparamos SIN acentos: Alexa transcribe "chocoflán" pero el
  // catálogo puede decir "Chocoflan" (y viceversa).
  const textoNorm = normalizar(texto);
  const dichos = (catalogo || []).filter(p =>
    p.nombre && textoNorm.includes(normalizar(p.nombre))
  );
  if (dichos.length === 1) return dichos[0];
  // Si varios matchean (ej. "Cheesecake" y "Cheesecake Oreo"), gana el más específico
  if (dichos.length > 1) {
    return dichos.sort((a, b) => b.nombre.length - a.nombre.length)[0];
  }

  // 2) Si dice "ese", "este", "el" sin más, usa el productoActivo
  const t = textoNorm.trim();
  const referenciaCorta = /^(ese|este|esa|esta|esos|el|la|lo|aqu[eé]l|aquella)?$/.test(t);
  if (referenciaCorta && attrs?.productoActivo) {
    const id = attrs.productoActivo.id;
    return (catalogo || []).find(p => p.id === id) || attrs.productoActivo;
  }

  // 3) Si no hay match claro pero hay productoActivo, lo usamos como fallback
  if (attrs?.productoActivo) return attrs.productoActivo;

  return null;
}

function detectarTamanoEnTexto(texto) {
  const t = String(texto || '').toLowerCase();
  if (/\b(grande|grandes|grandote|jumbo|familiar)\b/.test(t)) return 'grande';
  if (/\b(chico|chica|peque[ñn]o|peque[ñn]a|chiquito|individual|mini)\b/.test(t)) return 'chico';
  return null;
}

async function ejecutarAgregadoCarrito(h, token, producto, tamano, cantidad = 1) {
  try {
    const body = JSON.stringify({ producto_id: producto.id, cantidad, tamano });
    const data = await fetchPierAuth('/api/carrito', token, { method: 'POST', body });
    const attrs = h.attributesManager.getSessionAttributes();
    delete attrs.pendingCarrito;
    if (data.success) {
      attrs.productoActivo = {
        id: producto.id, nombre: producto.nombre,
        precio_chico: producto.precio_chico, precio_grande: producto.precio_grande,
      };
      h.attributesManager.setSessionAttributes(attrs);
      const precioUnit = tamano === 'grande' && producto.precio_grande
        ? Number(producto.precio_grande)
        : Number(producto.precio_chico);
      const total = (precioUnit * cantidad).toFixed(0);
      const frase = cantidad > 1
        ? `Listo, agregué ${cantidad} ${producto.nombre} ${tamano} a tu carrito por ${total} pesos en total. Confirma tu pedido en ${PIER_WEB}.`
        : `Listo, agregué un ${producto.nombre} ${tamano} a tu carrito por ${total} pesos. Confirma tu pedido en ${PIER_WEB}.`;
      return responder(
        h,
        frase,
        buildHeadline({
          subtituloHeader: 'Agregado al carrito',
          primario: `${producto.nombre} (${tamano})${cantidad > 1 ? ' ×' + cantidad : ''}`,
          secundario: `$${total} MXN`,
          hint: 'Confirma tu pedido en la web',
        }),
        'carritoOkToken'
      );
    }
    h.attributesManager.setSessionAttributes(attrs);
    return responder(h, data.message || 'No pude agregarlo al carrito en este momento.');
  } catch (e) {
    if (String(e.message) === 'token_invalido') {
      await limpiarVinculacion(h);
      return responderVincular(h, 'Tu sesión expiró. Genera un código nuevo en tu perfil de la web y dime: vincula mi cuenta con el código.');
    }
    console.error('ejecutarAgregadoCarrito error:', e);
    return responder(h, 'No pude agregarlo al carrito en este momento.');
  }
}

// Pregunta el tamaño por voz y muestra la pantalla Multiple Choice
function preguntarTamano(h, producto, cantidad = 1) {
  const attrs = h.attributesManager.getSessionAttributes();
  attrs.pendingCarrito = {
    producto_id: producto.id,
    producto_nombre: producto.nombre,
    precio_chico: producto.precio_chico,
    precio_grande: producto.precio_grande,
    cantidad,
  };
  h.attributesManager.setSessionAttributes(attrs);
  const precioC = Number(producto.precio_chico).toFixed(0);
  const precioG = Number(producto.precio_grande).toFixed(0);
  return responder(
    h,
    `El ${producto.nombre} viene en chico a ${precioC} pesos o grande a ${precioG}. ¿Cuál prefieres?`,
    buildMultipleChoice(`¿Qué tamaño de ${producto.nombre} prefieres?`, [
      { letra: 'A', texto: `Chico · $${precioC} MXN`, valor: 'chico' },
      { letra: 'B', texto: `Grande · $${precioG} MXN`, valor: 'grande' },
    ]),
    'tamanoToken'
  );
}

async function manejarEleccionTamano(h, tamano) {
  const attrs = h.attributesManager.getSessionAttributes();
  const pending = attrs.pendingCarrito;

  // Sin flujo pendiente pero con producto activo en la conversación
  // (ej. la IA preguntó "¿chico o grande?" hablando del Chocoflan):
  // tomamos el tamaño como "agrégame ese en <tamaño>".
  const pa = attrs.productoActivo;
  if ((!pending || !pending.producto_id) && pa && pa.id) {
    const token = obtenerToken(h);
    if (!token) {
      return responderVincular(h, 'Para agregarlo al carrito primero vincula tu cuenta: genera un código en tu perfil de la web de Pier y dime, vincula mi cuenta con el código.');
    }
    return ejecutarAgregadoCarrito(h, token, {
      id: pa.id,
      nombre: pa.nombre,
      precio_chico: pa.precio_chico,
      precio_grande: pa.precio_grande,
    }, tamano);
  }

  if (!pending || !pending.producto_id) {
    return responder(h, '¿Te refieres al tamaño? Primero dime qué producto quieres agregar al carrito.');
  }

  const token = obtenerToken(h);
  if (!token) {
    delete attrs.pendingCarrito;
    h.attributesManager.setSessionAttributes(attrs);
    await limpiarVinculacion(h);
      return responderVincular(h, 'Tu sesión expiró. Genera un código nuevo en tu perfil de la web y dime: vincula mi cuenta con el código.');
  }

  const producto = {
    id: pending.producto_id,
    nombre: pending.producto_nombre,
    precio_chico: pending.precio_chico,
    precio_grande: pending.precio_grande,
  };
  return ejecutarAgregadoCarrito(h, token, producto, tamano, pending.cantidad || 1);
}

// Flujo compartido con los eventos táctiles (botón "Agregar al pedido")
async function iniciarAgregadoProducto(h, producto) {
  const token = obtenerToken(h);
  if (!token) {
    return responderVincular(h, 'Para agregar al carrito primero vincula tu cuenta: genera un código en tu perfil de la web de Pier y dime, vincula mi cuenta con el código. Si eres empleado, identifícate con tu código y pin.');
  }
  const tieneDos = producto.precio_grande && Number(producto.precio_grande) !== Number(producto.precio_chico);
  if (!tieneDos) {
    return ejecutarAgregadoCarrito(h, token, producto, 'chico');
  }
  return preguntarTamano(h, producto);
}

const AgregarCarritoIntentHandler = {
  canHandle(h) { return esIntent(h, 'AgregarCarritoIntent'); },
  async handle(h) {
    const token = obtenerToken(h);
    if (!token) {
      return responderVincular(h, 'Para agregar al carrito primero vincula tu cuenta: genera un código en tu perfil de la web de Pier y dime, vincula mi cuenta con el código. Si eres empleado, identifícate con tu código y pin.');
    }

    const attrs = h.attributesManager.getSessionAttributes();
    const productoSlot = Alexa.getSlotValue(h.requestEnvelope, 'producto') || '';
    // Catálogo COMPLETO: se puede agregar cualquier producto, no solo el top-10
    const catalogo = await obtenerCatalogoCompleto().catch(() => []);

    const producto = resolverProductoDesdePregunta(productoSlot, attrs, catalogo);
    if (!producto || !producto.id) {
      return responder(h, '¿Cuál producto quieres agregar al carrito? Dime el nombre o pregunta primero por nuestros postres.');
    }

    // Cantidad dicha en la frase ("2 chocoflanes"). Se quita primero el
    // nombre del producto para no confundir con nombres tipo "Tres Leches".
    const cantidad = cantidadDesdeTexto(
      normalizar(productoSlot).replace(normalizar(producto.nombre), ' ')
    );

    // ¿El usuario ya dijo el tamaño en la frase? (ej. "agrega chocoflan grande")
    const tamanoDicho = detectarTamanoEnTexto(productoSlot);
    const tieneDos = producto.precio_grande && Number(producto.precio_grande) !== Number(producto.precio_chico);

    if (tamanoDicho) {
      return ejecutarAgregadoCarrito(h, token, producto, tamanoDicho, cantidad);
    }
    if (!tieneDos) {
      return ejecutarAgregadoCarrito(h, token, producto, 'chico', cantidad);
    }
    return preguntarTamano(h, producto, cantidad);
  },
};

const TamanoChicoIntentHandler = {
  canHandle(h) { return esIntent(h, 'TamanoChicoIntent'); },
  handle(h) { return manejarEleccionTamano(h, 'chico'); },
};

const TamanoGrandeIntentHandler = {
  canHandle(h) { return esIntent(h, 'TamanoGrandeIntent'); },
  handle(h) { return manejarEleccionTamano(h, 'grande'); },
};

const ConsultarCarritoIntentHandler = {
  canHandle(h) { return esIntent(h, 'ConsultarCarritoIntent'); },
  async handle(h) {
    const token = obtenerToken(h);
    if (!token) {
      return responderVincular(h, 'Para ver tu carrito primero vincula tu cuenta: genera un código en tu perfil de la web de Pier y dime, vincula mi cuenta con el código.');
    }
    try {
      const data = await fetchPierAuth('/api/carrito', token);
      // El backend devuelve: { success, carrito: { items, total, total_items } }
      const carritoData = data.carrito || data;
      const items = carritoData.items || [];
      if (items.length === 0) {
        return responder(h, 'Tu carrito está vacío. ¿Quieres que te recomiende algo?');
      }
      const resumen = items.slice(0, 5).map(i => `${i.cantidad || 1} ${i.nombre || 'producto'} ${i.tamano || ''}`.trim()).join(', ');
      const total = carritoData.total || items.reduce((s, i) => s + (Number(i.subtotal) || 0), 0);
      const numItems = items.length;
      const instruccion = `El usuario pidió ver su carrito. ESTOS SON LOS DATOS ACTUALES Y REALES (ignora respuestas previas del historial si no coinciden):
- Tiene ${numItems} ${numItems === 1 ? 'producto' : 'productos'} distintos
- Items: ${resumen}
- Total: ${Number(total).toFixed(0)} pesos
Resúmele de forma natural mencionando TODOS los productos y el total exacto. 2 oraciones. Invítalo a confirmar el pedido en la web.`;
      const respuesta = await responderConIA(h, instruccion, 'qué tengo en mi carrito');
      const itemsApl = items.slice(0, 6).map(i => ({
        primario: i.nombre || 'Producto',
        secundario: `Cantidad: ${i.cantidad || 1} (${i.tamano || 'chico'})`,
        terciario: '$' + Number(i.subtotal || i.precio_chico || 0).toFixed(0),
        imagen: i.imagen_url || '',
      }));
      return responder(
        h,
        respuesta,
        buildImageList('Mi carrito · Total $' + Number(total || 0).toFixed(0), itemsApl, 'Confirma tu pedido en la web'),
        'miCarritoToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') {
        await limpiarVinculacion(h);
      return responderVincular(h, 'Tu sesión expiró. Genera un código nuevo en tu perfil de la web y dime: vincula mi cuenta con el código.');
      }
      console.error('ConsultarCarrito error:', e);
      return responder(h, 'No pude consultar tu carrito en este momento.');
    }
  },
};

// Acción destructiva: se ejecuta SOLO después de confirmar con "sí"
async function ejecutarVaciado(h) {
  const token = obtenerToken(h);
  if (!token) {
    return responderVincular(h, 'Tu sesión expiró. Genera un código nuevo en tu perfil de la web y dime: vincula mi cuenta con el código.');
  }
  try {
    await fetchPierAuth('/api/carrito', token, { method: 'DELETE' });
    return responder(h, 'Listo, tu carrito quedó vacío. ¿Empezamos uno nuevo?');
  } catch (e) {
    if (String(e.message) === 'token_invalido') {
      await limpiarVinculacion(h);
      return responderVincular(h, 'Tu sesión expiró. Genera un código nuevo en tu perfil de la web y dime: vincula mi cuenta con el código.');
    }
    console.error('ejecutarVaciado error:', e);
    return responder(h, 'No pude vaciar el carrito en este momento.');
  }
}

const VaciarCarritoIntentHandler = {
  canHandle(h) { return esIntent(h, 'VaciarCarritoIntent'); },
  handle(h) {
    const token = obtenerToken(h);
    if (!token) {
      return responderVincular(h, 'Para vaciar tu carrito primero vincula tu cuenta: genera un código en tu perfil de la web de Pier y dime, vincula mi cuenta con el código.');
    }
    // Confirmación antes de una acción destructiva
    const attrs = h.attributesManager.getSessionAttributes();
    attrs.confirmandoVaciar = true;
    h.attributesManager.setSessionAttributes(attrs);
    return responder(h, '¿Seguro que quieres vaciar tu carrito? Se quitarán todos los productos. Dime sí para vaciarlo o no para dejarlo como está.');
  },
};

// =====================================================================
// CONFIRMAR PEDIDO POR VOZ (checkout con pago al recoger en tienda)
// Flujo: resumen del carrito -> "¿lo confirmo?" -> sí -> POST /api/pedidos
// =====================================================================
const ConfirmarPedidoIntentHandler = {
  canHandle(h) { return esIntent(h, 'ConfirmarPedidoIntent'); },
  async handle(h) {
    const token = obtenerToken(h);
    if (!token) {
      return responderVincular(h, 'Para hacer tu pedido primero vincula tu cuenta: genera un código en tu perfil de la web de Pier y dime, vincula mi cuenta con el código.');
    }
    try {
      const data = await fetchPierAuth('/api/carrito', token);
      const carritoData = data.carrito || data;
      const items = carritoData.items || [];
      if (items.length === 0) {
        return responder(h, 'Tu carrito está vacío, no hay nada que pedir todavía. ¿Te recomiendo algo para empezar?');
      }
      const resumen = items.slice(0, 6).map(i => `${i.cantidad || 1} ${i.nombre}${i.tamano ? ' ' + i.tamano : ''}`).join(', ');
      const total = Number(carritoData.total || items.reduce((s, i) => s + (Number(i.subtotal) || 0), 0)).toFixed(0);

      const attrs = h.attributesManager.getSessionAttributes();
      attrs.confirmandoPedido = true;
      h.attributesManager.setSessionAttributes(attrs);

      const itemsApl = items.slice(0, 6).map(i => ({
        primario: i.nombre || 'Producto',
        secundario: `Cantidad: ${i.cantidad || 1} (${i.tamano || 'chico'})`,
        terciario: '$' + Number(i.subtotal || 0).toFixed(0),
        imagen: i.imagen_url || '',
      }));
      return responder(
        h,
        `Tu pedido sería: ${resumen}, total ${total} pesos, para recoger en tienda y pagar ahí mismo. ¿Lo confirmo?`,
        buildImageList(`Confirmar pedido · Total $${total}`, itemsApl, 'Di "sí" para confirmar o "no" para cancelar'),
        'confirmarPedidoToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') {
        await limpiarVinculacion(h);
        return responderVincular(h, 'Tu sesión expiró. Genera un código nuevo en tu perfil de la web y dime: vincula mi cuenta con el código.');
      }
      console.error('ConfirmarPedido error:', e);
      return responder(h, 'No pude revisar tu carrito en este momento. Intenta de nuevo en un momento.');
    }
  },
};

// Se ejecuta cuando el usuario dice "sí" a la confirmación del pedido
async function ejecutarCrearPedido(h) {
  const token = obtenerToken(h);
  if (!token) {
    return responderVincular(h, 'Tu sesión expiró. Genera un código nuevo en tu perfil de la web y dime: vincula mi cuenta con el código.');
  }
  try {
    const data = await fetchPierAuth('/api/pedidos', token, {
      method: 'POST',
      timeout: 6500,
      body: JSON.stringify({
        metodo_pago: 'efectivo',
        notas: 'Pedido realizado por voz con Alexa',
      }),
    });
    if (data.success && data.pedido) {
      const numero = data.pedido.numero || `#${data.pedido.id}`;
      const total = Number(data.pedido.total || 0).toFixed(0);
      return responder(
        h,
        `¡Pedido confirmado! Tu número es ${numero}, total ${total} pesos. Te avisamos cuando esté listo para recoger, y pagas ahí en tienda. ¡Gracias!`,
        buildHeadline({
          subtituloHeader: 'Pedido confirmado',
          primario: numero,
          secundario: `Total $${total} MXN · Pagas al recoger en tienda`,
          hint: 'Te llegará una notificación cuando esté listo',
        }),
        'pedidoCreadoToken'
      );
    }
    return responder(h, data.message || 'No pude crear el pedido en este momento.');
  } catch (e) {
    if (String(e.message) === 'token_invalido') {
      await limpiarVinculacion(h);
      return responderVincular(h, 'Tu sesión expiró. Genera un código nuevo en tu perfil de la web y dime: vincula mi cuenta con el código.');
    }
    console.error('ejecutarCrearPedido error:', e);
    return responder(h, 'No pude crear el pedido en este momento. Tu carrito sigue intacto, intenta en un momento.');
  }
}

// =====================================================================
// QUITAR UN PRODUCTO DEL CARRITO («quita el chocoflán del carrito»)
// Resuelve el item por nombre contra el carrito real y borra esa fila.
// =====================================================================
const QuitarCarritoIntentHandler = {
  canHandle(h) { return esIntent(h, 'QuitarCarritoIntent'); },
  async handle(h) {
    const token = obtenerToken(h);
    if (!token) {
      return responderVincular(h, 'Para modificar tu carrito primero vincula tu cuenta: genera un código en tu perfil de la web de Pier y dime, vincula mi cuenta con el código.');
    }
    const dicho = normalizar(Alexa.getSlotValue(h.requestEnvelope, 'producto') || '');
    if (!dicho) {
      return responder(h, '¿Cuál producto quieres quitar del carrito?');
    }
    try {
      const data = await fetchPierAuth('/api/carrito', token);
      const items = (data.carrito || data).items || [];
      if (items.length === 0) {
        return responder(h, 'Tu carrito ya está vacío, no hay nada que quitar.');
      }
      // Match por nombre (sin acentos); si dijo tamaño, afina entre chico/grande
      let candidatos = items.filter(i => i.nombre && (dicho.includes(normalizar(i.nombre)) || normalizar(i.nombre).includes(dicho.replace(/\b(el|la|los|las|un|una|mi)\b/g, '').trim())));
      const tamanoDicho = detectarTamanoEnTexto(dicho);
      if (candidatos.length > 1 && tamanoDicho) {
        candidatos = candidatos.filter(i => (i.tamano || 'chico') === tamanoDicho);
      }
      if (candidatos.length === 0) {
        const nombres = items.slice(0, 4).map(i => i.nombre).join(', ');
        return responder(h, `No encontré eso en tu carrito. Ahorita llevas: ${nombres}. ¿Cuál quito?`);
      }
      if (candidatos.length > 1) {
        return responder(h, `Tienes ${candidatos[0].nombre} en chico y en grande. ¿Cuál de los dos quito? Dime, por ejemplo, quita el ${candidatos[0].nombre} grande.`);
      }
      const item = candidatos[0];
      const itemId = item.carrito_item_id || item.id;
      await fetchPierAuth(`/api/carrito/${itemId}`, token, { method: 'DELETE' });
      return responder(
        h,
        `Listo, quité ${item.nombre}${item.tamano ? ' ' + item.tamano : ''} de tu carrito. ¿Algo más?`,
        buildHeadline({
          subtituloHeader: 'Quitado del carrito',
          primario: item.nombre,
          secundario: 'Tu carrito quedó actualizado',
          hint: 'Pregunta "qué tengo en mi carrito" para verlo',
        }),
        'quitarCarritoToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') {
        await limpiarVinculacion(h);
        return responderVincular(h, 'Tu sesión expiró. Genera un código nuevo en tu perfil de la web y dime: vincula mi cuenta con el código.');
      }
      console.error('QuitarCarrito error:', e);
      return responder(h, 'No pude modificar tu carrito en este momento.');
    }
  },
};

// =====================================================================
// PEDIR LO DE SIEMPRE (historial de compras completadas)
// =====================================================================
const PedirDeNuevoIntentHandler = {
  canHandle(h) { return esIntent(h, 'PedirDeNuevoIntent'); },
  async handle(h) {
    const token = obtenerToken(h);
    if (!token) {
      return responderVincular(h, 'Para ver tus compras anteriores primero vincula tu cuenta: genera un código en tu perfil de la web de Pier y dime, vincula mi cuenta con el código.');
    }
    try {
      const data = await fetchPierAuth('/api/pedidos/productos-comprados', token);
      const productos = data.productos || [];
      if (productos.length === 0) {
        return responder(h, 'Aún no tienes compras completadas para repetir. ¿Te recomiendo algo del catálogo para estrenar?');
      }
      const attrs = h.attributesManager.getSessionAttributes();
      attrs.productosListados = productos.map(p => ({
        id: p.id, nombre: p.nombre, precio_chico: p.precio_chico,
      }));
      attrs.productoActivo = productos.length === 1
        ? { id: productos[0].id, nombre: productos[0].nombre, precio_chico: productos[0].precio_chico, precio_grande: productos[0].precio_grande }
        : null;
      h.attributesManager.setSessionAttributes(attrs);

      const nombres = productos.slice(0, 3).map(p => p.nombre).join(', ');
      const items = productos.map(p => ({
        primario: p.nombre,
        secundario: '$' + Number(p.precio_chico || p.precio_unitario || 0).toFixed(0) + ' MXN',
        terciario: 'Lo has pedido antes',
        imagen: p.imagen_url || '',
        id: p.id,
      }));
      const habla = productos.length === 1
        ? `La última vez pediste ${nombres}. ¿Te lo agrego al carrito?`
        : `Lo que más has pedido: ${nombres}. ¿Cuál te agrego al carrito?`;
      return responder(h, habla, buildImageList('Tus compras anteriores', items, 'Toca uno para agregarlo de nuevo'), 'pedirDeNuevoToken');
    } catch (e) {
      if (String(e.message) === 'token_invalido') {
        await limpiarVinculacion(h);
        return responderVincular(h, 'Tu sesión expiró. Genera un código nuevo en tu perfil de la web y dime: vincula mi cuenta con el código.');
      }
      console.error('PedirDeNuevo error:', e);
      return responder(h, 'No pude consultar tus compras anteriores en este momento.');
    }
  },
};

module.exports = {
  AgregarCarritoIntentHandler,
  TamanoChicoIntentHandler,
  TamanoGrandeIntentHandler,
  ConsultarCarritoIntentHandler,
  VaciarCarritoIntentHandler,
  ConfirmarPedidoIntentHandler,
  QuitarCarritoIntentHandler,
  PedirDeNuevoIntentHandler,
  manejarEleccionTamano,
  iniciarAgregadoProducto,
  ejecutarVaciado,
  ejecutarCrearPedido,
  resolverProductoDesdePregunta,
};
