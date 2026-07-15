// =====================================================================
// HANDLERS DE CUENTA - Login/logout empleado, pedidos, favoritos,
// perfil y reseñas (requieren token)
// =====================================================================
const Alexa = require('ask-sdk-core');
const fetch = require('node-fetch');
const { obtenerConfig } = require('../lib/config');
const { fetchPierAuth, obtenerCatalogoCompleto } = require('../lib/api');
const { obtenerToken, limpiarVinculacion, ROLES_PERSONAL } = require('../lib/auth');
const { comandosPersonal, rolLegible } = require('../lib/personal');
const { normalizar, mejorProductoPorNombre } = require('../lib/texto');
const { responderConIA } = require('../lib/ia');
const { responder, responderVincular } = require('../lib/respuesta');
const { buildHeadline, buildImageList, buildPanelComandos } = require('../lib/apl');

function esIntent(h, nombre) {
  return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === nombre;
}

async function sesionExpirada(h) {
  await limpiarVinculacion(h);
  return responderVincular(h, 'Tu sesión expiró. Genera un código nuevo en tu perfil de la web y dime: vincula mi cuenta con el código. También te dejé una tarjeta en la app de Alexa.');
}

// =====================================================================
// Vinculación por código de un solo uso (generado en el perfil web)
// «vincula mi cuenta con el código 483920»
// =====================================================================
const VincularCuentaIntentHandler = {
  canHandle(h) { return esIntent(h, 'VincularCuentaIntent'); },
  async handle(h) {
    const codigo = Alexa.getSlotValue(h.requestEnvelope, 'codigo');
    if (!codigo) {
      return responder(h, 'No alcancé a escuchar el código. Genera uno en tu perfil de la web de Pier y dime: vincula mi cuenta con el código, seguido de los seis dígitos.');
    }

    const deviceId = h.requestEnvelope.context?.System?.device?.deviceId || 'unknown-device';

    try {
      const { PIER_API_URL } = await obtenerConfig();
      const res = await fetch(`${PIER_API_URL.replace(/\/$/, '')}/api/auth/alexa/canjear-codigo`, {
        method: 'POST',
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: String(codigo), device_id: deviceId }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const usuario = {
          id: data.user.id,
          nombre: data.user.nombre,
          apellido: data.user.apellido,
          rol: data.user.rol,
        };
        const attrs = h.attributesManager.getSessionAttributes();
        attrs.tokenCliente = data.token;
        attrs.usuarioAutenticado = usuario;
        h.attributesManager.setSessionAttributes(attrs);
        try {
          h.attributesManager.setPersistentAttributes({
            tokenCliente: data.token,
            usuarioVinculado: usuario,
            vinculadoEn: new Date().toISOString(),
          });
          await h.attributesManager.savePersistentAttributes();
        } catch (e) {
          console.error('No se pudo persistir la vinculación:', e.message);
        }
        // Al personal se le recibe como equipo, con su panel de comandos;
        // al cliente, con las funciones de su cuenta
        if (ROLES_PERSONAL.includes(usuario.rol)) {
          return responder(
            h,
            `¡Listo, ${usuario.nombre}! Quedaste vinculado como ${rolLegible(usuario.rol)}. Pregúntame cómo van los pedidos, las ventas de hoy o el inventario. ¿Por dónde empezamos?`,
            buildPanelComandos(`Panel de voz · ${usuario.nombre}`, comandosPersonal(usuario.rol), 'Di "ayuda" para escuchar todo lo que puedo hacer'),
            'vinculadoToken'
          );
        }
        return responder(h, `¡Listo, ${usuario.nombre}! Tu cuenta quedó vinculada en esta Alexa. Ya puedes pedirme tu carrito, tus pedidos o tus favoritos. ¿En qué te ayudo?`);
      }

      if (data.codigo === 'rate_limit') {
        return responder(h, 'Demasiados intentos desde este dispositivo. Espera unos minutos e intenta de nuevo.');
      }
      return responder(h, 'Ese código no es válido o ya expiró. Genera uno nuevo en tu perfil de la web y repítemelo, tienes cinco minutos para usarlo.');
    } catch (e) {
      console.error('Error vincular cuenta:', e);
      return responder(h, 'Tuve un problema de conexión al vincular tu cuenta. ¿Me repites el código?');
    }
  },
};

