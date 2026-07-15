// =====================================================================
// PIER ASISTENTE - Alexa Skill (es-MX) - RAG conversacional
//
// Arquitectura:
//   lib/config.js    -> constantes del negocio + config remota (S3)
//   lib/horario.js   -> estado abierto/cerrado (hora de Huejutla)
//   lib/api.js       -> backend Pier (catálogo, promos, auth) + cache RAG
//   lib/auth.js      -> token de sesión (Account Linking / empleado)
//   lib/ia.js        -> system prompt + DeepSeek + memoria conversacional
//   lib/ssml.js      -> voz Mía con pausas + reprompts variados
//   lib/apl.js       -> las 6 plantillas documentadas (Echo Show)
//   lib/respuesta.js -> helper voz + APL
//   handlers/        -> intents agrupados por dominio + eventos táctiles
// =====================================================================
const Alexa = require('ask-sdk-core');
const { S3PersistenceAdapter } = require('ask-sdk-s3-persistence-adapter');

const publicos = require('./handlers/publicos');
const cuenta = require('./handlers/cuenta');
const carrito = require('./handlers/carrito');
const conversacion = require('./handlers/conversacion');
const dialogo = require('./handlers/dialogo');
const negocio = require('./handlers/negocio');
const reportes = require('./handlers/reportes');
const { AplUserEventHandler } = require('./handlers/aplEventos');

// Al inicio de cada sesión carga la vinculación persistida (código de
// la web canjeado antes) para que el cliente no tenga que loguearse
// en cada conversación.
const CargarVinculacionInterceptor = {
  async process(h) {
    const attrs = h.attributesManager.getSessionAttributes();
    if (attrs.vinculacionCargada) return;
    attrs.vinculacionCargada = true;
    try {
      const pers = await h.attributesManager.getPersistentAttributes();
      if (pers.tokenCliente && !attrs.tokenCliente && !attrs.tokenEmpleado) {
        attrs.tokenCliente = pers.tokenCliente;
        if (pers.usuarioVinculado && !attrs.usuarioAutenticado) {
          attrs.usuarioAutenticado = pers.usuarioVinculado;
        }
      }
    } catch (e) {
      console.error('No se pudo leer la vinculación persistida:', e.message);
    }
    h.attributesManager.setSessionAttributes(attrs);
  },
};

// Limpia estados de diálogo obsoletos cuando el usuario cambia de tema:
// una elección de tamaño, confirmación o lectura pendiente no debe
// "revivir" varios turnos después con un "sí" o un "grande" suelto.
const LimpiarEstadoObsoletoInterceptor = {
  process(h) {
    if (Alexa.getRequestType(h.requestEnvelope) !== 'IntentRequest') return;
    const nombre = Alexa.getIntentName(h.requestEnvelope);
    const attrs = h.attributesManager.getSessionAttributes();

    const mantienenPendingCarrito = [
      'TamanoChicoIntent', 'TamanoGrandeIntent', 'AgregarCarritoIntent',
      'AMAZON.YesIntent', 'AMAZON.NoIntent', 'AMAZON.HelpIntent',
    ];
    if (attrs.pendingCarrito && !mantienenPendingCarrito.includes(nombre)) {
      delete attrs.pendingCarrito;
    }

    const mantienenConfirmacion = ['AMAZON.YesIntent', 'AMAZON.NoIntent', 'AMAZON.HelpIntent', 'VaciarCarritoIntent'];
    if (attrs.confirmandoVaciar && !mantienenConfirmacion.includes(nombre)) {
      delete attrs.confirmandoVaciar;
    }

    // Confirmaciones del personal: mismas reglas (solo sí/no/ayuda las mantienen)
    const soloSiNo = ['AMAZON.YesIntent', 'AMAZON.NoIntent', 'AMAZON.HelpIntent'];
    if (attrs.confirmandoEstadoPedido && !soloSiNo.includes(nombre) && nombre !== 'CambiarEstadoPedidoIntent') {
      delete attrs.confirmandoEstadoPedido;
    }
    if (attrs.confirmandoAsignacion && !soloSiNo.includes(nombre) && nombre !== 'AsignarRepartidorIntent') {
      delete attrs.confirmandoAsignacion;
    }
    if (attrs.confirmandoAgotado && !soloSiNo.includes(nombre) && nombre !== 'MarcarAgotadoIntent') {
      delete attrs.confirmandoAgotado;
    }

    const mantienenPaginacion = [
      'AMAZON.YesIntent', 'AMAZON.NoIntent', 'AMAZON.NextIntent', 'ResumirIntent',
      'AMAZON.HelpIntent', 'AMAZON.StopIntent', 'AMAZON.CancelIntent',
    ];
    if (attrs.paginacion && !mantienenPaginacion.includes(nombre)) {
      delete attrs.paginacion;
    }

    h.attributesManager.setSessionAttributes(attrs);
  },
};

