// =====================================================================
// CONFIG - Constantes del negocio + configuración remota (S3)
// =====================================================================
const AWS = require('aws-sdk');

const PIER_WEB = 'pier reposteria punto vercel punto app';
const PIER_DIRECCION = 'Huejutla de Reyes, Hidalgo, bulevar Adolfo López Mateos';
const PIER_TELEFONO = '7713037022';

// Logo real del emprendimiento, servido desde el propio sitio (Vercel)
const PIER_LOGO_URL = 'https://pier-reposteria.vercel.app/alexa-logo.jpg';

// Identidad gráfica del sitio web (design tokens de Fronted-Pier/src/index.css)
//   --pier-verde: #6B7C3E   --pier-verde-oscuro: #556332
//   --pier-dorado: #D4A574  --pier-dorado-oscuro: #B8894F
//   --pier-arena: #F5F1ED   --pier-arena-oscuro: #E8E0D5
const COLORES = {
  fondo: '#556332',        // pier-verde-oscuro: base de todas las pantallas
  fondoProfundo: '#333D1E', // verde más profundo: extremo del degradado de fondo
  crema: '#F5F1ED',        // pier-arena: tarjetas y texto claro
  acento: '#D4A574',       // pier-dorado: bordes y acentos
  doradoClaro: '#E8C9A0',  // pier-dorado-claro: hints y detalles
  textoOscuro: '#556332',  // pier-verde-oscuro: texto sobre tarjetas arena
};

// Horario por día (0 = domingo)
// Horas alineadas con Fronted-Pier/src/utils/horarioNegocio.ts (8:00-21:00),
// la "única fuente" que usa la web para validar recolecciones y envíos.
const HORARIO = {
  0: null,
  1: { abre: 8, cierra: 21 },
  2: { abre: 8, cierra: 21 },
  3: { abre: 8, cierra: 21 },
  4: { abre: 8, cierra: 21 },
  5: { abre: 8, cierra: 21 },
  6: { abre: 8, cierra: 21 },
};

const s3 = new AWS.S3();
let cachedConfig = null;

async function obtenerConfig() {
  if (cachedConfig) return cachedConfig;
  const bucket = process.env.S3_PERSISTENCE_BUCKET;
  if (!bucket) throw new Error('S3_PERSISTENCE_BUCKET no definido');
  const data = await s3.getObject({ Bucket: bucket, Key: 'Media/config.json' }).promise();
  cachedConfig = JSON.parse(data.Body.toString('utf-8'));
  return cachedConfig;
}

module.exports = { PIER_WEB, PIER_DIRECCION, PIER_TELEFONO, PIER_LOGO_URL, COLORES, HORARIO, obtenerConfig };