const LoginEmpleadoIntentHandler = {
  canHandle(h) { return esIntent(h, 'LoginEmpleadoIntent'); },
  async handle(h) {
    const numero = Alexa.getSlotValue(h.requestEnvelope, 'numero_empleado');
    const pin = Alexa.getSlotValue(h.requestEnvelope, 'pin');

    if (!numero || !pin) {
      return responder(h, 'No alcancé a entender el código o el pin. ¿Me los repites?');
    }

    const attrs = h.attributesManager.getSessionAttributes();
    attrs.intentosLogin = (attrs.intentosLogin || 0) + 1;

    if (attrs.intentosLogin > 3) {
      h.attributesManager.setSessionAttributes(attrs);
      return responder(h, 'Demasiados intentos. Por seguridad cierra esta sesión y vuelve a abrir la skill.');
    }

    const deviceId = h.requestEnvelope.context?.System?.device?.deviceId || 'unknown-device';

    try {
      const { PIER_API_URL } = await obtenerConfig();
      const url = `${PIER_API_URL.replace(/\/$/, '')}/api/auth/login-empleado`;
      const res = await fetch(url, {
        method: 'POST',
        timeout: 5000,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo_empleado: parseInt(numero),
          pin: String(pin),
          device_id: deviceId,
        }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        attrs.tokenEmpleado = data.token;
        attrs.usuarioAutenticado = {
          id: data.user.id,
          nombre: data.user.nombre,
          rol: data.user.rol,
          codigo_empleado: data.user.codigo_empleado,
        };
        attrs.intentosLogin = 0;
        h.attributesManager.setSessionAttributes(attrs);
        if (ROLES_PERSONAL.includes(data.user.rol)) {
          return responder(
            h,
            `Hola ${data.user.nombre}, ya estás dentro como ${rolLegible(data.user.rol)}. Pregúntame cómo van los pedidos, las ventas de hoy o el inventario.`,
            buildPanelComandos(`Panel de voz · ${data.user.nombre}`, comandosPersonal(data.user.rol), 'Di "ayuda" para escuchar todo lo que puedo hacer'),
            'loginToken'
          );
        }
        return responder(h, `Hola ${data.user.nombre}, bienvenido. ¿En qué te ayudo?`);
      }

      // Respuesta genérica para no dar pistas sobre qué falló
      h.attributesManager.setSessionAttributes(attrs);
      if (data.codigo === 'rate_limit') {
        return responder(h, 'Demasiados intentos. Intenta de nuevo en unos minutos.');
      }
      if (data.codigo === 'cuenta_bloqueada') {
        return responder(h, 'Esa cuenta está temporalmente bloqueada. Intenta más tarde.');
      }
      return responder(h, 'No pude validar tus credenciales. ¿Me las repites?');
    } catch (e) {
      console.error('Error login empleado:', e);
      return responder(h, 'Tuve un problema de conexión. ¿Me las repites?');
    }
  },
};

const LogoutEmpleadoIntentHandler = {
  canHandle(h) { return esIntent(h, 'LogoutEmpleadoIntent'); },
  async handle(h) {
    const attrs = h.attributesManager.getSessionAttributes();
    const token = attrs.tokenEmpleado || attrs.tokenCliente;
    const tenia = !!(token || attrs.usuarioAutenticado);

    // Revocación real: el backend mete el token a su blacklist
    if (token) {
      try {
        const { PIER_API_URL } = await obtenerConfig();
        await fetch(`${PIER_API_URL.replace(/\/$/, '')}/api/auth/logout`, {
          method: 'POST',
          timeout: 4000,
          headers: { 'Authorization': `Bearer ${token}` },
        });
      } catch (e) {
        console.error('No se pudo revocar el token en el backend:', e.message);
      }
    }

    await limpiarVinculacion(h);
    return responder(h, tenia
      ? 'Listo, cerré tu sesión y desvinculé tu cuenta de esta Alexa. ¡Hasta luego!'
      : 'No tenías ninguna sesión activa. ¿En qué te ayudo?');
  },
};

