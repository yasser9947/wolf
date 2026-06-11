// Lobby sharing: deep join link, WhatsApp invite, and a locally-generated QR.
// The QR lib is imported from a CDN (same pattern as the Firebase SDK) and renders
// entirely client-side — no room data is sent to any third party. If the import
// fails (offline), the QR is hidden and the link/WhatsApp/copy paths still work.

export function joinUrl(code) {
  const u = new URL(location.href);
  u.hash = '';
  u.search = `?room=${code}`;
  return u.toString();
}

export function whatsappUrl(code) {
  const msg = `تعال نلعب ذيب الديرة 🐺\nكود الديرة: ${code}\nادخل مباشرة 👇\n${joinUrl(code)}`;
  return `https://wa.me/?text=${encodeURIComponent(msg)}`;
}

let qrLib = null;
export async function renderQR(imgEl, text, size = 150) {
  try {
    if (!qrLib) {
      const m = await import('https://esm.sh/qrcode-generator@1.4.4');
      qrLib = m.default || m.qrcode || m;
    }
    const qr = qrLib(0, 'M');     // type 0 = auto-fit, medium error correction
    qr.addData(text);
    qr.make();
    const cell = Math.max(3, Math.round(size / qr.getModuleCount()));
    imgEl.src = qr.createDataURL(cell, cell * 2);
    imgEl.hidden = false;
    return true;
  } catch {
    imgEl.hidden = true;       // offline / blocked → other share paths remain
    return false;
  }
}
