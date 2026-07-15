# Pier Asistente — Guion de demostración por rol

**Skill de Alexa (es-MX) de Pier Repostería** · Invocación: *«Alexa, abre pier asistente»*

La skill es el **escaparate por voz** de la plataforma: explora el catálogo, arma el carrito,
consulta pedidos y opera el negocio con manos libres. La compra (pago) siempre se completa
en la web — el carrito queda sincronizado entre voz y sitio.

---

## Cómo se inicia sesión (igual para todos los roles)

1. El usuario entra a su panel en la web (perfil del cliente / dashboard del personal).
2. Pulsa **"Vincular con Alexa"** → se genera un **código de 6 dígitos** (un solo uso, expira en 5 min).
3. Le dice a Alexa: *«vincula mi cuenta con el código …»*.
4. La sesión persiste 7 días entre conversaciones. *«cierra sesión»* revoca el token en el
   backend y desvincula el dispositivo al instante.

> Seguridad: código de un solo uso generado dentro de una sesión web autenticada, rate limit
> por dispositivo (5 intentos → bloqueo 15 min), y confirmación obligatoria en toda acción
> destructiva. También existen Account Linking OAuth y login de empleado por código + PIN
> (bcrypt) como métodos alternos.

---

## 🌐 PÚBLICO — sin cuenta (exploración)

| Capacidad | Frase |
|---|---|
| Catálogo completo con lectura por partes | «qué productos tienen» |
| Continuar / resumir / detener la lectura | «sí» · «continúa» · «dame un resumen» · «basta» |
| Categorías con tarjetas táctiles | «qué categorías manejan» |
| Precio y ficha de cualquier producto | «cuánto cuesta el chocoflán» |
| Recomendaciones y populares | «qué me recomiendas» |
| Promociones activas | «qué promociones hay» |
| Horario con estado abierto/cerrado en vivo | «a qué hora abren» |
| Ubicación y teléfono | «dónde están» |
| Cotización de envío por colonia | «hacen envíos a la colonia adolfo lópez mateos» |
| Preguntas libres con IA honesta al catálogo | «qué pastel llevo a una boda» |
| Ayuda contextual | «ayuda» |

### Secuencia de demo (público)

1. «abre pier asistente» → pantalla hero: **foto real de la sucursal de fondo**, logo, tipografía de marca
2. «qué categorías manejan» → tarjetas arena → **tocar una** → productos de esa categoría
3. **Tocar un producto** → ficha con foto, precio, descripción y botón "Agregar al pedido"
4. «qué productos tienen» → dice el **total real** (leído de la BD) y ofrece seguir
5. «sí» → siguiente tanda de 5 → «dame un resumen» → resumen de lo restante (conteo, categorías, rango de precios)
6. «qué promociones hay» → promociones reales o honestidad si no hay
7. «hacen envíos a la colonia [X]» → tarifa real de la zona; con colonia inventada → "sin cobertura" + ofrece pickup
8. «tienen tiramisú» → *"ese no lo manejamos"* + sugiere lo más parecido **(la IA no inventa: coherente con la BD)**
9. «a qué hora abren» → estado abierto/cerrado calculado en tiempo real

---

## 👤 CLIENTE — vinculado

Todo lo público, más:

| Capacidad | Frase |
|---|---|
| Agregar al carrito (tamaño y cantidad) | «agrega dos chocoflanes grandes al carrito» |
| Elegir tamaño por voz o botones táctiles A/B | «chico» / «grande» o tocar |
| Quitar un producto del carrito | «quita el flan napolitano del carrito» |
| Ver carrito con total real | «qué tengo en mi carrito» |
| Vaciar carrito (con confirmación) | «vacía mi carrito» → «sí» / «no» |
| Repetir compras anteriores | «pide lo de siempre» |
| Sus pedidos y estado del último | «mis pedidos» · «cómo va mi último pedido» |
| Favoritos: ver, agregar, quitar | «agrega el cheesecake oreo a mis favoritos» |
| Notificaciones (lee y marca leídas) | «qué notificaciones tengo» |
| Reseñas y perfil | «mis reseñas» · «quién soy» |
| Cerrar sesión con revocación real | «cierra sesión» |

