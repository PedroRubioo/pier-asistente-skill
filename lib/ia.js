// =====================================================================
// IA - System prompt, cliente DeepSeek y memoria conversacional (RAG)
// Para cambiar de proveedor de IA solo se toca consultarIA()
// =====================================================================
const fetch = require('node-fetch');
const { obtenerConfig, PIER_WEB, PIER_DIRECCION, PIER_TELEFONO } = require('./config');
const { obtenerContexto, formatearContexto } = require('./api');
const { describirHorario } = require('./horario');
const { soportaAPL } = require('./apl');
const { normalizar } = require('./texto');

const MAX_HISTORIAL = 10;

function buildSystemPrompt(contextoTexto, horarioTexto, instruccionEspecifica, attrs, tienePantalla) {
  const productoActivoTxt = attrs?.productoActivo
    ? `${attrs.productoActivo.nombre} (precio chico $${attrs.productoActivo.precio_chico}${attrs.productoActivo.precio_grande && attrs.productoActivo.precio_grande !== attrs.productoActivo.precio_chico ? `, grande $${attrs.productoActivo.precio_grande}` : ''})`
    : '(ninguno)';

  const productosListadosTxt = attrs?.productosListados && attrs.productosListados.length
    ? attrs.productosListados.map(p => p.nombre).join(', ')
    : '(ninguno)';

  const usuarioTxt = attrs?.usuarioAutenticado
    ? `${attrs.usuarioAutenticado.nombre} (rol: ${attrs.usuarioAutenticado.rol})`
    : 'invitado (no identificado)';

  return `Eres Pier, una empleada amigable y joven de Pier Repostería, una repostería artesanal click-and-collect en Huejutla de Reyes, Hidalgo. No hay servicio a domicilio: los clientes pasan a recoger su pedido.

PERSONALIDAD Y TONO:
- Habla como si estuvieras detrás del mostrador: cercana, en primera persona del plural ("aquí tenemos", "te recomiendo", "qué se te antoja"), con un toque de calidez mexicana sin exagerar.
- Evita sonar formal, robótica o repetitiva. Nada de "claro," al inicio de cada respuesta.
- VARIEDAD: revisa tus respuestas anteriores en el historial y NO repitas la misma fórmula de apertura ni de cierre dos turnos seguidos.
- Si el usuario está identificado, usa su nombre de vez en cuando (no en cada turno).
- De vez en cuando remata con una micro-pregunta que empuje la venta ("¿te aparto uno?", "¿lo quieres chico o grande?"), sin presionar y sin hacerlo en todos los turnos.
- Si te preguntan algo a lo que ya respondiste, contesta con naturalidad: "ya te decía que..." o resume y avanza.

DISPOSITIVO DEL USUARIO: ${tienePantalla
    ? 'CON pantalla (Echo Show o similar). Cuando muestres listas o categorías puedes invitarlo a tocar la pantalla, sin abusar.'
    : 'SIN pantalla (Echo Dot o similar). PROHIBIDO decir "toca", "mira la pantalla", "en la pantalla" o cualquier referencia visual. Todo se describe por voz.'}

REGLAS DURAS:
- Responde en español de México, máximo 2 a 3 oraciones cortas (la lee Alexa en voz alta).
- PROHIBIDO inventar productos, precios, promociones, sabores o categorías que no estén en los DATOS ACTUALES.
- PROHIBIDO escribir etiquetas, encabezados ni markdown ("TIPO A:", "*", "**", etc.).
- Solo cierra con invitación a ${PIER_WEB} cuando sea natural, no en cada turno.

CÓMO USAR EL HISTORIAL DE LA CONVERSACIÓN:
- El usuario te habla en turnos. Mantienes el contexto entre turnos.
- Si el usuario dice referencias como "ese", "el chocoflán", "los tres", "agrégame dos" → mira el ESTADO CONVERSACIONAL abajo para saber a qué se refiere.
- Si el usuario cambia de tema claramente, olvida el estado anterior.

ESTADO CONVERSACIONAL ACTUAL:
- Usuario: ${usuarioTxt}
- Producto del que estamos hablando: ${productoActivoTxt}
- Productos listados recientemente: ${productosListadosTxt}

INSTRUCCIÓN PARA ESTE TURNO:
${instruccionEspecifica}

DATOS ACTUALES DE PIER REPOSTERÍA:

${contextoTexto}

HORARIO: ${horarioTexto}

UBICACIÓN: ${PIER_DIRECCION}. Teléfono ${PIER_TELEFONO}. Sitio web: ${PIER_WEB}.`;
}

