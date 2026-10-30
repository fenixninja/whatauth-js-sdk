export type StorageMode = 'sessionStorage' | 'httpOnly' | 'none';

export interface WhatAuthConfig {
  apiKey: string;
  wsUrl?: string;
  domain?: string;
  storage?: StorageMode;
  authEndpoint?: string;
  redirectUrl?: string;
  qrId?: string;
  linkId?: string;
  expiredId?: string;
  statusId?: string;
  pinId?: string;
  sessionDuration?: number;
}

export interface WhatAuthUser {
  phone: string;
  name: string;
  lid?: string | null;
  domain?: string;
  sessionId?: string;
  [key: string]: any;
}

export interface WhatAuthSessionData {
  sessionId: string;
  qrBase64?: string;
  qrDataUrl?: string;
  qrUrlData?: string;
  walink: string;
  pin: string;
  expiresIn?: number;
  domain?: string;
}

export interface WhatAuthSuccessData {
  token: string;
  sessionId?: string;
  phone?: string;
  name?: string;
  lid?: string | null;
  domain?: string;
  user?: WhatAuthUser;
}

export interface WhatAuthErrorData {
  error: string;
  code?: string | number;
}

export type WhatAuthEventListener = (data: any) => void;