### Secuencia de demo (cliente)

1. En la web: Perfil → **Vincular con Alexa** → generar código
2. «vincula mi cuenta con el código [X]» → saludo por su nombre
3. «quién soy» → nombre, correo y rol reales
4. «agrega dos chocoflanes grandes al carrito» → agregado directo con total ($760)
5. «agrega un flan napolitano al carrito» → pregunta tamaño → **tocar botón A/B** o decir «chico»
6. «quita el flan napolitano del carrito» → solo ese producto sale
7. «pide lo de siempre» → sus compras anteriores reales → tocar una para reagregarla
8. «qué tengo en mi carrito» → resumen hablado con total exacto
9. «quiero hacer mi pedido» → la IA lo dirige: *"tu carrito ya te espera en la web para confirmarlo y pagarlo"*
10. ⭐ **Abrir la web: el carrito está idéntico** — la integración skill ↔ sitio en vivo
11. «agrega el cheesecake oreo a mis favoritos» → verificar el corazón en la web
12. «qué notificaciones tengo» → las lee y las deja marcadas
13. «vacía mi carrito» → *"¿seguro?"* → «no» → intacto → repetir → «sí» → vacío (confirmación de acciones destructivas)
14. «cierra sesión» → «quién soy» → ya no reconoce al usuario (token revocado)

---

## 👔 EMPLEADO — operación del negocio

Todo lo del cliente, más:

| Capacidad | Frase |
|---|---|
| Resumen de pedidos por estado | «cómo van los pedidos» |
| Pedidos filtrados por estado | «qué pedidos están pendientes» |
| Detalle de un pedido (por últimos 4 dígitos) | «qué lleva el pedido 6651» |
| Cambiar estado (confirma y **notifica al cliente**) | «marca el pedido 6651 como listo» |
| Cancelar pedido (con confirmación) | «cancela el pedido 6651» |
| Ventas del día con desglose | «cómo van las ventas hoy» |
| Inventario: agotados y stock bajo | «qué está agotado» |
| Reponer stock | «repón 10 unidades del chocoflán» |
| Marcar agotado (con confirmación) | «se acabó el chocoflán» |
| Tablero de entregas | «qué entregas están en camino» |
| Repartidores disponibles | «qué repartidores hay» |
| Asignar repartidor (con confirmación) | «asigna el pedido 6651 a Carlos» |
| Avisar demora al cliente (notif + correo) | «avisa demora del pedido 6651» |

### Secuencia de demo (empleado)

1. En la web: Dashboard del empleado → **Vincular con Alexa** (mismo flujo que el cliente) → código
2. «vincula mi cuenta con el código [X]» → «quién soy» → rol **empleado**
3. «cómo van las ventas hoy» → pedidos de hoy + total $ + desglose por estado
4. «qué pedidos están pendientes» → solo los programados en espera
5. «qué lleva el pedido [dígitos]» → items, cliente y total
6. «marca el pedido [dígitos] como listo» → *"¿lo cambio?"* → «sí» → ⭐ **al cliente le llega la notificación** (mostrarla en la web)
7. «qué está agotado» → inventario real con fotos
8. «repón 5 unidades del chocoflán» → *"pasó de 0 a 5"* → verificar en el panel
9. «se acabó el chocoflán» → *"¿seguro? bloqueará su venta"* → «no» → nada cambia
10. «qué repartidores están disponibles» → lista con carga activa
11. ⭐ Prueba de jerarquía: «cuáles son los números del negocio» → *"esa información es solo de gerencia y dirección"*

---

## 📊 GERENCIA — reportes tácticos

Todo lo del empleado, más:

| Capacidad | Frase |
|---|---|
| Números históricos del negocio (KPIs) | «cuáles son los números del negocio» |
| Productos más vendidos (ranking real) | «cuáles son los productos más vendidos» |
| Ventas de la semana vs semana anterior | «cómo van las ventas de la semana» |
| Equipo y clientes registrados | «cuántos empleados tenemos» |

