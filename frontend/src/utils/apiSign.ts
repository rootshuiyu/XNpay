import type { InternalAxiosRequestConfig } from 'axios';

const SIGN_KEY = 'xini_2026_secure';

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function addRequestSignature(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = Math.random().toString(36).substring(2, 10);
  const path = config.url || '';

  const signStr = `${path}|${timestamp}|${nonce}|${SIGN_KEY}`;
  const sign = simpleHash(signStr);

  config.headers = config.headers || {};
  config.headers['X-Timestamp'] = timestamp;
  config.headers['X-Nonce'] = nonce;
  config.headers['X-Sign'] = sign;

  return config;
}
