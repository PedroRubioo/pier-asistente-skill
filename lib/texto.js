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

// Deja solo las palabras con contenido: sin acentos, sin artículos ni
// conectores. Se aplica IGUAL a lo dicho y al nombre del catálogo, para
// que "rebanada de chocoflán" empate con "Rebanada de Chocoflan".
function palabrasClave(s) {
  return normalizar(s)
    .replace(/\b3\b/g, 'tres') // el catálogo escribe "Mini 3 Leches", la voz dice "tres"
    .replace(/\b(el|la|los|las|un|una|unos|unas|de|del|mi|mis)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Encuentra el producto del catálogo que mejor corresponde a lo dicho.
// Dos niveles, en orden:
//   1) Lo dicho CONTIENE el nombre completo de un producto -> gana el
//      nombre más LARGO («rebanada de chocoflán» gana a «Chocoflan»).
//   2) Lo dicho es solo PARTE de un nombre -> gana el nombre más CORTO
//      que lo contenga («chocoflán» debe dar Chocoflan, NO la Rebanada).
function mejorProductoPorNombre(dicho, catalogo) {
  const t = palabrasClave(dicho);
  if (!t) return null;
  const candidatos = (catalogo || []).filter(p => p.nombre);

  const dijoNombreCompleto = candidatos.filter(p => t.includes(palabrasClave(p.nombre)));
  if (dijoNombreCompleto.length) {
    return dijoNombreCompleto.sort((a, b) => b.nombre.length - a.nombre.length)[0];
  }

  // 2) Lo dicho es parte de un nombre, o todas sus palabras aparecen en él
  //    (tolerando singular/plural: "fresa" empata "Fresas"). Desempate:
  //    primero el nombre que EMPIEZA con la misma palabra que dijo el
  //    usuario ("tres leches..." gana a "Mini 3 Leches..."), luego el
  //    más corto ("chocoflán" da Chocoflan, no la Rebanada).
  const palabrasDichas = t.split(' ');
  const coincidencias = candidatos.filter(p => {
    const n = palabrasClave(p.nombre);
    if (n.includes(t)) return true;
    const delNombre = n.split(' ');
    return palabrasDichas.every(w => delNombre.some(x => x.startsWith(w) || w.startsWith(x)));
  });
  if (coincidencias.length) {
    const primera = palabrasDichas[0];
    return coincidencias.sort((a, b) => {
      const aEmpieza = palabrasClave(a.nombre).split(' ')[0] === primera ? 0 : 1;
      const bEmpieza = palabrasClave(b.nombre).split(' ')[0] === primera ? 0 : 1;
      if (aEmpieza !== bEmpieza) return aEmpieza - bEmpieza;
      return a.nombre.length - b.nombre.length;
    })[0];
  }
  return null;
}

module.exports = { normalizar, cantidadDesdeTexto, mejorProductoPorNombre };