### Secuencia de demo (gerencia)

1. Vincular con el código de su panel → «quién soy» → rol **gerencia**
2. «cuáles son los números del negocio» → ingresos pagados históricos, pedidos, clientes, productos
3. «cuáles son los productos más vendidos» → top con unidades e ingresos, **con fotos en pantalla**
4. «cómo van las ventas de la semana» → últimos 7 días **con % de cambio** vs los 7 anteriores
5. «cuántos empleados tenemos» → equipo por rol con nombres
6. ⭐ Prueba de jerarquía: «dame el resumen del mes» → *"eso es solo de dirección general"*

---

## 🏛 DIRECCIÓN GENERAL — reportes ejecutivos

Todo lo de gerencia, más:

| Capacidad | Frase |
|---|---|
| Resumen ejecutivo del mes (vs mes anterior, ticket promedio) | «dame el resumen del mes» |
| Auditoría del sistema (bitácora de movimientos) | «qué movimientos hubo en el sistema» |

### Secuencia de demo (dirección)

1. Vincular con el código de su panel → «quién soy» → rol **dirección general**
2. «dame el resumen del mes» → ingresos del mes, pedidos, ticket promedio y cierre del mes anterior
3. «qué movimientos hubo en el sistema» → bitácora: movimientos de hoy + los más recientes con autor
4. «cuáles son los productos más vendidos» → hereda todo lo de gerencia
5. «marca el pedido [dígitos] como completado» → hereda también toda la operación

---

## Características transversales (aplican a todo)

- **IA conversacional (DeepSeek) con RAG**: conoce el **catálogo completo** con precios y
  disponibilidad reales; mantiene memoria de la conversación («ese», «agrégalo», «el grande»);
  responde preguntas de repostería general; y es **honesta**: lo que no está en la base de
  datos "no lo manejamos". Además conoce sus propias capacidades y guía al usuario con la
  frase exacta según su rol.
- **APL en el 100% de las respuestas**: 6 plantillas del Alexa Design System + pantalla de
  respaldo universal, todas con la **fotografía real de la sucursal de fondo**, logo real,
  tipografía serif y paleta del sitio (verde oliva, dorado, arena). Responsivas (Echo Show
  redondo/rectangular) y **táctiles**: categorías, productos, botones de tamaño A/B,
  "Agregar al pedido" y "Ver horario" ejecutan acciones reales.
- **Dispositivos sin pantalla**: todo funciona igual por voz pura (Echo Dot); la IA sabe si
  hay pantalla y jamás dice "toca" en una bocina.
- **Lectura por partes** de respuestas largas: continuar / resumir / detener.
- **Confirmaciones** en toda acción importante (vaciar carrito, cambiar estado, marcar
  agotado, asignar repartidor) y limpieza de estado si el usuario cambia de tema.
- **Seguridad**: jerarquía de roles audible (empleado < gerencia < dirección), códigos de un
  solo uso, rate limiting, logout con revocación en el backend, sesión persistente cifrada.
- **Datos 100% dinámicos**: cero datos estáticos; todo se lee en vivo del backend
  (demostrable cambiando un precio en el panel y preguntando de nuevo).

---

## Mapa rápido a la rúbrica

| Criterio | Dónde se demuestra |
|---|---|
| Diseño conversacional (VUI) | Memoria («ese», «ya te decía»), confirmaciones, ayuda contextual, reprompts variados |
| Integración con el sitio web | Carrito sincronizado (cliente paso 10), vinculación por código, notificaciones cruzadas |
| APL / experiencia multimodal | 6 plantillas + respaldo universal, táctil, foto de sucursal, con/sin pantalla |
| Identidad visual | Logo real, paleta del sitio, tipografía serif, foto de la sucursal |
| Información dinámica | Total real del catálogo, precios en vivo, lectura por partes (continuar/resumir/detener) |
| Manejo de errores y seguridad | Jerarquía de roles, códigos un solo uso, rate limit, sesión expirada, timeouts con respaldo |
| Integración de IA | RAG con catálogo completo, honestidad, personalización por nombre y rol |
