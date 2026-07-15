# Pier Asistente · Guion de demostración

**Skill de Alexa (español de México) para Pier Repostería** — se abre diciendo *«Alexa, abre pier asistente»*.

Pier Asistente es el escaparate por voz de la plataforma digital de Pier Repostería. Permite explorar el catálogo, armar el carrito de compras, dar seguimiento a los pedidos y operar el negocio con manos libres, según el rol de quien la usa. El pago y la confirmación de la compra se realizan siempre en el sitio web: el carrito que se arma por voz aparece sincronizado en la página, listo para completarse.

Este documento describe todo lo que la skill puede hacer, organizado por rol, junto con una secuencia de demostración para cada uno. Los pasos marcados con ⭐ son los momentos clave de la evaluación.

---

## Inicio de sesión (idéntico para todos los roles)

1. El usuario entra a su panel en el sitio web (el cliente a su perfil; el personal a su dashboard).
2. Pulsa el botón **“Vincular con Alexa”**. El sistema genera un **código de seis dígitos**, de un solo uso, que expira en cinco minutos.
3. El usuario le dice a Alexa: *«vincula mi cuenta con el código …»*, y la skill lo saluda por su nombre.
4. La sesión persiste hasta siete días entre conversaciones. Al decir *«cierra sesión»*, el token se revoca en el servidor y el dispositivo queda desvinculado de inmediato.

**Medidas de seguridad del acceso:** el código nace dentro de una sesión web ya autenticada y solo puede canjearse una vez; los intentos fallidos se limitan por dispositivo (cinco intentos provocan un bloqueo de quince minutos); y toda acción destructiva exige confirmación por voz antes de ejecutarse. Como métodos alternos existen la vinculación oficial de Amazon (Account Linking con OAuth 2.0) y el acceso de empleados mediante código y PIN cifrado con bcrypt.

---

## 🌐 Público — exploración sin cuenta

Cualquier persona puede consultar la repostería sin identificarse.

| Capacidad | Frase de ejemplo |
|---|---|
| Escuchar el catálogo completo, leído por partes | «qué productos tienen» |
| Controlar la lectura: continuar, resumir o detener | «sí» · «continúa» · «dame un resumen» · «basta» |
| Recorrer las categorías con tarjetas táctiles | «qué categorías manejan» |
| Consultar el precio y la ficha de cualquier producto | «cuánto cuesta el chocoflán» |
| Pedir recomendaciones y conocer lo más vendido | «qué me recomiendas» |
| Conocer las promociones vigentes | «qué promociones hay» |
| Preguntar el horario, con estado abierto/cerrado en tiempo real | «a qué hora abren» |
| Obtener la ubicación y el teléfono | «dónde están» |
| Cotizar el envío a domicilio por colonia | «hacen envíos a la colonia adolfo lópez mateos» |
| Conversar libremente con la IA, siempre fiel al catálogo | «qué pastel me conviene para una boda» |
| Recibir ayuda adaptada al momento de la conversación | «ayuda» |

### Secuencia de demostración

| # | Qué decir o hacer | Qué debe suceder |
|---|---|---|
| 1 | «abre pier asistente» | Pantalla de bienvenida con la **fotografía real de la sucursal** de fondo, el logotipo y la tipografía de la marca |
| 2 | «qué categorías manejan» | Tarjetas táctiles con las categorías reales del catálogo |
| 3 | **Tocar una categoría** | Lista de productos de esa categoría, con fotos y precios |
| 4 | **Tocar un producto** | Ficha del producto con imagen, precios y el botón “Agregar al pedido” |
| 5 | «qué productos tienen» | Menciona productos reales y dice **cuántos hay en total**, ofreciendo continuar |
| 6 | «sí» → después «dame un resumen» | Lee la siguiente tanda y luego condensa lo restante: cantidad, categorías y rango de precios |
| 6b | «qué me recomiendas» → «continúa» | Cada respuesta muestra en pantalla los productos que menciona, con sus fotografías |
| 7 | «hacen envíos a la colonia [una real]» | Tarifa real de la zona; con una colonia inexistente, lo dice con honestidad y ofrece recoger en tienda |
| 8 | ⭐ «tienen tiramisú» | *“Ese no lo manejamos”* y sugiere lo más parecido — la IA nunca inventa productos ni precios |
| 9 | «a qué hora abren» | Responde con el estado abierto o cerrado calculado a la hora actual |

