// =====================================================================
// APL - Las 6 plantillas documentadas (Echo Show / Fire TV), vestidas
// con la identidad real de Pier Repostería:
//   - Degradado de fondo verde (tokens pier-verde del sitio web)
//   - Tipografía serif Bookerly para títulos (equivalente APL de la
//     Playfair Display del sitio) y Amazon Ember para cuerpo
//   - Logo real, tarjetas arena con acentos dorados
//
//   1. Headline           -> bienvenida y mensajes simples (hero custom)
//   2. Cards Layout       -> menú de categorías (tarjetas táctiles)
//   3. Image List         -> productos / pedidos / carrito (Design System)
//   4. Image Right Detail -> ficha de producto con botón "Agregar"
//   5. Image Left Detail  -> información de la repostería
//   6. Multiple Choice    -> elección de tamaño (botones de marca)
// Los toques (SendEvent) llegan como Alexa.Presentation.APL.UserEvent
// con arguments = [accion, valor] y se atienden en handlers/aplEventos.js
// =====================================================================
const { COLORES, PIER_WEB, PIER_DIRECCION, PIER_TELEFONO, PIER_LOGO_URL } = require('./config');

// Logo real del emprendimiento (mismo que usa el sitio web)
const LOGO = PIER_LOGO_URL;

const FUENTE_TITULOS = 'Bookerly';

// Respaldo con los colores de la marca (dorado sobre verde) para
// productos que aún no tienen fotografía en el catálogo
function imagenFallback(texto) {
  return `https://placehold.co/400x400/D4A574/556332?text=${encodeURIComponent(texto || 'Pier')}`;
}

function baseDoc(items) {
  return {
    type: 'APL',
    version: '2024.3',
    theme: 'dark',
    // Degradado sutil de verde profundo a verde oliva (identidad del sitio)
    background: {
      type: 'linear',
      colorRange: [COLORES.fondoProfundo, COLORES.fondo],
      inputRange: [0, 1],
      angle: 25,
    },
    import: [{ name: 'alexa-layouts', version: '1.7.0' }],
    mainTemplate: { items },
  };
}

function soportaAPL(h) {
  return !!(h.requestEnvelope.context?.System?.device?.supportedInterfaces?.['Alexa.Presentation.APL']);
}

function inyectarAPL(responseBuilder, h, document, token) {
  if (!soportaAPL(h) || !document) return responseBuilder;
  return responseBuilder.addDirective({
    type: 'Alexa.Presentation.APL.RenderDocument',
    token: token || 'pierToken',
    document,
    datasources: {},
  });
}

// Encabezado de marca reutilizable (Design System)
function headerPier(subtitulo) {
  return {
    type: 'AlexaHeader',
    headerTitle: 'PIER REPOSTERÍA',
    headerSubtitle: subtitulo || 'Repostería artesanal · Huejutla',
    headerAttributionImage: LOGO,
  };
}

// ---------------------------------------------------------------------
// 1. HEADLINE - Hero de marca: logo enmarcado, título serif y hint dorado
// ---------------------------------------------------------------------
function buildHeadline({ subtituloHeader, primario, secundario, hint }) {
  return baseDoc([{
    type: 'Container',
    width: '100vw',
    height: '100vh',
    items: [
      headerPier(subtituloHeader),
      {
        type: 'Container',
        grow: 1,
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: '6vw',
        paddingRight: '6vw',
        items: [
          {
            type: 'Frame',
            width: "${@viewportProfile == @hubRoundSmall ? '96dp' : '132dp'}",
            height: "${@viewportProfile == @hubRoundSmall ? '96dp' : '132dp'}",
            borderRadius: '66dp',
            backgroundColor: COLORES.crema,
            borderColor: COLORES.acento,
            borderWidth: '3dp',
            item: {
              type: 'Image',
              source: LOGO,
              width: '100%',
              height: '100%',
              scale: 'best-fill',
            },
          },
          {
            type: 'Text',
            text: primario || '',
            fontFamily: FUENTE_TITULOS,
            fontSize: "${@viewportProfile == @hubRoundSmall ? '26dp' : '40dp'}",
            fontWeight: '700',
            color: COLORES.crema,
            textAlign: 'center',
            paddingTop: '20dp',
            maxLines: 2,
          },
          {
            type: 'Text',
            text: secundario || '',
            fontSize: "${@viewportProfile == @hubRoundSmall ? '16dp' : '22dp'}",
            color: '#F5F1EDCC',
            textAlign: 'center',
            paddingTop: '10dp',
            maxLines: 2,
          },
        ],
      },
      {
        type: 'Text',
        text: hint || 'Prueba, "qué me recomiendas"',
        fontFamily: FUENTE_TITULOS,
        fontStyle: 'italic',
        fontSize: "${@viewportProfile == @hubRoundSmall ? '14dp' : '20dp'}",
        color: COLORES.doradoClaro,
        textAlign: 'center',
        width: '100%',
        paddingBottom: '22dp',
        paddingLeft: '6vw',
        paddingRight: '6vw',
        maxLines: 1,
      },
    ],
  }]);
}