const MisPedidosIntentHandler = {
  canHandle(h) { return esIntent(h, 'MisPedidosIntent'); },
  async handle(h) {
    const token = obtenerToken(h);
    if (!token) {
      return responderVincular(h, 'Para ver tus pedidos primero vincula tu cuenta: genera un código en tu perfil de la web de Pier y dime, vincula mi cuenta con el código. Si eres empleado, identifícate con tu código y pin.');
    }
    try {
      const data = await fetchPierAuth('/api/pedidos/mis-pedidos', token);
      const pedidos = data.pedidos || [];
      if (pedidos.length === 0) {
        return responder(h, 'Aún no tienes pedidos registrados con nosotros. ¡Te esperamos pronto!');
      }
      const ultimos = pedidos.slice(0, 5).map(p =>
        `pedido número ${p.numero || p.id}, estado ${p.estado || 'pendiente'}, total ${p.total || '0'} pesos`
      ).join('; ');
      const instruccion = `El usuario pidió ver sus pedidos. Resúmele de forma natural sus últimos pedidos. Datos: ${ultimos}.${pedidos.length > 5 ? ` Tiene ${pedidos.length} pedidos en total: cierra ofreciendo escuchar los demás.` : ''} Máximo 3 oraciones.`;
      const respuesta = await responderConIA(h, instruccion, 'cuáles son mis pedidos');
      // Lectura por partes de los pedidos restantes ("sí"/"continúa" sigue)
      if (pedidos.length > 5) {
        const attrs = h.attributesManager.getSessionAttributes();
        attrs.paginacion = {
          tipo: 'lista',
          titulo: 'Mis pedidos',
          offset: 0,
          items: pedidos.slice(5, 25).map(p => ({
            habla: `pedido ${p.numero || p.id}, ${p.estado || 'pendiente'}, ${Number(p.total || 0).toFixed(0)} pesos`,
            primario: `Pedido ${p.numero || '#' + p.id}`,
            secundario: `${p.created_at ? new Date(p.created_at).toLocaleDateString('es-MX') : ''} · ${p.estado || 'pendiente'}`,
            terciario: '$' + Number(p.total || 0).toFixed(0),
          })),
        };
        h.attributesManager.setSessionAttributes(attrs);
      }
      const items = pedidos.slice(0, 6).map(p => ({
        primario: `Pedido ${p.numero || '#' + p.id}`,
        secundario: `${p.created_at ? new Date(p.created_at).toLocaleDateString('es-MX') : ''} · ${p.estado || 'pendiente'}`,
        terciario: '$' + Number(p.total || 0).toFixed(0),
      }));
      return responder(
        h,
        respuesta,
        buildImageList('Mis pedidos', items, 'Detalle completo en la web'),
        'misPedidosToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') return sesionExpirada(h);
      console.error('MisPedidos error:', e);
      return responder(h, 'No pude consultar tus pedidos en este momento. Intenta en un rato.');
    }
  },
};

const EstadoUltimoPedidoIntentHandler = {
  canHandle(h) { return esIntent(h, 'EstadoUltimoPedidoIntent'); },
  async handle(h) {
    const token = obtenerToken(h);
    if (!token) {
      return responderVincular(h, 'Para ver el estado de tu pedido primero vincula tu cuenta: genera un código en tu perfil de la web de Pier y dime, vincula mi cuenta con el código.');
    }
    try {
      const data = await fetchPierAuth('/api/pedidos/mis-pedidos', token);
      const pedidos = data.pedidos || [];
      if (pedidos.length === 0) {
        return responder(h, 'No tienes pedidos recientes. ¿Quieres ver el catálogo?');
      }
      const ultimo = pedidos[0];
      const instruccion = `El usuario pregunta por su último pedido. Datos: número ${ultimo.numero || ultimo.id}, estado ${ultimo.estado || 'pendiente'}, total ${ultimo.total || '0'}, fecha ${ultimo.created_at || 'reciente'}. Resúmele en 2 oraciones naturales.`;
      const respuesta = await responderConIA(h, instruccion, 'cómo va mi último pedido');
      return responder(
        h,
        respuesta,
        buildHeadline({
          subtituloHeader: `Pedido ${ultimo.numero || '#' + ultimo.id}`,
          primario: `Estado: ${ultimo.estado || 'pendiente'}`,
          secundario: `Total: $${Number(ultimo.total || 0).toFixed(0)} MXN`,
          hint: ultimo.created_at ? new Date(ultimo.created_at).toLocaleDateString('es-MX') : '',
        }),
        'ultimoPedidoToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') return sesionExpirada(h);
      console.error('UltimoPedido error:', e);
      return responder(h, 'No pude consultar tu pedido en este momento.');
    }
  },
};