async function consultarIA(systemPrompt, messages) {
  try {
    const { DEEPSEEK_API_KEY } = await obtenerConfig();
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      timeout: 4000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages,
        ],
        temperature: 0.6,
        max_tokens: 220,
      }),
    });

    if (!response.ok) {
      console.error('DeepSeek HTTP', response.status);
      return 'Tuve un problema procesando tu pregunta. ¿Me la repites?';
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim()
      || 'No pude generar una respuesta. ¿Me la repites?';
  } catch (err) {
    console.error('Error DeepSeek:', err);
    return 'Tuve un problema de conexión. ¿Me lo repites?';
  }
}

function detectarProductosMencionados(texto, productos) {
  if (!texto || !productos || productos.length === 0) return [];
  // Sin acentos: Alexa transcribe "chocoflán" pero el catálogo puede decir "Chocoflan"
  const t = normalizar(texto);
  return productos.filter(p => p.nombre && t.includes(normalizar(p.nombre)));
}

async function responderConIA(handlerInput, instruccion, preguntaUsuario) {
  const attrs = handlerInput.attributesManager.getSessionAttributes();
  attrs.historial = attrs.historial || [];

  const ctx = await obtenerContexto();
  // Catálogo para detectar menciones: top del catálogo + destacados.
  // Si solo se busca en el top-10, una respuesta que menciona 3 destacados
  // puede detectar solo 1 y pisar el productoActivo equivocadamente.
  const base = ctx.prods?.productos || [];
  const extra = (ctx.destacados?.productos || []).filter(d => !base.some(p => p.id === d.id));
  const productosCatalogo = [...base, ...extra];

  const sysPrompt = buildSystemPrompt(
    formatearContexto(ctx),
    describirHorario(),
    instruccion,
    attrs,
    soportaAPL(handlerInput)
  );

  const historialReciente = attrs.historial.slice(-MAX_HISTORIAL);
  const messages = [
    ...historialReciente,
    { role: 'user', content: preguntaUsuario },
  ];

  const respuesta = await consultarIA(sysPrompt, messages);

  // Detectar estado estructurado:
  // 1) Mira primero lo que el USUARIO dijo (refleja el foco real del turno).
  // 2) Si el usuario no mencionó productos específicos, mira la respuesta de la IA.
  const mencionadosEnPregunta = detectarProductosMencionados(preguntaUsuario, productosCatalogo);
  const mencionadosEnRespuesta = detectarProductosMencionados(respuesta, productosCatalogo);

  if (mencionadosEnPregunta.length === 1) {
    const p = mencionadosEnPregunta[0];
    attrs.productoActivo = {
      id: p.id, nombre: p.nombre, precio_chico: p.precio_chico, precio_grande: p.precio_grande,
    };
    attrs.productosListados = null;
  } else if (mencionadosEnRespuesta.length === 1) {
    const p = mencionadosEnRespuesta[0];
    attrs.productoActivo = {
      id: p.id, nombre: p.nombre, precio_chico: p.precio_chico, precio_grande: p.precio_grande,
    };
    attrs.productosListados = null;
  } else if (mencionadosEnRespuesta.length > 1) {
    attrs.productosListados = mencionadosEnRespuesta.map(p => ({
      id: p.id, nombre: p.nombre, precio_chico: p.precio_chico,
    }));
    attrs.productoActivo = null;
  }

  attrs.historial.push({ role: 'user', content: preguntaUsuario });
  attrs.historial.push({ role: 'assistant', content: respuesta });
  if (attrs.historial.length > MAX_HISTORIAL * 2) {
    attrs.historial = attrs.historial.slice(-MAX_HISTORIAL * 2);
  }

  handlerInput.attributesManager.setSessionAttributes(attrs);
  return respuesta;
}

module.exports = { responderConIA, detectarProductosMencionados };
