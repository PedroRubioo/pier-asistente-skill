// =====================================================================
// API - Backend de Pier (RAG): fetch público, autenticado y contexto cacheado
// =====================================================================
const fetch = require('node-fetch');
const { obtenerConfig } = require('./config');

let contextoCache = null;
let contextoCacheExpira = 0;
const CACHE_MS = 5 * 60 * 1000;

async function fetchPier(path, timeoutMs = 3500) {
  const { PIER_API_URL } = await obtenerConfig();
  const url = `${PIER_API_URL.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, { timeout: timeoutMs });
  if (!res.ok) throw new Error(`Pier API ${path} -> ${res.status}`);
  return res.json();
}

async function fetchPierAuth(path, token, opts = {}) {
  const { PIER_API_URL } = await obtenerConfig();
  const url = `${PIER_API_URL.replace(/\/$/, '')}${path}`;
  const res = await fetch(url, {
    method: opts.method || 'GET',
    timeout: opts.timeout || 5000,
    headers: {
      ...(opts.headers || {}),
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: opts.body,
  });
  if (res.status === 401) throw new Error('token_invalido');
  if (!res.ok) throw new Error(`Pier API ${path} -> ${res.status}`);
  return res.json();
}

function precalentarBackend() {
  obtenerConfig().then(cfg => {
    const url = `${cfg.PIER_API_URL.replace(/\/$/, '')}/api/render-health`;
    fetch(url, { timeout: 1500 }).catch(() => { });
  }).catch(() => { });
}

async function cargarContexto() {
  // Timeout más generoso para el catálogo (es el más crítico).
  // Si Render está cold dará timeout y reintentamos al próximo turno.
  const [prods, cats, promos, destacados] = await Promise.all([
    fetchPier('/api/productos?limite=10&ordenar=rating', 5500).catch(() => ({ productos: [] })),
    fetchPier('/api/categorias', 4000).catch(() => ({ categorias: [] })),
    fetchPier('/api/promociones/activas', 4000).catch(() => ({ promociones: [] })),
    fetchPier('/api/productos-destacados', 4000).catch(() => ({ productos: [] })),
  ]);

  const vacio = (prods.productos || []).length === 0 && (cats.categorias || []).length === 0;
  contextoCache = { prods, cats, promos, destacados };
  // Si todo vino vacío (probable cold start), NO cacheamos para reintentar al próximo turno
  contextoCacheExpira = vacio ? 0 : Date.now() + CACHE_MS;
  return contextoCache;
}

async function obtenerContexto() {
  if (contextoCache && Date.now() < contextoCacheExpira) return contextoCache;

  // Caché vencido pero con datos: se sirven YA (tienen minutos de antigüedad,
  // aceptable para un catálogo) y se refresca en segundo plano. Así un turno
  // con IA nunca paga refetch del backend + DeepSeek juntos, que era lo que
  // rebasaba el límite de 8 segundos de Alexa.
  if (contextoCache) {
    contextoCacheExpira = Date.now() + 60 * 1000; // evita refrescos en estampida
    cargarContexto().catch(() => { });
    return contextoCache;
  }

  return cargarContexto();
}

function productosEnCache() {
  return contextoCache?.prods?.productos || [];
}

// Catálogo completo (para lectura paginada: "¿quieres escuchar más?").
// Mismo ordenamiento que el contexto RAG para que la paginación continúe
// exactamente donde se quedó la primera respuesta.
let catalogoCompletoCache = null;
let catalogoCompletoExpira = 0;

async function obtenerCatalogoCompleto() {
  if (catalogoCompletoCache && Date.now() < catalogoCompletoExpira) return catalogoCompletoCache;
  const data = await fetchPier('/api/productos?limite=100&ordenar=rating', 5500).catch(() => null);
  const productos = data?.productos || [];
  if (productos.length > 0) {
    catalogoCompletoCache = productos;
    catalogoCompletoExpira = Date.now() + CACHE_MS;
    return productos;
  }
  // Respaldo: al menos el top del contexto RAG
  return productosEnCache();
}

function formatearContexto(ctx) {
  const productosList = (ctx.prods.productos || []).slice(0, 10).map(p => {
    const chico = p.precio_chico ? `$${Number(p.precio_chico).toFixed(0)}` : '';
    const grande = p.precio_grande && Number(p.precio_grande) !== Number(p.precio_chico)
      ? ` (chico) / $${Number(p.precio_grande).toFixed(0)} (grande)`
      : '';
    const cat = p.categoria ? ` [${p.categoria}]` : '';
    return `- ${p.nombre}: ${chico}${grande}${cat}`;
  }).join('\n');

  const categoriasList = (ctx.cats.categorias || [])
    .filter(c => c.activo !== false)
    .map(c => c.nombre)
    .join(', ');

  const destacadosList = (ctx.destacados.productos || [])
    .slice(0, 5)
    .map(p => p.nombre)
    .join(', ');

  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const promosList = (ctx.promos.promociones || []).slice(0, 5).map(p => {
    const partes = [];
    const tipoTxt = p.tipo === 'relampago' ? 'Oferta Relámpago'
      : p.tipo === 'temporada' ? `Oferta de Temporada${p.nombre_temporada ? ` "${p.nombre_temporada}"` : ''}`
        : (p.titulo_banner || 'Promoción');
    partes.push(tipoTxt);
    if (p.producto_nombre) partes.push(`en ${p.producto_nombre}`);
    if (p.descuento_porcentaje) partes.push(`${parseFloat(p.descuento_porcentaje).toFixed(0)}% de descuento`);
    if (p.precio_oferta && p.precio_original) {
      partes.push(`$${parseFloat(p.precio_oferta).toFixed(0)} en lugar de $${parseFloat(p.precio_original).toFixed(0)}`);
    }
    if (p.fecha_fin) {
      const f = new Date(p.fecha_fin);
      partes.push(`termina el ${f.getUTCDate()} de ${meses[f.getUTCMonth()]}`);
    }
    if (p.codigo_descuento) partes.push(`código ${p.codigo_descuento}`);
    return `- ${partes.join(', ')}`;
  }).join('\n');

  return [
    'PRODUCTOS DEL CATÁLOGO (precios reales, no inventes ninguno):',
    productosList || '(sin productos disponibles)',
    '',
    `CATEGORÍAS DISPONIBLES: ${categoriasList || '(ninguna)'}`,
    '',
    `MÁS POPULARES ESTA SEMANA: ${destacadosList || '(sin datos)'}`,
    '',
    'PROMOCIONES ACTIVAS:',
    promosList || '(no hay promociones activas en este momento)',
  ].join('\n');
}

module.exports = {
  fetchPier,
  fetchPierAuth,
  precalentarBackend,
  obtenerContexto,
  productosEnCache,
  obtenerCatalogoCompleto,
  formatearContexto,
};