const MisFavoritosIntentHandler = {
  canHandle(h) { return esIntent(h, 'MisFavoritosIntent'); },
  async handle(h) {
    const token = obtenerToken(h);
    if (!token) {
      return responderVincular(h, 'Para ver tus favoritos primero vincula tu cuenta: genera un código en tu perfil de la web de Pier y dime, vincula mi cuenta con el código.');
    }
    try {
      const data = await fetchPierAuth('/api/favoritos', token);
      const favoritos = data.favoritos || data.productos || [];
      if (favoritos.length === 0) {
        return responder(h, 'Aún no tienes favoritos guardados. Agrega los que más te gusten desde la web para que los tengas a la mano.');
      }
      const nombres = favoritos.slice(0, 5).map(f => f.nombre).filter(Boolean).join(', ');
      const instruccion = `El usuario pidió sus favoritos. Tus favoritos: ${nombres}. Menciónalos de forma natural en 2 oraciones.`;
      const respuesta = await responderConIA(h, instruccion, 'cuáles son mis favoritos');
      const items = favoritos.slice(0, 6).map(f => ({
        primario: f.nombre || 'Producto',
        secundario: '$' + Number(f.precio_chico || 0).toFixed(0) + ' MXN',
        terciario: f.categoria || 'Favorito',
        imagen: f.imagen_url || '',
        id: f.producto_id || f.id,
      }));
      return responder(
        h,
        respuesta,
        buildImageList('Mis favoritos', items, 'Toca uno para ver su detalle'),
        'misFavoritosToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') return sesionExpirada(h);
      console.error('MisFavoritos error:', e);
      return responder(h, 'No pude consultar tus favoritos en este momento.');
    }
  },
};

const MiPerfilIntentHandler = {
  canHandle(h) { return esIntent(h, 'MiPerfilIntent'); },
  async handle(h) {
    const token = obtenerToken(h);
    if (!token) {
      return responderVincular(h, 'No tengo acceso a tu cuenta. Genera un código en tu perfil de la web de Pier y dime, vincula mi cuenta con el código. Si eres empleado, identifícate con tu código y pin.');
    }
    try {
      const data = await fetchPierAuth('/api/auth/profile', token);
      const u = data.user || data.usuario;
      if (!u) {
        return responder(h, 'No pude obtener tu perfil.');
      }
      const nombreCompleto = `${u.nombre || ''} ${u.apellido || ''}`.trim();
      const rolTxt = u.rol === 'cliente' ? 'cliente' :
        u.rol === 'empleado' ? 'empleado' :
          u.rol === 'gerencia' ? 'gerencia' :
            u.rol === 'direccion_general' ? 'dirección general' : u.rol;
      return responder(
        h,
        `Te llamas ${nombreCompleto}, tu correo es ${u.email || 'el registrado'}, y tu rol es ${rolTxt}.`,
        buildHeadline({
          subtituloHeader: 'Tu perfil',
          primario: nombreCompleto || 'Tu perfil',
          secundario: `${u.email || ''} · Rol: ${rolTxt}`,
          hint: 'Di "cierra sesión" para desvincular esta Alexa',
        }),
        'miPerfilToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') return sesionExpirada(h);
      console.error('MiPerfil error:', e);
      return responder(h, 'No pude consultar tu perfil en este momento.');
    }
  },
};

