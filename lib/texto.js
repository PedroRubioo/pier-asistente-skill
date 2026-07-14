// =====================================================================
// TEXTO - Normalización para comparar lo que dice el usuario con el
// catálogo: minúsculas y sin acentos ("Chocoflán" ≈ "chocoflan")
// =====================================================================
function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

// Cantidad dicha por el usuario ("2 chocoflanes", "dos cheesecakes").
// OJO: pasar el texto SIN el nombre del producto, porque nombres como
// "Tres Leches" contienen números en palabra.
function cantidadDesdeTexto(texto) {
  const t = normalizar(texto);
  const m = t.match(/\b(\d{1,2})\b/);
  if (m) return Math.min(Math.max(parseInt(m[1]), 1), 20);
  const palabras = { dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6 };
  for (const [palabra, n] of Object.entries(palabras)) {
    if (new RegExp('\\b' + palabra + '\\b').test(t)) return n;
  }
  return 1;
}

module.exports = { normalizar, cantidadDesdeTexto };
