# @whatauth/sdk

Official JavaScript & TypeScript SDK for **WhatAuth** — Passwordless QR & 2FA Authentication via WhatsApp.

[![npm version](https://img.shields.io/npm/v/@whatauth/sdk.svg)](https://www.npmjs.com/package/@whatauth/sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)

---

## 📖 ¿Qué es WhatAuth SDK?

**WhatAuth SDK** permite integrar autenticación sin contraseña (*passwordless*) y verificación en dos pasos (2FA) en cualquier aplicación web mediante **WhatsApp**.

Los usuarios inician sesión escaneando un código QR dinámico desde su teléfono o haciendo clic en un enlace directo hacia WhatsApp, sin necesidad de recordar contraseñas ni esperar códigos SMS.

### ⚙️ ¿Cómo funciona el flujo de autenticación?

```text
[ Tu Web (SDK) ] <--(WebSocket)--> [ Servidor WhatAuth ] <--(WhatsApp API)--> [ Usuario / WhatsApp ]
       |                                                                               |
       |-- 1. Inicia conexión WebSocket con apiKey y dominio ------------------------->|
       |<-- 2. Recibe sesión: QR (Base64), enlace directo y PIN -----------------------|
       |-- 3. Renderiza QR y PIN en el DOM automáticamente ----------------------------|
       |                                                                               |
       |                                   4. El usuario escanea el QR o pulsa el link |
       |                                      y confirma en su chat de WhatsApp ------>|
       |<-- 5. Recibe evento 'success' con Token JWT y datos del usuario --------------|
       |-- 6. Almacena sesión (sessionStorage / httpOnly) y redirige (redirectUrl) --->|
```

1. **Conexión en tiempo real**: El SDK se conecta a los servidores de WhatAuth vía WebSocket (`socket.io-client`).
2. **Generación de QR y PIN**: Se crea una sesión con código QR dinámico, enlace a WhatsApp y PIN de validación.
3. **Enlace automático al DOM**: Los elementos HTML especificados (`<img>`, `<a>`, `<span>`) se actualizan automáticamente con el QR, link y PIN.
4. **Validación en WhatsApp**: El usuario envía el PIN generado a través de WhatsApp.
5. **Autenticación confirmada**: El servidor notifica la validación en tiempo real y el SDK emite los datos del usuario autenticado junto con su token JWT.
6. **Manejo de sesión**: Guarda el token automáticamente o lo envía a tu backend para establecer cookies seguras.

---

## 🚀 Instalación

```bash
npm install @whatauth/sdk
# o
pnpm add @whatauth/sdk
# o
yarn add @whatauth/sdk
```

---

## ⚡ Inicio Rápido (Quick Start)

### En aplicaciones modernas (React, Next.js, Vue, Svelte, Vite)

```typescript
import { WhatAuth } from '@whatauth/sdk';

// 1. Instanciar el cliente con los IDs de tus elementos HTML
const auth = new WhatAuth({
  apiKey: 'wk_live_TU_API_KEY',
  domain: 'tudominio.com',
  qrId: 'whatauth-qr',          // <img id="whatauth-qr" />
  linkId: 'whatauth-link',      // <a id="whatauth-link">Abrir en WhatsApp</a>
  pinId: 'whatauth-pin',        // <span id="whatauth-pin"></span>
  statusId: 'whatauth-status',  // <div id="whatauth-status"></div>
  redirectUrl: '/dashboard'     // Redirección opcional post-login
});

// 2. Escuchar los eventos del ciclo de vida
auth.on('connected', ({ socketId }) => {
  console.log('Conectado a WhatAuth:', socketId);
});

auth.on('qr', (session) => {
  console.log('Nuevo QR generado. PIN de confirmación:', session.pin);
});

auth.on('success', (data) => {
  console.log('¡Usuario autenticado!', data.user?.phone, data.token);
});

auth.on('expired', () => {
  console.log('El código QR ha expirado.');
});

auth.on('error', (err) => {
  console.error('Error de autenticación:', err);
});

// 3. Iniciar el proceso
auth.init();
```

---

## 🎯 Eventos Disponibles

Puedes suscribirte a los eventos mediante `auth.on(evento, callback)`. Además, el SDK despacha eventos nativos en `window` con el prefijo `whatauth:<evento>` (por ejemplo, `whatauth:success`).

| Evento | Parámetro recibido | Descripción |
| :--- | :--- | :--- |
| `connected` | `{ socketId: string }` | Se estableció conexión con el servidor WebSocket. |
| `qr` | `WhatAuthSessionData` | Se recibió el QR, PIN y enlace de WhatsApp para la sesión. |
| `success` | `WhatAuthSuccessData` | El usuario confirmó la autenticación en WhatsApp exitosamente. |
| `expired` | `{ session: WhatAuthSessionData }` | El tiempo de validez del QR expiró sin ser escaneado. |
| `error` | `WhatAuthErrorData` | Ocurrió un error de autenticación o autorización. |
| `disconnected` | `{ reason: string }` | El socket se desconectó del servidor. |
| `authEndpointSuccess` | `any` | Respuesta exitosa recibida desde tu backend (modo `httpOnly`). |
| `authEndpointError` | `{ status?: number, error?: string }` | Error al enviar la sesión a tu backend (modo `httpOnly`). |

---

## 💾 Modos de Persistencia (`storage`)

El SDK puede gestionar la persistencia del token de sesión automáticamente según el modo configurado:

1. **`'sessionStorage'`** *(por defecto)*:
   - Guarda `whatauth_token` con el JWT recibido.
   - Guarda `whatauth_user` con los datos del usuario (número de teléfono, nombre, etc.) en `sessionStorage`.

2. **`'httpOnly'`**:
   - Envía automáticamente un `POST` con los datos del usuario y token hacia el endpoint de tu propio backend (`authEndpoint`).
   - Permite que tu backend genere y fije cookies de sesión `HttpOnly` y `Secure`, evitando exponer el JWT en el cliente.

3. **`'none'`**:
   - No almacena nada en el navegador. La aplicación maneja el token y los datos exclusivamente a través del evento `success`.

---

## 🛠️ Métodos de la Clase `WhatAuth`

- **`auth.init()`**: Valida la configuración obligatoria (`apiKey`) e inicia la conexión.
- **`auth.connect()`**: Conecta el socket en tiempo real y solicita el código QR.
- **`auth.on(event, callback)`**: Registra una función listener para un evento. Retorna la instancia de `WhatAuth` para encadenamiento.
- **`auth.destroy()`**: Cancela temporizadores de expiración activos y desconecta el socket.
- **`auth.updateStatus(text)`**: Actualiza el texto del elemento de estado (`statusId`) en el DOM.

---

## 🛡️ Opciones de Configuración

| Opción | Tipo | Valor por defecto | Descripción |
| :--- | :--- | :--- | :--- |
| `apiKey` | `string` | **Requerido** | Tu API Key pública de WhatAuth (`wk_live_...`). |
| `domain` | `string` | `window.location.host` | Dominio registrado y autorizado en tu consola de WhatAuth. |
| `wsUrl` | `string` | `https://api.whatauth.com` | URL del servidor WebSocket de WhatAuth (en local usa `http://localhost:3000`). |
| `storage` | `'sessionStorage' \| 'httpOnly' \| 'none'` | `'sessionStorage'` | Modo de almacenamiento de la sesión tras autenticarse. |
| `authEndpoint` | `string` | `''` | URL de tu backend para enviar la sesión (requerido si `storage: 'httpOnly'`). |
| `redirectUrl` | `string` | `''` | URL de destino a la que redirigir al usuario tras autenticarse con éxito. |
| `sessionDuration` | `number` | `300` | Tiempo de expiración del código QR en segundos (por defecto 5 minutos). |
| `qrId` | `string` | `'whatauth-qr'` | ID del elemento `<img>` donde se inyectará el código QR. |
| `linkId` | `string` | `'whatauth-link'` | ID del elemento `<a>` o botón para abrir WhatsApp directamente. |
| `pinId` | `string` | `'whatauth-pin'` | ID del elemento para mostrar el PIN de verificación. |
| `statusId` | `string` | `'whatauth-status'` | ID del elemento para mostrar el estado del proceso (*Conectando*, *Listo*, etc.). |
| `expiredId` | `string` | `'whatauth-expired'` | ID del contenedor a mostrar cuando el código QR haya expirado. |

---

## 📄 Licencia

MIT © [WhatAuth Tech](https://whatauth.com)