const MisResenasIntentHandler = {
  canHandle(h) { return esIntent(h, 'MisResenasIntent'); },
  async handle(h) {
    const token = obtenerToken(h);
    if (!token) {
      return responderVincular(h, 'Para ver tus reseñas primero vincula tu cuenta: genera un código en tu perfil de la web de Pier y dime, vincula mi cuenta con el código.');
    }
    try {
      const data = await fetchPierAuth('/api/resenas/mis-resenas', token);
      const resenas = data.resenas || [];
      if (resenas.length === 0) {
        return responder(h, 'Aún no has dejado reseñas. Cuando recibas un pedido puedes dejarnos una desde la web.');
      }
      const resumen = resenas.slice(0, 3).map(r =>
        `${r.rating || 5} estrellas en ${r.producto_nombre || 'un producto'}`
      ).join('; ');
      const instruccion = `El usuario pidió sus reseñas. Tus reseñas: ${resumen}. Coméntalas en 2 oraciones naturales.`;
      const respuesta = await responderConIA(h, instruccion, 'cuáles son mis reseñas');
      return responder(h, respuesta);
    } catch (e) {
      if (String(e.message) === 'token_invalido') return sesionExpirada(h);
      console.error('MisResenas error:', e);
      return responder(h, 'No pude consultar tus reseñas en este momento.');
    }
  },
};

// =====================================================================
// FAVORITOS POR VOZ: agregar y quitar
// =====================================================================
function buscarProductoPorNombre(dicho, catalogo) {
  return mejorProductoPorNombre(dicho, catalogo);
}

const AgregarFavoritoIntentHandler = {
  canHandle(h) { return esIntent(h, 'AgregarFavoritoIntent'); },
  async handle(h) {
    const token = obtenerToken(h);
    if (!token) {
      return responderVincular(h, 'Para guardar favoritos primero vincula tu cuenta: genera un código en tu perfil de la web de Pier y dime, vincula mi cuenta con el código.');
    }
    const dicho = Alexa.getSlotValue(h.requestEnvelope, 'producto') || '';
    try {
      const catalogo = await obtenerCatalogoCompleto();
      const attrs = h.attributesManager.getSessionAttributes();
      const producto = buscarProductoPorNombre(dicho, catalogo)
        || (attrs.productoActivo && catalogo.find(p => p.id === attrs.productoActivo.id));
      if (!producto) {
        return responder(h, `No encontré "${dicho}" en nuestro catálogo. ¿Cuál producto quieres guardar en favoritos?`);
      }
      const data = await fetchPierAuth(`/api/favoritos/${producto.id}`, token, { method: 'POST' });
      const yaEstaba = /ya está/i.test(data.message || '');
      return responder(
        h,
        yaEstaba
          ? `El ${producto.nombre} ya estaba en tus favoritos. ¡Buen gusto!`
          : `Listo, guardé el ${producto.nombre} en tus favoritos. Así lo encuentras rapidito la próxima vez.`,
        buildHeadline({
          subtituloHeader: 'Favoritos',
          primario: producto.nombre,
          secundario: yaEstaba ? 'Ya estaba en tus favoritos' : 'Agregado a tus favoritos ♥',
          hint: 'Di "mis favoritos" para escucharlos',
        }),
        'favoritoToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') return sesionExpirada(h);
      console.error('AgregarFavorito error:', e);
      return responder(h, 'No pude guardar el favorito en este momento.');
    }
  },
};

const QuitarFavoritoIntentHandler = {
  canHandle(h) { return esIntent(h, 'QuitarFavoritoIntent'); },
  async handle(h) {
    const token = obtenerToken(h);
    if (!token) {
      return responderVincular(h, 'Para modificar tus favoritos primero vincula tu cuenta: genera un código en tu perfil de la web de Pier y dime, vincula mi cuenta con el código.');
    }
    const dicho = Alexa.getSlotValue(h.requestEnvelope, 'producto') || '';
    try {
      const data = await fetchPierAuth('/api/favoritos', token);
      const favoritos = data.favoritos || [];
      if (favoritos.length === 0) {
        return responder(h, 'No tienes favoritos guardados todavía.');
      }
      const producto = buscarProductoPorNombre(dicho, favoritos);
      if (!producto) {
        const nombres = favoritos.slice(0, 4).map(f => f.nombre).join(', ');
        return responder(h, `Ese no está en tus favoritos. Tienes: ${nombres}. ¿Cuál quito?`);
      }
      await fetchPierAuth(`/api/favoritos/${producto.id}`, token, { method: 'DELETE' });
      return responder(
        h,
        `Listo, quité el ${producto.nombre} de tus favoritos. ¿Algo más?`,
        buildHeadline({
          subtituloHeader: 'Favoritos',
          primario: producto.nombre,
          secundario: 'Quitado de tus favoritos',
          hint: 'Di "mis favoritos" para escuchar los que quedan',
        }),
        'favoritoToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') return sesionExpirada(h);
      console.error('QuitarFavorito error:', e);
      return responder(h, 'No pude modificar tus favoritos en este momento.');
    }
  },
};

