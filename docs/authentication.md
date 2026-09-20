# Autenticación

CDOR usa Better Auth 1.6.25 sobre MySQL/MariaDB. Los IDs de Better Auth son ULID
`CHAR(26)` y las sesiones web y móviles comparten la misma autoridad.

## Variables privadas

El archivo local es `.env` en la raíz del repositorio:

```text
/home/m1ke/Proyectos 2026/cdor.online/.env
```

Es un archivo, no un directorio. Se abre con un editor; no se usa `cd .env`.
Está ignorado por Git y debe conservar permisos `600`.

Configuración de autenticación:

```dotenv
BETTER_AUTH_SECRET=<secreto aleatorio de al menos 32 caracteres>
BETTER_AUTH_URL=http://localhost:5173
AUTH_SIGN_UP_ENABLED=true

SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_CONNECTION_TIMEOUT_MS=10000
SMTP_USER=resend
SMTP_PASSWORD=<API key de Resend>
SMTP_FROM=no-reply@cdor.online

# OAuth opcional
GITHUB_CLIENT_ID=<OAuth App Client ID>
GITHUB_CLIENT_SECRET=<OAuth App Client Secret>
GOOGLE_CLIENT_ID=<OAuth Client ID>
GOOGLE_CLIENT_SECRET=<OAuth Client Secret>
```

En producción, `BETTER_AUTH_URL` y `ORIGIN` deben ser `https://cdor.online`. Las
variables anteriores se configuran también en el entorno privado de Hostinger;
nunca se convierten en `PUBLIC_*`.

El proveedor inicial es Resend. Su plan gratuito ofrece 3.000 correos al mes
con un límite de 100 al día. La integración usa SMTP para conservar la interfaz
reemplazable: host `smtp.resend.com`, puerto SMTPS `465`, usuario literal
`resend` y la API key como contraseña. El transporte exige TLS 1.2 como mínimo.

Antes de enviar:

1. añadir `cdor.online` en el panel **Domains** de Resend;
2. copiar exactamente en el DNS autoritativo de Hostinger los registros DKIM,
   SPF/MX y DMARC que Resend muestre, sin alterar sus valores;
3. mantener los nombres relativos (`resend._domainkey`, `send` y `_dmarc`),
   porque Hostinger añade `.cdor.online` automáticamente;
4. esperar al estado `verified`;
5. crear una API key limitada al envío desde `cdor.online`;
6. guardarla únicamente como `SMTP_PASSWORD` en `.env` y en las variables
   privadas del despliegue.

No hace falta crear el buzón `no-reply@cdor.online`: Resend autoriza el
remitente al verificar el dominio. Si en el futuro se desea recibir respuestas,
se configurará por separado una dirección de soporte.

## Seguridad

- Cookies host-only, `HttpOnly`, `SameSite=Lax` y `Secure` en producción.
- Bearer móvil firmado obligatoriamente.
- Comprobaciones de CSRF y origen habilitadas.
- El registro público se controla con `AUTH_SIGN_UP_ENABLED`.
- Verificación de correo obligatoria y sin inicio de sesión automático.
- Recuperación con respuesta equivalente para correos existentes y ausentes.
- Un reset de contraseña revoca las sesiones existentes.
- El bearer móvil solo se persistirá en Android Keystore/iOS Keychain durante
  M10; nunca en JavaScript, SQLite ni archivos en claro.

## GitHub y Google

Cuando se rellenan las dos variables de un proveedor, Better Auth publica su
botón en el acceso y crea o vincula la cuenta OAuth después del callback. Si
`AUTH_SIGN_UP_ENABLED=false`, los proveedores no pueden crear usuarios nuevos,
igual que el registro por correo.

Registra estas URLs en las consolas de los proveedores:

- GitHub: `https://cdor.online/api/auth/callback/github`
- Google: `https://cdor.online/api/auth/callback/google`

En desarrollo, sustituye el origen por `http://localhost:5173`. La web usa el
callback normal y la aplicación móvil usa el popup OAuth de Better Auth: recibe
un bearer firmado y lo guarda en el almacén seguro del sistema.

Cada acceso social crea o reutiliza una fila en `account` con `provider_id` igual
a `github` o `google`; la sesión compartida continúa apuntando al mismo `user`
que el acceso por correo.

## Validación SMTP

Después de crear el buzón y rellenar `.env`, se envía una prueba a una dirección
que pueda confirmarse:

```bash
source scripts/env.sh
pnpm smoke:smtp -- destinatario@dominio
```

El comando valida conexión, autenticación y envío. No imprime la contraseña, el
secreto ni la dirección completa del destinatario. La recepción debe
confirmarse antes de considerar M5 completado.
