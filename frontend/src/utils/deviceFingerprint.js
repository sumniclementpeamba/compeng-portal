/**
 * Device fingerprint + geolocation helpers.
 *
 * The fingerprint is a 16-character hash derived from PUBLIC browser
 * characteristics — screen size, timezone, canvas rendering quirks,
 * WebGL vendor. No sensors, no permissions, no hardware identifiers.
 * It's the same technique anti-fraud systems use to answer "is this
 * the same browser as last time?"
 *
 * Two students on the SAME physical phone will produce the same
 * fingerprint — that's the point: it blocks proxy attendance.
 * Two students on different phones will almost always produce
 * different fingerprints.
 */

async function sha256Hex(str) {
    const buf = new TextEncoder().encode(str);
    const hashBuf = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  function getCanvasHash() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      const ctx = canvas.getContext('2d');
      if (!ctx) return 'no-canvas';
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(100, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('CompEng🔒', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('CompEng🔒', 4, 17);
      return canvas.toDataURL().slice(-80);
    } catch {
      return 'no-canvas';
    }
  }
  
  function getWebGLInfo() {
    try {
      const canvas = document.createElement('canvas');
      const gl =
        canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return 'no-webgl';
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debug) return 'no-debug-extension';
      const vendor = gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) || '';
      const renderer = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) || '';
      return `${vendor}|${renderer}`;
    } catch {
      return 'no-webgl';
    }
  }
  
  /**
   * Compute a 16-character hash of the current browser's characteristics.
   * Returns null if the browser can't compute a hash (falls back to
   * "no fingerprint" — the check-in still succeeds, duplicate-device
   * detection just doesn't run).
   */
  export async function computeFingerprint() {
    try {
      const parts = [
        `${screen.width}x${screen.height}x${screen.colorDepth}`,
        Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        navigator.language || '',
        (navigator.languages || []).join(','),
        navigator.platform || '',
        String(navigator.hardwareConcurrency || 0),
        String(navigator.maxTouchPoints || 0),
        getCanvasHash(),
        getWebGLInfo(),
      ];
      const hash = await sha256Hex(parts.join('|'));
      return hash.slice(0, 16);
    } catch {
      return null;
    }
  }
  
  /**
   * Promise wrapper around navigator.geolocation.getCurrentPosition.
   *
   * Resolves to:
   *   { lat, lng, accuracy }  — on success
   *   null                    — on any failure (denied, timeout, unsupported)
   *
   * Never throws — the caller handles the null case by sending the check-in
   * without GPS, which the backend flags as "no_gps" but still allows.
   */
  export function getCurrentPosition(options = {}) {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) =>
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        () => resolve(null),
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
          ...options,
        }
      );
    });
  }