---

## 👤 Cliente — cuenta vinculada

El cliente conserva todo lo anterior y además administra su cuenta y su carrito.

| Capacidad | Frase de ejemplo |
|---|---|
| Agregar productos al carrito, con tamaño y cantidad | «agrega dos chocoflanes grandes al carrito» |
| Elegir el tamaño por voz o con botones táctiles | «chico» / «grande», o tocar la opción A/B |
| Quitar un producto específico del carrito | «quita el flan napolitano del carrito» |
| Escuchar el carrito con su total exacto | «qué tengo en mi carrito» |
| Vaciar el carrito, con confirmación previa | «vacía mi carrito» → «sí» / «no» |
| Volver a pedir lo que ha comprado antes | «pide lo de siempre» |
| Revisar sus pedidos y el estado del más reciente | «mis pedidos» · «cómo va mi último pedido» |
| Administrar sus favoritos | «agrega el cheesecake oreo a mis favoritos» |
| Escuchar sus notificaciones (quedan marcadas como leídas) | «qué notificaciones tengo» |
| Consultar sus reseñas y su perfil | «mis reseñas» · «quién soy» |
| Cerrar sesión con revocación inmediata del acceso | «cierra sesión» |

### Secuencia de demostración

| # | Qué decir o hacer | Qué debe suceder |
|---|---|---|
| 1 | En la web: Perfil → “Vincular con Alexa” | Se genera el código de seis dígitos |
| 2 | «vincula mi cuenta con el código [X]» | La skill saluda al cliente por su nombre |
| 3 | «quién soy» | Nombre, correo y rol leídos de la base de datos |
| 4 | «agrega dos chocoflanes grandes al carrito» | Los agrega y confirma el total ($760) |
| 5 | «agrega un flan napolitano al carrito» | Pregunta el tamaño; se responde por voz o **tocando el botón A/B** |
| 6 | «quita el flan napolitano del carrito» | Elimina únicamente ese producto |
| 7 | «pide lo de siempre» | Recupera sus compras anteriores reales; tocar una la agrega de nuevo |
| 8 | «qué tengo en mi carrito» | Resumen hablado con el total exacto |
| 9 | «quiero hacer mi pedido» | La IA lo dirige con naturalidad: *“tu carrito ya te espera en la web para confirmarlo y pagarlo”* |
| 10 | ⭐ **Abrir el sitio web** | El carrito aparece idéntico al armado por voz: la integración skill–sitio, en vivo |
| 11 | «agrega el cheesecake oreo a mis favoritos» | Se guarda; el corazón aparece en la página |
| 12 | «qué notificaciones tengo» | Las lee en voz alta y las deja marcadas como leídas |
| 13 | «vacía mi carrito» → «no» → repetir → «sí» | Primero respeta la negativa; después vacía. Confirmación de acciones destructivas |
| 14 | «cierra sesión» → «quién soy» | El acceso queda revocado: la skill ya no reconoce al usuario |

---

## 👔 Empleado — operación del mostrador

El empleado conserva todo lo del cliente y suma la operación diaria del negocio.

