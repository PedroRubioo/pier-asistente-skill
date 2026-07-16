// =====================================================================
// PERSONAL - Contenido del panel de voz del staff, según jerarquía:
// empleado (operación), gerencia (+ reportes), dirección (+ ejecutivos).
// Lo consumen la bienvenida, la ayuda y la vinculación cuando la sesión
// es de personal, junto con la pantalla buildPanelComandos.
// También vive aquí el rechazo de funciones de cliente: cada rol tiene
// SUS funciones, y el personal no compra (carrito, favoritos, historial).
// =====================================================================
const { esPersonal } = require('./auth');
const { responder } = require('./respuesta');

// Si la sesión es de personal, devuelve el rechazo audible (la función
// pedida es exclusiva de cuentas de cliente); si no, devuelve null y el
// handler continúa normal.
function rechazoSiEsPersonal(h) {
  if (!esPersonal(h)) return null;
  return responder(
    h,
    'Esa función es de las cuentas de cliente. Con tu cuenta de personal te ayudo con los pedidos del negocio, las ventas, el inventario y las entregas. ¿Qué revisamos?'
  );
}

function rolLegible(rol) {
  if (rol === 'direccion_general') return 'dirección general';
  return rol || 'personal';
}

// Filas para la pantalla buildPanelComandos, de más usadas a menos
function comandosPersonal(rol) {
  const comandos = [
    { etiqueta: 'Pedidos', frase: '«cómo van los pedidos» · «qué pedidos están pendientes»' },
    { etiqueta: 'Pedidos', frase: '«qué lleva el pedido 6651» · «marca el pedido 6651 como listo»' },
    { etiqueta: 'Ventas', frase: '«cómo van las ventas hoy»' },
    { etiqueta: 'Inventario', frase: '«qué está agotado» · «repón diez unidades de chocoflán»' },
    { etiqueta: 'Entregas', frase: '«qué entregas hay» · «asigna el pedido 6651 a Carlos»' },
  ];
  if (['gerencia', 'direccion_general'].includes(rol)) {
    comandos.push({ etiqueta: 'Reportes', frase: '«números del negocio» · «productos más vendidos» · «ventas de la semana»' });
  }
  if (rol === 'direccion_general') {
    comandos.push({ etiqueta: 'Dirección', frase: '«dame el resumen del mes» · «qué movimientos hubo en el sistema»' });
  }
  return comandos;
}

// Resumen hablado de lo que puede hacer el personal (para la ayuda)
function ayudaPersonalVoz(rol) {
  const base = 'Puedes preguntarme cómo van los pedidos, qué lleva un pedido, marcarlos como listos, las ventas de hoy, el inventario y las entregas a domicilio.';
  const gerencia = ['gerencia', 'direccion_general'].includes(rol)
    ? ' Como gerencia también tienes los números del negocio, el ranking de productos y las ventas de la semana.'
    : '';
  const direccion = rol === 'direccion_general'
    ? ' Y como dirección, el resumen del mes y la auditoría del sistema.'
    : '';
  return `${base}${gerencia}${direccion} El catálogo y los precios también, como siempre. ¿Qué revisamos?`;
}

module.exports = { comandosPersonal, ayudaPersonalVoz, rolLegible, rechazoSiEsPersonal };
