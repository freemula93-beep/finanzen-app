// Lädt externe Skripte (CDN) einmalig nach — nur für PDF/Foto-Erkennung nötig, dafür ist einmalig Internet erforderlich.
const loaded = {};

export function loadScript(src) {
  if (loaded[src]) return loaded[src];
  loaded[src] = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Bibliothek konnte nicht geladen werden. Bist du online?'));
    document.head.appendChild(s);
  });
  return loaded[src];
}