| Capacidad | Frase de ejemplo |
|---|---|
| Resumen de los pedidos por estado | «cómo van los pedidos» |
| Pedidos filtrados por estado | «qué pedidos están pendientes» |
| Detalle de un pedido, referido por sus últimos dígitos | «qué lleva el pedido 6651» |
| Cambiar el estado de un pedido (avisa al cliente automáticamente) | «marca el pedido 6651 como listo» |
| Cancelar un pedido, con confirmación | «cancela el pedido 6651» |
| Ventas del día con desglose por estado | «cómo van las ventas hoy» |
| Inventario: productos agotados y con poco stock | «qué está agotado» |
| Reponer existencias | «repón 10 unidades del chocoflán» |
| Marcar un producto como agotado, con confirmación | «se acabó el chocoflán» |
| Tablero de entregas a domicilio | «qué entregas están en camino» |
| Repartidores y su disponibilidad | «qué repartidores hay» |
| Asignar un repartidor a un pedido, con confirmación | «asigna el pedido 6651 a Carlos» |
| Avisar una demora al cliente (notificación y correo) | «avisa demora del pedido 6651» |

### Secuencia de demostración

| # | Qué decir o hacer | Qué debe suceder |
|---|---|---|
| 1 | En la web: Dashboard del empleado → “Vincular con Alexa” | Mismo flujo de código que el cliente |
| 2 | «vincula mi cuenta con el código [X]» → «quién soy» | Confirma el rol de **empleado** |
| 3 | «cómo van las ventas hoy» | Pedidos del día, monto total y desglose por estado |
| 4 | «qué pedidos están pendientes» | Solo los pedidos programados en espera |
| 5 | «qué lleva el pedido [dígitos]» | Productos, cliente y total del pedido |
| 6 | ⭐ «marca el pedido [dígitos] como listo» → «sí» | Cambia el estado y **el cliente recibe su notificación al instante** (mostrarla en la web) |
| 7 | «qué está agotado» | Inventario real, con fotografías |
| 8 | «repón 5 unidades del chocoflán» | Actualiza el stock y lo confirma: *“pasó de 0 a 5”* |
| 9 | «se acabó el chocoflán» → «no» | Pide confirmación y respeta la negativa: nada cambia |
| 10 | «qué repartidores están disponibles» | Lista real con la carga de cada repartidor |
| 11 | ⭐ «cuáles son los números del negocio» | *“Esa información es solo de gerencia y dirección”* — la jerarquía de roles, audible |

---

## 📊 Gerencia — reportes tácticos

La gerencia conserva toda la operación del empleado y suma los reportes del negocio.

| Capacidad | Frase de ejemplo |
|---|---|
| Números históricos del negocio (ingresos, pedidos, clientes) | «cuáles son los números del negocio» |
| Ranking real de los productos más vendidos | «cuáles son los productos más vendidos» |
| Ventas de la semana, comparadas con la anterior | «cómo van las ventas de la semana» |
| Composición del equipo y clientes registrados | «cuántos empleados tenemos» |

### Secuencia de demostración

| # | Qué decir o hacer | Qué debe suceder |
|---|---|---|
| 1 | Vincular con el código de su panel → «quién soy» | Confirma el rol de **gerencia** |
| 2 | «cuáles son los números del negocio» | Ingresos pagados históricos, pedidos totales, clientes activos y productos en catálogo |
| 3 | «cuáles son los productos más vendidos» | Top de ventas con unidades e ingresos, con fotografías en pantalla |
| 4 | «cómo van las ventas de la semana» | Últimos siete días **con el porcentaje de cambio** frente a la semana anterior |
| 5 | «cuántos empleados tenemos» | El equipo por rol, con nombres, y el total de clientes |
| 6 | ⭐ «dame el resumen del mes» | *“Eso es solo de dirección general”* — segundo nivel de la jerarquía |

---

## 🏛 Dirección General — reportes ejecutivos

La dirección hereda todo lo anterior y accede a la información más sensible.

| Capacidad | Frase de ejemplo |
|---|---|
| Resumen ejecutivo del mes, con ticket promedio y comparativa | «dame el resumen del mes» |
| Bitácora de auditoría del sistema | «qué movimientos hubo en el sistema» |

### Secuencia de demostración