// =====================================================================
// NOTIFICACIONES: lee las no leídas y las marca como leídas
// =====================================================================
const NotificacionesIntentHandler = {
  canHandle(h) { return esIntent(h, 'NotificacionesIntent'); },
  async handle(h) {
    const token = obtenerToken(h);
    if (!token) {
      return responderVincular(h, 'Para ver tus notificaciones primero vincula tu cuenta: genera un código en tu perfil de la web de Pier y dime, vincula mi cuenta con el código.');
    }
    try {
      const data = await fetchPierAuth('/api/notificaciones', token);
      const noLeidas = (data.notificaciones || []).filter(n => !n.leida);
      if (noLeidas.length === 0) {
        return responder(h, 'Estás al día, no tienes notificaciones nuevas. ¿Te ayudo con otra cosa?');
      }
      const top = noLeidas.slice(0, 3);
      const habla = top.map(n => `${n.titulo}: ${n.mensaje}`).join('. ');
      const extra = noLeidas.length > 3 ? ` Y tienes ${noLeidas.length - 3} más en la web.` : '';
      // Ya leídas por voz: se marcan como leídas para no repetirlas
      fetchPierAuth('/api/notificaciones/leer-todas', token, { method: 'PUT' }).catch(() => { });
      const items = top.map(n => ({
        primario: n.titulo || 'Notificación',
        secundario: n.mensaje || '',
        terciario: n.created_at ? new Date(n.created_at).toLocaleDateString('es-MX') : '',
      }));
      return responder(
        h,
        `Tienes ${noLeidas.length} ${noLeidas.length === 1 ? 'notificación nueva' : 'notificaciones nuevas'}. ${habla}.${extra}`,
        buildImageList('Tus notificaciones', items, 'Ya quedaron marcadas como leídas'),
        'notificacionesToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') return sesionExpirada(h);
      console.error('Notificaciones error:', e);
      return responder(h, 'No pude consultar tus notificaciones en este momento.');
    }
  },
};

// =====================================================================
// PEDIDOS DEL NEGOCIO (solo empleado/gerencia/dirección)
// «cuántos pedidos pendientes hay» / «cómo van los pedidos»
// =====================================================================
const ESTADOS_VOZ = {
  'pendientes': 'pendiente',
  'en preparación': 'en_preparacion',
  'listos': 'listo',
  'completados': 'completado',
  'cancelados': 'cancelado',
};

function estadoLegible(e) {
  return String(e || '').replace(/_/g, ' ');
}

