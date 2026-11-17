/**
 * SafePath — Centralized API Configuration & Platform Resolver
 *
 * Automatically resolves the backend URLs across runtime environments:
 * 1. Physical Android devices (Capacitor): connects to development PC LAN IP (http://192.168.0.241:8000)
 * 2. Android Emulators: connects to development PC LAN IP or http://10.0.2.2:8000
 * 3. Web browsers (Desktop / Local): connects to VITE_API_URL or http://192.168.0.241:8000
 */

// Authoritative Development PC LAN IPv4 Address
export const PC_LAN_IP = import.meta.env.VITE_PC_LAN_IP || "192.168.0.241";
export const EMULATOR_HOST = "10.0.2.2";

export const FASTAPI_PORT = 8000;
export const EXPRESS_PORT = 5000;

export function isCapacitorNative() {
  if (typeof window === "undefined") return false;
  // Capacitor native platform check
  if (window.Capacitor?.isNativePlatform?.() || window.Capacitor?.getPlatform?.() === "android" || window.Capacitor?.getPlatform?.() === "ios") {
    return true;
  }
  // Android WebView / capacitor protocol check
  if (window.location.protocol === "capacitor:" || window.location.protocol === "file:") {
    return true;
  }
  if (navigator.userAgent?.includes("Android") && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    return true;
  }
  return false;
}

function resolveApiUrl() {
  const envUrl = import.meta.env.VITE_API_URL;

  // On Capacitor Native Android:
  if (isCapacitorNative()) {
    // If envUrl is explicitly a valid LAN or emulator IP, use it
    if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
      return envUrl.replace(/\/+$/, "");
    }
    // Default to Development PC LAN IP for physical device Wi-Fi connectivity
    return `http://${PC_LAN_IP}:${FASTAPI_PORT}`;
  }

  // Web environment:
  if (envUrl && envUrl.trim()) {
    return envUrl.replace(/\/+$/, "");
  }
  return `http://${PC_LAN_IP}:${FASTAPI_PORT}`;
}

function resolveAuthUrl() {
  const envUrl = import.meta.env.VITE_AUTH_URL;

  if (isCapacitorNative()) {
    if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
      return envUrl.replace(/\/+$/, "");
    }
    return `http://${PC_LAN_IP}:${EXPRESS_PORT}`;
  }

  if (envUrl && envUrl.trim()) {
    return envUrl.replace(/\/+$/, "");
  }
  return `http://${PC_LAN_IP}:${EXPRESS_PORT}`;
}

export const API_URL = resolveApiUrl();
export const AUTH_URL = resolveAuthUrl();

export const BACKEND_URL = API_URL;
export const AUTH_API = AUTH_URL;

// Secondary fallback hosts for emulator environments
export const EMULATOR_API_URL = `http://${EMULATOR_HOST}:${FASTAPI_PORT}`;
export const EMULATOR_AUTH_URL = `http://${EMULATOR_HOST}:${EXPRESS_PORT}`;

export default {
  API_URL,
  AUTH_URL,
  BACKEND_URL,
  AUTH_API,
  PC_LAN_IP,
  EMULATOR_API_URL,
  EMULATOR_AUTH_URL,
  isCapacitorNative,
};