| # | Qué decir o hacer | Qué debe suceder |
|---|---|---|
| 1 | Vincular con el código de su panel → «quién soy» | Confirma el rol de **dirección general** |
| 2 | «dame el resumen del mes» | Ingresos del mes, número de pedidos, ticket promedio y cierre del mes anterior |
| 3 | «qué movimientos hubo en el sistema» | La bitácora: movimientos de hoy y los más recientes, con su autor |
| 4 | «cuáles son los productos más vendidos» | Hereda todos los reportes de gerencia |
| 5 | «marca el pedido [dígitos] como completado» | Hereda también toda la operación del empleado |

---

## Características presentes en toda la skill

- **Inteligencia artificial con datos reales.** La IA conoce el catálogo completo con precios y disponibilidad al momento, mantiene el hilo de la conversación (entiende «ese», «agrégalo», «el grande»), responde dudas generales de repostería y es honesta: lo que no existe en la base de datos, “no lo manejamos”. Además conoce sus propias funciones y le indica al usuario la frase exacta según su rol.
- **Experiencia visual en el 100 % de las respuestas.** Seis plantillas del Alexa Design System más una pantalla de respaldo universal garantizan que ningún turno quede sin interfaz. Todas comparten la fotografía real de la sucursal como fondo, el logotipo, la tipografía serif y la paleta del sitio (verde oliva, dorado y arena), con **encabezado de marca y pie de página presentes en cada pantalla**, y se adaptan a pantallas rectangulares y redondas.
- **Lo que se dice, se ve.** Cuando la inteligencia artificial menciona productos en la conversación libre (una recomendación, un «continúa», un «sí»), esos productos aparecen automáticamente en pantalla: como lista con fotografías si son varios, o como ficha con el botón "Agregar al pedido" si es uno.
- **Interacción táctil real.** Tocar una categoría, un producto, un botón de tamaño, “Agregar al pedido” o “Ver horario” ejecuta la acción, no solo la muestra.
- **Compatibilidad con bocinas sin pantalla.** Todo funciona por voz pura; la skill detecta el dispositivo y nunca pide “tocar” en un Echo Dot.
- **Respuestas largas administradas.** El usuario decide: continuar, pedir un resumen o detener la lectura.
- **Confirmaciones y contexto.** Toda acción importante se confirma antes de ejecutarse, y si el usuario cambia de tema, las confirmaciones pendientes caducan solas.
- **Seguridad de extremo a extremo.** Jerarquía de roles verificable por voz, códigos de un solo uso, límite de intentos por dispositivo, cierre de sesión con revocación en el servidor y manejo de sesiones expiradas.
- **Información cien por ciento dinámica.** No existe ningún dato estático: todo se consulta en vivo al servidor. Puede demostrarse cambiando un precio en el panel y preguntando de nuevo.

---

## Correspondencia con la rúbrica

| Criterio | Dónde se demuestra |
|---|---|
| Diseño conversacional (VUI) | Memoria del contexto, confirmaciones, ayuda contextual y respuestas que nunca se repiten igual |
| Integración con el sitio web | Carrito sincronizado (cliente, paso 10), vinculación por código y notificaciones cruzadas |
| APL y experiencia multimodal | Seis plantillas más respaldo universal, todo producto mencionado se ve en pantalla, interacción táctil y adaptación con y sin pantalla |
| Diseño visual e identidad | Logotipo y fotografía reales de la sucursal, paleta y tipografía del sitio |
| Funcionalidad e información dinámica | Totales y precios en vivo, y lectura por partes: continuar, resumir o detener |
| Manejo de errores y seguridad | Jerarquía de roles, códigos de un solo uso, límites de intentos y sesiones con revocación |
| Integración de IA | Respuestas contextualizadas y personalizadas, siempre coherentes con la base de datos |

---

*Recomendación para la presentación: generar cada código de vinculación justo antes de su sección (expiran en cinco minutos) y decir «cierra sesión» entre rol y rol, para que el cambio de privilegios se aprecie en vivo.*
