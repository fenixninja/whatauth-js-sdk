import { io, Socket } from 'socket.io-client';
import {
  WhatAuthConfig,
  WhatAuthSessionData,
  WhatAuthSuccessData,
  WhatAuthErrorData,
  WhatAuthEventListener
} from './types';

export * from './types';

const DEFAULTS: Required<Omit<WhatAuthConfig, 'apiKey' | 'authEndpoint' | 'redirectUrl'>> & {
  apiKey: string;
  authEndpoint: string;
  redirectUrl: string;
} = {
  wsUrl:
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:3000'
      : 'https://api.whatauth.com',
  apiKey: '',
  domain: typeof window !== 'undefined' ? window.location.host || 'localhost' : 'localhost',
  storage: 'sessionStorage',
  authEndpoint: '',
  redirectUrl: '',
  qrId: 'whatauth-qr',
  linkId: 'whatauth-link',
  expiredId: 'whatauth-expired',
  statusId: 'whatauth-status',
  pinId: 'whatauth-pin',
  sessionDuration: 300
};

function getScriptConfig(): Partial<WhatAuthConfig> {
  if (typeof document === 'undefined') return {};
  const targetScript =
    document.querySelector('script[data-api-key], script[data-key]') ||
    document.querySelector('script[src*="whatauth"]');
  if (!targetScript) return {};
  const dataset = (targetScript as HTMLScriptElement).dataset || {};
  const config: Partial<WhatAuthConfig> = {};

  const mapping: Partial<Record<keyof WhatAuthConfig, any>> = {
    apiKey:
      dataset.apiKey ||
      dataset.key ||
      targetScript.getAttribute('data-api-key') ||
      targetScript.getAttribute('data-key') ||
      undefined,
    wsUrl: dataset.wsUrl || targetScript.getAttribute('data-ws-url') || undefined,
    domain: dataset.domain || targetScript.getAttribute('data-domain') || undefined,
    storage: (dataset.storage || targetScript.getAttribute('data-storage') || undefined) as any,
    authEndpoint: dataset.authEndpoint || targetScript.getAttribute('data-auth-endpoint') || undefined,
    redirectUrl: dataset.redirectUrl || targetScript.getAttribute('data-redirect-url') || undefined,
    qrId: dataset.qrId || targetScript.getAttribute('data-qr-id') || undefined,
    linkId: dataset.linkId || targetScript.getAttribute('data-link-id') || undefined,
    expiredId: dataset.expiredId || targetScript.getAttribute('data-expired-id') || undefined,
    statusId: dataset.statusId || targetScript.getAttribute('data-status-id') || undefined,
    pinId: dataset.pinId || targetScript.getAttribute('data-pin-id') || undefined,
    sessionDuration: dataset.sessionDuration
      ? parseInt(dataset.sessionDuration, 10)
      : undefined
  };

  (Object.keys(mapping) as (keyof WhatAuthConfig)[]).forEach((key) => {
    const val = mapping[key];
    if (val !== null && val !== undefined && val !== '') {
      (config as any)[key] = val;
    }
  });

  return config;
}

export class WhatAuth {
  public options: typeof DEFAULTS;
  public socket: Socket | null = null;
  public session: WhatAuthSessionData | null = null;
  private expirationTimer: any = null;
  private listeners: Record<string, WhatAuthEventListener[]> = {};

  constructor(customConfig: Partial<WhatAuthConfig> = {}) {
    const scriptOpts = getScriptConfig();
    const globalOpts =
      typeof window !== 'undefined' && (window as any).WHATAUTH_CONFIG
        ? (window as any).WHATAUTH_CONFIG
        : {};
    this.options = Object.assign({}, DEFAULTS, globalOpts, scriptOpts, customConfig);
  }

  public on(event: 'connected' | 'qr' | 'success' | 'error' | 'expired' | 'disconnected' | string, cb: WhatAuthEventListener): this {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
    return this;
  }

