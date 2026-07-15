// =====================================================================
// AUTH - Token de sesión. Tres orígenes, en orden de prioridad:
//   1. tokenEmpleado  (login por voz con código + PIN, dura la sesión)
//   2. tokenCliente   (código de vinculación de la web, persistido en S3)
//   3. accessToken    (Account Linking de Alexa)
// =====================================================================
function obtenerToken(h) {
  const attrs = h.attributesManager.getSessionAttributes();
  if (attrs.tokenEmpleado) return attrs.tokenEmpleado;
  if (attrs.tokenCliente) return attrs.tokenCliente;
  return h.requestEnvelope.context?.System?.user?.accessToken || null;
}

function obtenerUsuarioAuth(h) {
  const attrs = h.attributesManager.getSessionAttributes();
  if (attrs.usuarioAutenticado) return attrs.usuarioAutenticado;
  const token = h.requestEnvelope.context?.System?.user?.accessToken;
  if (!token) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString('utf-8'));
    return { id: payload.userId, email: payload.email, rol: payload.rol };
  } catch {
    return null;
  }
}

// Rol del usuario en sesión (null si es invitado)
function rolUsuario(h) {
  const attrs = h.attributesManager.getSessionAttributes();
  return attrs.usuarioAutenticado?.rol || null;
}

const ROLES_PERSONAL = ['empleado', 'gerencia', 'direccion_general'];

// ¿La sesión es de personal de Pier (empleado, gerencia o dirección)?
// Decide pantallas y tono: al personal no se le vende ni se le ofrece carrito.
function esPersonal(h) {
  return ROLES_PERSONAL.includes(rolUsuario(h));
}

// Borra la sesión de voz Y la vinculación persistida (S3)
async function limpiarVinculacion(h) {
  const attrs = h.attributesManager.getSessionAttributes();
  delete attrs.tokenEmpleado;
  delete attrs.tokenCliente;
  delete attrs.usuarioAutenticado;
  attrs.intentosLogin = 0;
  h.attributesManager.setSessionAttributes(attrs);
  try {
    h.attributesManager.setPersistentAttributes({});
    await h.attributesManager.savePersistentAttributes();
  } catch (e) {
    console.error('No se pudo limpiar la persistencia:', e.message);
  }
}

module.exports = { obtenerToken, obtenerUsuarioAuth, limpiarVinculacion, rolUsuario, esPersonal, ROLES_PERSONAL };