// ---------------------------------------------------------------------
// 2. CARDS LAYOUT - Menú de categorías (tarjetas arena con acento dorado)
// categorias: [{ nombre, imagen_url? }]
// ---------------------------------------------------------------------
function buildCardsCategorias(categorias) {
  const data = (categorias || []).slice(0, 6).map(c => ({
    titulo: c.nombre,
    img: c.imagen_url || imagenFallback(c.nombre),
  }));
  return baseDoc([{
    type: 'Container',
    width: '100vw',
    height: '100vh',
    items: [
      headerPier('¿Qué categoría quieres ver?'),
      {
        type: 'Sequence',
        grow: 1,
        width: '100%',
        paddingLeft: '24dp',
        paddingRight: '24dp',
        paddingTop: '12dp',
        paddingBottom: '16dp',
        scrollDirection: "${@viewportProfile == @hubRoundSmall ? 'vertical' : 'horizontal'}",
        data,
        items: [{
          type: 'TouchWrapper',
          width: "${@viewportProfile == @hubRoundSmall ? '80vw' : '30vw'}",
          minWidth: '170dp',
          height: '256dp',
          padding: '8dp',
          onPress: {
            type: 'SendEvent',
            arguments: ['categoria', '${data.titulo}'],
          },
          item: {
            type: 'Frame',
            width: '100%',
            height: '100%',
            backgroundColor: COLORES.crema,
            borderRadius: '20dp',
            item: {
              type: 'Container',
              width: '100%',
              height: '100%',
              alignItems: 'center',
              paddingLeft: '12dp',
              paddingRight: '12dp',
              paddingTop: '12dp',
              paddingBottom: '12dp',
              items: [
                {
                  type: 'Frame',
                  width: '100%',
                  height: '150dp',
                  borderRadius: '14dp',
                  backgroundColor: COLORES.doradoClaro,
                  item: {
                    type: 'Image',
                    source: '${data.img}',
                    width: '100%',
                    height: '100%',
                    scale: 'best-fill',
                  },
                },
                {
                  type: 'Text',
                  text: '${data.titulo}',
                  fontFamily: FUENTE_TITULOS,
                  color: COLORES.textoOscuro,
                  fontSize: '23dp',
                  fontWeight: '700',
                  textAlign: 'center',
                  paddingTop: '12dp',
                  maxLines: 1,
                },
                {
                  type: 'Frame',
                  width: '40dp',
                  height: '4dp',
                  borderRadius: '2dp',
                  backgroundColor: COLORES.acento,
                },
              ],
            },
          },
        }],
      },
    ],
  }]);
}

// ---------------------------------------------------------------------
// 3. IMAGE LIST - Listado con imagen y precio (Design System, táctil)
// items: [{ primario, secundario, terciario?, imagen?, id? }]
// ---------------------------------------------------------------------
function buildImageList(subtitulo, items, hint) {
  const listItems = (items || []).slice(0, 6).map(i => {
    const li = {
      primaryText: i.primario || '',
      secondaryText: i.secundario || '',
      tertiaryText: i.terciario || '',
      imageSource: i.imagen || imagenFallback(i.primario),
    };
    if (i.id !== undefined && i.id !== null) {
      li.primaryAction = {
        type: 'SendEvent',
        arguments: ['producto', String(i.id)],
      };
    }
    return li;
  });
  return baseDoc([{
    type: 'AlexaImageList',
    listId: 'listaPier',
    headerTitle: 'PIER REPOSTERÍA',
    headerSubtitle: subtitulo || '',
    headerAttributionImage: LOGO,
    backgroundColor: COLORES.fondo,
    imageAspectRatio: 'square',
    imageBlurredBackground: true,
    hideOrdinal: false,
    listItems,
    hintText: hint || PIER_WEB,
    theme: 'dark',
    width: '100vw',
    height: '100vh',
  }]);
}

// ---------------------------------------------------------------------
// 4. IMAGE RIGHT DETAIL - Ficha de producto con botón "Agregar al pedido"
// ---------------------------------------------------------------------
function buildDetalleProducto(p) {
  const precioC = Number(p.precio_chico || 0).toFixed(0);
  const precioG = p.precio_grande && Number(p.precio_grande) !== Number(p.precio_chico)
    ? Number(p.precio_grande).toFixed(0)
    : null;
  const precios = precioG
    ? `Chico $${precioC} · Grande $${precioG} MXN`
    : `$${precioC} MXN`;
  const ratingTxt = p.rating && Number(p.rating) > 0
    ? ` Calificación ${Number(p.rating).toFixed(1)} de 5.`
    : '';
  return baseDoc([{
    type: 'AlexaDetail',
    detailType: 'generic',
    detailImageAlignment: 'right',
    headerTitle: 'PIER REPOSTERÍA',
    headerSubtitle: 'Detalle del producto',
    headerAttributionImage: LOGO,
    backgroundColor: COLORES.fondo,
    imageSource: p.imagen_url || imagenFallback(p.nombre),
    imageAspectRatio: 'square',
    primaryText: p.nombre || 'Producto',
    secondaryText: precios,
    bodyText: `${p.descripcion || 'Elaborado el mismo día, disponible para recoger en tienda.'}${ratingTxt}`,
    button1Text: 'Agregar al pedido',
    button1PrimaryAction: {
      type: 'SendEvent',
      arguments: ['agregar', String(p.id || '')],
    },
    theme: 'dark',
    width: '100vw',
    height: '100vh',
  }]);
}