  public emit(event: string, data?: any): void {
    if (this.listeners[event]) {
      this.listeners[event].forEach((cb) => {
        try {
          cb(data);
        } catch (e) {
          console.error('[WhatAuth SDK] Listener error:', e);
        }
      });
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`whatauth:${event}`, { detail: data }));
    }
  }

  public init(): void {
    if (!this.options.apiKey) {
      console.error('[WhatAuth SDK] Falta el parámetro obligatorio "apiKey".');
      return;
    }
    this.connect();
  }

  public connect(): void {
    const { wsUrl, apiKey, domain } = this.options;
    const resolvedDomain =
      domain ||
      (typeof window !== 'undefined'
        ? window.location.host || window.location.hostname || 'localhost'
        : 'localhost');

    this.updateStatus('Conectando...');

    this.socket = io(wsUrl, {
      auth: {
        key: apiKey,
        domain: resolvedDomain,
        origin:
          typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null'
            ? window.location.origin
            : ''
      },
      query: {
        domain: resolvedDomain
      },
      extraHeaders: {
        'x-api-key': apiKey,
        'x-whatauth-domain': resolvedDomain
      },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      this.updateStatus('Conectado. Solicitando QR...');
      this.emit('connected', { socketId: this.socket?.id });
      this.socket?.emit('req_outside_qr_auth', { key: apiKey, domain: resolvedDomain });
    });

    this.socket.on('res_outside_qr_auth', (data: WhatAuthSessionData) => {
      this.session = data;
      this.bindQrToDOM(data);
      this.startExpirationTimer(data.expiresIn || this.options.sessionDuration);
      this.emit('qr', data);
    });

    this.socket.on('outside_auth_success', async (data: WhatAuthSuccessData) => {
      this.clearExpirationTimer();
      this.updateStatus('¡Autenticado con éxito!');
      this.emit('success', data);
      await this.handleStorageSuccess(data);
    });

    this.socket.on('outside_auth_error', (data: WhatAuthErrorData) => {
      this.updateStatus(`Error: ${data.error || 'No autorizado'}`);
      this.emit('error', data);
    });

    this.socket.on('disconnect', (reason: string) => {
      this.updateStatus('Desconectado');
      this.emit('disconnected', { reason });
    });
  }

  private bindQrToDOM(data: WhatAuthSessionData): void {
    if (typeof document === 'undefined') return;
    const { qrId, linkId, pinId, expiredId } = this.options;

    const elExpired = document.getElementById(expiredId);
    if (elExpired) elExpired.style.display = 'none';

    const elQr = document.getElementById(qrId);
    if (elQr) {
      const qrSrc = data.qrBase64 || data.qrDataUrl || data.qrUrlData || '';
      if (elQr.tagName === 'IMG') {
        (elQr as HTMLImageElement).src = qrSrc;
      } else {
        elQr.style.backgroundImage = `url("${qrSrc}")`;
        elQr.style.backgroundSize = 'contain';
        elQr.style.backgroundRepeat = 'no-repeat';
      }
      elQr.style.display = '';
      elQr.style.opacity = '1';
    }

    const elLink = document.getElementById(linkId);
    if (elLink) {
      if (elLink.tagName === 'A') {
        (elLink as HTMLAnchorElement).href = data.walink || '#';
        (elLink as HTMLAnchorElement).target = '_blank';
      } else {
        elLink.onclick = () => window.open(data.walink, '_blank');
      }
      elLink.style.display = '';
      elLink.style.pointerEvents = '';
      elLink.style.opacity = '1';
    }

    const elPin = document.getElementById(pinId);
    if (elPin && data.pin) elPin.textContent = data.pin;

    this.updateStatus('Listo para escanear');
  }

  private startExpirationTimer(seconds: number): void {
    this.clearExpirationTimer();
    this.expirationTimer = setTimeout(() => {
      this.handleExpiration();
    }, seconds * 1000);
  }

  private clearExpirationTimer(): void {
    if (this.expirationTimer) {
      clearTimeout(this.expirationTimer);
      this.expirationTimer = null;
    }
  }

  private handleExpiration(): void {
    if (typeof document === 'undefined') return;
    const { expiredId, qrId, linkId } = this.options;

    const elExpired = document.getElementById(expiredId);
    if (elExpired) elExpired.style.display = '';

    const elQr = document.getElementById(qrId);
    if (elQr) elQr.style.opacity = '0.2';

    const elLink = document.getElementById(linkId);
    if (elLink) {
      elLink.style.pointerEvents = 'none';
      elLink.style.opacity = '0.5';
    }

    this.updateStatus('QR Expirado');
    this.emit('expired', { session: this.session });
  }

  public updateStatus(text: string): void {
    if (typeof document === 'undefined') return;
    const elStatus = document.getElementById(this.options.statusId);
    if (elStatus) elStatus.textContent = text;
  }

  private async handleStorageSuccess(data: WhatAuthSuccessData): Promise<void> {
    const { storage, authEndpoint, redirectUrl } = this.options;
    const candidateToken = data.token || data.sessionId || '';
    const candidatePhone = data.phone || (data.user && data.user.phone) || '';
    const candidateName = data.name || (data.user && data.user.name) || '';
    const candidateDomain = data.domain || this.options.domain || '';
    const candidateSessionId = data.sessionId || candidateToken;

    if (storage === 'sessionStorage' && typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.setItem('whatauth_token', candidateToken);
        sessionStorage.setItem(
          'whatauth_user',
          JSON.stringify({
            phone: candidatePhone,
            name: candidateName,
            lid: data.lid,
            domain: candidateDomain,
            sessionId: candidateSessionId,
            user: data.user || { phone: candidatePhone, name: candidateName }
          })
        );
        console.log('[WhatAuth SDK] 💾 Token JWT guardado en sessionStorage (whatauth_token)');
      } catch (e) {
        console.warn('[WhatAuth SDK] No se pudo guardar en sessionStorage:', e);
      }
    }

    if (storage === 'httpOnly' && authEndpoint && typeof fetch !== 'undefined') {
      try {
        this.updateStatus('Estableciendo sesión segura...');
        const resp = await fetch(authEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            token: candidateToken,
            phone: candidatePhone,
            name: candidateName,
            domain: candidateDomain,
            sessionId: candidateSessionId,
            user: data.user || { phone: candidatePhone, name: candidateName }
          })
        });

        if (!resp.ok) {
          console.error('[WhatAuth SDK] Error en POST a ' + authEndpoint + ':', resp.status, resp.statusText);
          this.emit('authEndpointError', { status: resp.status });
        } else {
          console.log('[WhatAuth SDK] 🔒 Sesión httpOnly enviada con éxito a ' + authEndpoint);
          this.emit('authEndpointSuccess', await resp.json().catch(() => ({})));
        }
      } catch (err: any) {
        console.error('[WhatAuth SDK] Falló la petición a ' + authEndpoint + ':', err);
        this.emit('authEndpointError', { error: err.message });
      }
    }

    const targetRedirect = redirectUrl;
    if (
      targetRedirect &&
      typeof targetRedirect === 'string' &&
      typeof window !== 'undefined' &&
      targetRedirect !== window.location.href &&
      targetRedirect !== window.location.origin
    ) {
      setTimeout(() => {
        window.location.href = targetRedirect;
      }, 500);
    }
  }

  public destroy(): void {
    this.clearExpirationTimer();
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export default WhatAuth;
