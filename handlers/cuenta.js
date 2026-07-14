// =====================================================================
// HANDLERS DE CUENTA - Login/logout empleado, pedidos, favoritos,
// perfil y reseñas (requieren token)
// =====================================================================
const Alexa = require('ask-sdk-core');
const fetch = require('node-fetch');
const { obtenerConfig } = require('../lib/config');
const { fetchPierAuth } = require('../lib/api');
const { obtenerToken, limpiarVinculacion } = require('../lib/auth');
const { responderConIA } = require('../lib/ia');
const { responder, responderVincular } = require('../lib/respuesta');
const { buildHeadline, buildImageList } = require('../lib/apl');

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

module.exports = {
  VincularCuentaIntentHandler,
  LoginEmpleadoIntentHandler,
  LogoutEmpleadoIntentHandler,
  MisPedidosIntentHandler,
  EstadoUltimoPedidoIntentHandler,
  MisFavoritosIntentHandler,
  MiPerfilIntentHandler,
  MisResenasIntentHandler,
};
