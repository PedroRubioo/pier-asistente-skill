-- =====================================================================
-- MIGRACIÓN: Login para Alexa (Account Linking cliente + PIN empleado)
-- Esquema: core
-- Ejecutar en Neon SQL Editor de forma completa
-- =====================================================================

BEGIN;

-- =====================================================================
-- 1. Campos nuevos en tblusuarios
--    - codigo_empleado: ID corto de 3 a 6 dígitos para decir por voz
--      (solo se llena para empleado/gerencia/direccion_general)
--    - pin_hash: hash bcrypt del PIN de 6 dígitos
--    - intentos_pin_fallidos: contador para rate limiting
--    - pin_bloqueado_hasta: timestamp de desbloqueo
--    - pin_actualizado_at: cuándo se rotó el PIN por última vez
-- =====================================================================
ALTER TABLE core.tblusuarios
  ADD COLUMN IF NOT EXISTS codigo_empleado      INTEGER,
  ADD COLUMN IF NOT EXISTS pin_hash             VARCHAR(255),
  ADD COLUMN IF NOT EXISTS intentos_pin_fallidos INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_bloqueado_hasta  TIMESTAMP,
  ADD COLUMN IF NOT EXISTS pin_actualizado_at   TIMESTAMP;

-- Índice único PARCIAL: solo aplica cuando codigo_empleado NO es NULL
-- (clientes no tienen codigo_empleado, son NULL, no chocan)
CREATE UNIQUE INDEX IF NOT EXISTS idx_tblusuarios_codigo_empleado
  ON core.tblusuarios(codigo_empleado)
  WHERE codigo_empleado IS NOT NULL;

-- =====================================================================
-- 2. Tabla tbloauth_codes
--    Almacena los codes temporales del flujo OAuth Authorization Code Grant
--    de Alexa Account Linking. Cada code expira en 5 minutos y se marca
--    como usado tras intercambiarse por un access_token.
-- =====================================================================
CREATE TABLE IF NOT EXISTS core.tbloauth_codes (
  id            SERIAL PRIMARY KEY,
  code          VARCHAR(64) NOT NULL UNIQUE,
  usuario_id    INTEGER NOT NULL REFERENCES core.tblusuarios(id) ON DELETE CASCADE,
  client_id     VARCHAR(50) NOT NULL,
  redirect_uri  TEXT NOT NULL,
  state         TEXT,
  expira_en     TIMESTAMP NOT NULL,
  usado         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tbloauth_codes_code
  ON core.tbloauth_codes(code);

CREATE INDEX IF NOT EXISTS idx_tbloauth_codes_expira
  ON core.tbloauth_codes(expira_en)
  WHERE usado = FALSE;

-- =====================================================================
-- 3. Tabla tbllogin_intentos_voz
--    Auditoría de intentos de login por voz (PIN empleado).
--    Permite rate limiting por device_id y forense si hay abuso.
-- =====================================================================
CREATE TABLE IF NOT EXISTS core.tbllogin_intentos_voz (
  id               SERIAL PRIMARY KEY,
  device_id        VARCHAR(255) NOT NULL,
  codigo_empleado  INTEGER,
  exito            BOOLEAN NOT NULL,
  motivo_fallo     VARCHAR(100),
  created_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Índice para consultas de rate limiting:
-- "cuántos intentos fallidos hubo de este device en los últimos 15 minutos"
CREATE INDEX IF NOT EXISTS idx_tbllogin_intentos_device_fecha
  ON core.tbllogin_intentos_voz(device_id, created_at DESC);

-- =====================================================================
-- 4. Comentarios para documentar el esquema
-- =====================================================================
COMMENT ON COLUMN core.tblusuarios.codigo_empleado IS
  'Código corto (3-6 dígitos) usado para login por voz de empleados en Alexa. NULL para clientes.';
COMMENT ON COLUMN core.tblusuarios.pin_hash IS
  'Hash bcrypt del PIN de 6 dígitos para login por voz. Solo se usa con codigo_empleado.';
COMMENT ON COLUMN core.tblusuarios.intentos_pin_fallidos IS
  'Contador de intentos fallidos consecutivos. Se resetea a 0 en login exitoso.';
COMMENT ON COLUMN core.tblusuarios.pin_bloqueado_hasta IS
  'Si está en el futuro, el PIN está bloqueado por demasiados intentos fallidos.';
COMMENT ON TABLE core.tbloauth_codes IS
  'Códigos OAuth temporales (5 min) para Account Linking de Alexa (Authorization Code Grant).';
COMMENT ON TABLE core.tbllogin_intentos_voz IS
  'Auditoría de intentos de login por voz para empleados (forense + rate limiting).';

COMMIT;

-- =====================================================================
-- VERIFICACIÓN POST-MIGRACIÓN
-- Corre esto al final para confirmar que todo se aplicó bien:
-- =====================================================================
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'core'
--    AND table_name = 'tblusuarios'
--    AND column_name IN ('codigo_empleado','pin_hash','intentos_pin_fallidos','pin_bloqueado_hasta','pin_actualizado_at');
--
-- SELECT table_name
--   FROM information_schema.tables
--  WHERE table_schema = 'core'
--    AND table_name IN ('tbloauth_codes','tbllogin_intentos_voz');
