/**
 * Reine Hilfsfunktionen fuer die Fotogalerie (docs/ARCHITECTURE.md 7.8) — ohne DOM, mit Unit-Tests.
 * Grenzwerte kommen immer aus meta.limits (#13), nie hart kodiert.
 */
const BYTES_PER_MB = 1024 * 1024;

/**
 * @param {number} count
 * @param {number} max
 * @returns {string} z. B. "3 / 10 Fotos"
 */
export function photoCountLabel(count, max) {
  return `${count} / ${max} Fotos`;
}

/**
 * Upload nur, solange das Limit nicht erreicht ist. Auch bei count > max false
 * (z. B. wenn jemand Dateien von Hand in den Fotoordner kopiert hat).
 * @param {number} count
 * @param {number} max
 * @returns {boolean}
 */
export function canUploadPhotos(count, max) {
  return count < max;
}

/**
 * Prueft eine Dateiauswahl VOR dem Upload: Anzahl und Groesse. Den Dateityp prueft das Backend (INVALID_FILE).
 * @param {Array<{name: string, size: number}>} files
 * @param {number} currentCount Anzahl der bereits gespeicherten Fotos
 * @param {{photoMaxPerProduct: number, photoMaxSize: number}} limits meta.limits
 * @returns {string|null} deutsche Fehlermeldung oder null, wenn die Auswahl hochgeladen werden darf
 */
export function checkPhotoSelection(files, currentCount, limits) {
  const max = limits.photoMaxPerProduct;
  if (currentCount + files.length > max) {
    const free = Math.max(0, max - currentCount);
    return `Maximal ${max} Fotos pro Produkt (aktuell ${currentCount}, frei ${free})`;
  }
  const tooLarge = files.find((file) => file.size > limits.photoMaxSize);
  if (tooLarge) {
    return `Datei zu groß (maximal ${limits.photoMaxSize / BYTES_PER_MB} MB): ${tooLarge.name}`;
  }
  return null;
}

/**
 * Naechster/vorheriger Index in der Grossansicht, mit Umlauf an beiden Enden.
 * @param {number} index
 * @param {number} delta +1 oder -1
 * @param {number} length Anzahl der Fotos (> 0)
 * @returns {number}
 */
export function stepPhotoIndex(index, delta, length) {
  return (index + delta + length) % length;
}

/**
 * @param {number} count Anzahl der gerade hochgeladenen Dateien
 * @returns {string} "1 Foto hochgeladen" / "2 Fotos hochgeladen"
 */
export function uploadSuccessText(count) {
  return `${count} ${count === 1 ? 'Foto' : 'Fotos'} hochgeladen`;
}