const PedidosNegocioIntentHandler = {
  canHandle(h) { return esIntent(h, 'PedidosNegocioIntent'); },
  async handle(h) {
    const token = obtenerToken(h);
    const attrs = h.attributesManager.getSessionAttributes();
    const rol = attrs.usuarioAutenticado?.rol;
    if (!token) {
      return responderVincular(h, 'Esa consulta es del personal de Pier. Vincula tu cuenta de empleado con el código de tu panel, o identifícate con tu código y pin.');
    }
    if (rol && !['empleado', 'gerencia', 'direccion_general'].includes(rol)) {
      return responder(h, 'Esa consulta es solo para el personal de Pier. ¿Te ayudo con el catálogo o con tu pedido?');
    }
    // Resolver el estado dicho (con sinónimos del slot) a su valor en BD
    const slot = h.requestEnvelope.request.intent?.slots?.estado;
    const resuelto = slot?.resolutions?.resolutionsPerAuthority?.[0]?.values?.[0]?.value?.name
      || slot?.value || '';
    const estadoBD = ESTADOS_VOZ[normalizar(resuelto)] || ESTADOS_VOZ[resuelto] || null;

    try {
      const query = estadoBD ? `/api/pedidos?estado=${encodeURIComponent(estadoBD)}&limite=100` : '/api/pedidos?limite=100';
      const data = await fetchPierAuth(query, token);
      const pedidos = data.pedidos || [];

      if (estadoBD) {
        if (pedidos.length === 0) {
          return responder(h, `No hay pedidos ${estadoLegible(estadoBD)} en este momento. Todo al día.`);
        }
        const top = pedidos.slice(0, 3).map(p =>
          `${p.numero}, de ${p.cliente_nombre || 'cliente'}, ${Number(p.total || 0).toFixed(0)} pesos`
        ).join('; ');
        const items = pedidos.slice(0, 6).map(p => ({
          primario: p.numero || `#${p.id}`,
          secundario: `${p.cliente_nombre || ''} ${p.cliente_apellido || ''}`.trim() || 'Cliente',
          terciario: '$' + Number(p.total || 0).toFixed(0),
        }));
        return responder(
          h,
          `Hay ${pedidos.length} ${pedidos.length === 1 ? 'pedido' : 'pedidos'} ${estadoLegible(estadoBD)}${pedidos.length === 1 ? '' : 's'}. ${pedidos.length <= 3 ? top : `Los más recientes: ${top}`}. El detalle completo está en tu panel.`,
          buildImageList(`Pedidos: ${estadoLegible(estadoBD)}`, items, 'Gestiona los pedidos desde tu panel web'),
          'pedidosNegocioToken'
        );
      }

      // Sin estado: resumen general por estados (calculado aquí, como lo hace
      // la web). "en_preparacion" es un estado muerto (solo pedidos históricos
      // de antes de la regla "todo nace listo"): no se menciona.
      const conteo = {};
      pedidos.forEach(p => { conteo[p.estado] = (conteo[p.estado] || 0) + 1; });
      const ESTADOS_VIGENTES = ['pendiente', 'listo', 'completado', 'cancelado'];
      const partes = ['pendiente', 'listo', 'completado']
        .filter(e => conteo[e])
        .map(e => `${conteo[e]} ${estadoLegible(e)}`);
      if (partes.length === 0) {
        return responder(h, 'No hay pedidos registrados por ahora. Todo tranquilo.');
      }
      const items = ESTADOS_VIGENTES.filter(e => conteo[e]).map(e => ({
        primario: estadoLegible(e),
        secundario: `${conteo[e]} ${conteo[e] === 1 ? 'pedido' : 'pedidos'}`,
        terciario: '',
      }));
      return responder(
        h,
        `Así van los pedidos: ${partes.join(', ')}. ¿Quieres el detalle de algún estado?`,
        buildImageList('Pedidos del negocio', items, 'Di, por ejemplo: "qué pedidos están pendientes"'),
        'pedidosNegocioToken'
      );
    } catch (e) {
      if (String(e.message) === 'token_invalido') return sesionExpirada(h);
      if (/403/.test(String(e.message))) {
        return responder(h, 'Esa consulta es solo para el personal de Pier. ¿Te ayudo con el catálogo o con tu pedido?');
      }
      console.error('PedidosNegocio error:', e);
      return responder(h, 'No pude consultar los pedidos del negocio en este momento.');
    }
  },
};

module.exports = {
  VincularCuentaIntentHandler,
  LoginEmpleadoIntentHandler,
  LogoutEmpleadoIntentHandler,
  AgregarFavoritoIntentHandler,
  QuitarFavoritoIntentHandler,
  NotificacionesIntentHandler,
  PedidosNegocioIntentHandler,
  MisPedidosIntentHandler,
  EstadoUltimoPedidoIntentHandler,
  MisFavoritosIntentHandler,
  MiPerfilIntentHandler,
  MisResenasIntentHandler,
  ESTADOS_VOZ,
  estadoLegible,
};