// ---------------------------------------------------------------------
// 5. IMAGE LEFT DETAIL - Información de la repostería
// ---------------------------------------------------------------------
function buildInfoNegocio(horarioTexto) {
  return baseDoc([{
    type: 'AlexaDetail',
    detailType: 'location',
    detailImageAlignment: 'left',
    headerTitle: 'PIER REPOSTERÍA',
    headerSubtitle: 'Nuestra tienda',
    headerAttributionImage: LOGO,
    backgroundColor: COLORES.fondo,
    imageSource: LOGO,
    imageAspectRatio: 'square',
    primaryText: 'Pier Repostería',
    secondaryText: 'Repostería artesanal',
    locationText: PIER_DIRECCION,
    bodyText: `${horarioTexto || 'Lunes a sábado de 8:00 a 21:00, domingo cerrado.'} Teléfono ${PIER_TELEFONO}. Pide en línea y recoge en tienda.`,
    button1Text: 'Ver horario',
    button1PrimaryAction: {
      type: 'SendEvent',
      arguments: ['horario', ''],
    },
    theme: 'dark',
    width: '100vw',
    height: '100vh',
  }]);
}

// ---------------------------------------------------------------------
// 6. MULTIPLE CHOICE - Opciones del pedido (botones de marca, táctiles)
// opciones: [{ letra, texto, valor }]  (valor: 'chico' | 'grande')
// ---------------------------------------------------------------------
function buildMultipleChoice(pregunta, opciones) {
  const data = (opciones || []).map(o => ({
    letra: o.letra,
    texto: o.texto,
    valor: o.valor,
  }));
  return baseDoc([{
    type: 'Container',
    width: '100vw',
    height: '100vh',
    alignItems: 'center',
    items: [
      headerPier('Personaliza tu pedido'),
      {
        type: 'Text',
        text: pregunta || '¿Qué tamaño prefieres?',
        fontFamily: FUENTE_TITULOS,
        color: COLORES.crema,
        fontSize: "${@viewportProfile == @hubRoundSmall ? '22dp' : '30dp'}",
        fontWeight: '700',
        textAlign: 'center',
        width: '85vw',
        paddingTop: '12dp',
        paddingBottom: '18dp',
        maxLines: 2,
      },
      {
        type: 'Container',
        width: '100%',
        grow: 1,
        alignItems: 'center',
        data,
        items: [{
          type: 'TouchWrapper',
          width: "${@viewportProfile == @hubRoundSmall ? '90vw' : '58vw'}",
          height: '68dp',
          paddingBottom: '14dp',
          onPress: {
            type: 'SendEvent',
            arguments: ['tamano', '${data.valor}'],
          },
          item: {
            type: 'Frame',
            width: '100%',
            height: '100%',
            backgroundColor: COLORES.crema,
            borderRadius: '34dp',
            item: {
              type: 'Container',
              direction: 'row',
              width: '100%',
              height: '100%',
              alignItems: 'center',
              paddingLeft: '8dp',
              items: [
                {
                  type: 'Frame',
                  width: '44dp',
                  height: '44dp',
                  borderRadius: '22dp',
                  backgroundColor: COLORES.acento,
                  item: {
                    type: 'Text',
                    text: '${data.letra}',
                    fontFamily: FUENTE_TITULOS,
                    fontWeight: '700',
                    fontSize: '22dp',
                    color: COLORES.textoOscuro,
                    width: '100%',
                    height: '100%',
                    textAlign: 'center',
                    textAlignVertical: 'center',
                  },
                },
                {
                  type: 'Text',
                  text: '${data.texto}',
                  fontSize: '21dp',
                  fontWeight: '600',
                  color: COLORES.textoOscuro,
                  paddingLeft: '14dp',
                  maxLines: 1,
                },
              ],
            },
          },
        }],
      },
    ],
  }]);
}

module.exports = {
  soportaAPL,
  inyectarAPL,
  imagenFallback,
  buildHeadline,
  buildCardsCategorias,
  buildImageList,
  buildDetalleProducto,
  buildInfoNegocio,
  buildMultipleChoice,
};