exports.handler = Alexa.SkillBuilders.custom()
  .withPersistenceAdapter(new S3PersistenceAdapter({
    bucketName: process.env.S3_PERSISTENCE_BUCKET,
  }))
  .addRequestInterceptors(CargarVinculacionInterceptor, LimpiarEstadoObsoletoInterceptor)
  .addRequestHandlers(
    publicos.LaunchRequestHandler,
    // Eventos táctiles de las pantallas APL
    AplUserEventHandler,
    // Diálogo: confirmaciones y lectura por partes (sí / no / siguiente / resumen)
    dialogo.YesIntentHandler,
    dialogo.NoIntentHandler,
    dialogo.NextIntentHandler,
    dialogo.ResumirIntentHandler,
    // Auth: vinculación por código + login empleado + logout
    cuenta.VincularCuentaIntentHandler,
    cuenta.LoginEmpleadoIntentHandler,
    cuenta.LogoutEmpleadoIntentHandler,
    cuenta.MisPedidosIntentHandler,
    cuenta.EstadoUltimoPedidoIntentHandler,
    cuenta.MisFavoritosIntentHandler,
    cuenta.MiPerfilIntentHandler,
    cuenta.AgregarFavoritoIntentHandler,
    cuenta.QuitarFavoritoIntentHandler,
    cuenta.NotificacionesIntentHandler,
    cuenta.PedidosNegocioIntentHandler,
    // Operaciones del negocio (empleado/gerencia/dirección)
    negocio.CambiarEstadoPedidoIntentHandler,
    negocio.DetallePedidoIntentHandler,
    negocio.AvisarDemoraIntentHandler,
    negocio.EntregasIntentHandler,
    negocio.RepartidoresIntentHandler,
    negocio.AsignarRepartidorIntentHandler,
    negocio.ConsultarStockIntentHandler,
    negocio.ReponerStockIntentHandler,
    negocio.MarcarAgotadoIntentHandler,
    negocio.VentasHoyIntentHandler,
    // Reportes del negocio con jerarquía (gerencia / dirección general)
    reportes.KpisNegocioIntentHandler,
    reportes.ProductosTopIntentHandler,
    reportes.VentasSemanaIntentHandler,
    reportes.EquipoIntentHandler,
    reportes.ResumenMesIntentHandler,
    reportes.AuditoriaIntentHandler,
    // Acciones autenticadas (carrito, reseñas)
    carrito.AgregarCarritoIntentHandler,
    carrito.QuitarCarritoIntentHandler,
    carrito.PedirDeNuevoIntentHandler,
    carrito.TamanoChicoIntentHandler,
    carrito.TamanoGrandeIntentHandler,
    carrito.ConsultarCarritoIntentHandler,
    carrito.VaciarCarritoIntentHandler,
    cuenta.MisResenasIntentHandler,
    // Catálogo/info pública
    publicos.ConsultarCatalogoIntentHandler,
    publicos.ConsultarCategoriasIntentHandler,
    publicos.ConsultarPromocionesIntentHandler,
    publicos.ConsultarHorarioIntentHandler,
    publicos.ConsultarUbicacionIntentHandler,
    publicos.ConsultarDestacadosIntentHandler,
    publicos.CotizarEnvioIntentHandler,
    // Conversación abierta + sistema
    conversacion.PreguntaPierIntentHandler,
    conversacion.HelpIntentHandler,
    conversacion.CancelAndStopIntentHandler,
    conversacion.FallbackIntentHandler,
    conversacion.SessionEndedRequestHandler,
  )
  .addErrorHandlers(conversacion.ErrorHandler)
  .lambda();
