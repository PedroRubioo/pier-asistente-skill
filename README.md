# Pier Asistente — Skill de Alexa

Asistente por voz de **Pier Repostería** (Huejutla de Reyes, Hidalgo). Skill es-MX
para Echo Show y bocinas sin pantalla, conectada en vivo al backend de la
plataforma de ventas ([pier-reposteria](https://github.com/PedroRubioo/pier-reposteria)).

## Qué hace

- **Catálogo en vivo**: productos, precios, categorías, promociones y destacados
  leídos del backend real (Render + PostgreSQL/Neon). Cero datos estáticos.
- **IA conversacional (DeepSeek)** con RAG: responde con datos reales, mantiene
  historial y estado (producto activo, listas), y adapta su lenguaje según el
  dispositivo tenga pantalla o no.
- **Carrito compartido con la web**: agregar por voz o tacto (con elección de
  tamaño y cantidades), consultar y vaciar con confirmación. Lo que se agrega
  por Alexa aparece en el carrito del sitio.
- **Cuenta**: pedidos, favoritos, reseñas y perfil del usuario autenticado.
- **Lectura por partes** de respuestas largas: continuar, resumir o detener.
- **6 interfaces APL** con la identidad del negocio (Headline, Cards Layout,
  Image List, Image Right/Left Detail, Multiple Choice), táctiles y responsivas.

## Inicio de sesión (3 métodos)

1. **Código de un solo uso** (principal, igual para cliente y empleado): se
   genera en el perfil de la web (expira en 5 min) y se dice por voz:
   «vincula mi cuenta con el código…». El JWT se persiste en S3 (7 días).
2. **Empleado por voz**: código de empleado + PIN (bcrypt, rate limit, bloqueo).
3. **Account Linking** OAuth 2.0 (Authorization Code Grant contra el backend).

«Cierra sesión» revoca el token en el backend (blacklist) y borra la persistencia.

## Estructura

```
index.js            Registro de handlers e interceptores
interactionModel.json  Modelo de voz (es-MX)
lib/                config, api (RAG+cache), ia (DeepSeek), apl (6 plantillas),
                    auth, horario, ssml, texto, respuesta
handlers/           publicos, cuenta, carrito, dialogo, conversacion, aplEventos
migration_login.sql Migración de login por voz (referencia; vive en el backend)
```

## Deploy

El código corre en una skill Alexa-hosted. El deploy es por git al repositorio
de Amazon (CodeCommit) + SMAPI para el interaction model:

```powershell
.\deploy-skill.ps1 "mensaje del cambio"
```

## Configuración

Copiar `config.json.example` a `Media/config.json` en el bucket S3 de la skill
con `DEEPSEEK_API_KEY` y `PIER_API_URL`.

---
Proyecto universitario — Ingeniería en Desarrollo y Gestión de Software, UTHH.
