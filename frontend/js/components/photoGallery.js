import { escapeHtml } from '../utils/dom.js';
import { canUploadPhotos, photoCountLabel, stepPhotoIndex } from '../utils/photos.js';

/** Dieselben 4 Typen wie im Backend (docs/SPEC.md 5.8) — nur Vorauswahl im Dateidialog, geprueft wird im Backend. */
const ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';

function itemHtml(photo, index, busy) {
  const name = escapeHtml(photo.filename);
  return `<figure class="gallery__item">
    <button type="button" class="gallery__open" data-index="${index}" title="${name}">
      <img class="gallery__thumb" src="${escapeHtml(photo.url)}" alt="${name}" loading="lazy">
    </button>
    <button type="button" class="btn btn--danger gallery__delete" data-filename="${name}" ${busy ? 'disabled' : ''}>Löschen</button>
  </figure>`;
}

function uploadHtml(busy) {
  return `<button type="button" class="btn gallery__pick ${busy ? 'is-busy' : ''}" ${busy ? 'disabled' : ''}>${busy ? 'Lade hoch …' : 'Fotos hochladen'}</button>
    <input class="gallery__input" type="file" multiple accept="${ACCEPT}" hidden>`;
}

function lightboxHtml(count) {
  return `<dialog class="lightbox">
    <div class="lightbox__bar">
      <span class="lightbox__caption"></span>
      <button type="button" class="btn" data-lightbox="close">Schließen</button>
    </div>
    <img class="lightbox__image" alt="">
    <div class="lightbox__bar" ${count < 2 ? 'hidden' : ''}>
      <button type="button" class="btn" data-lightbox="prev">‹ Zurück</button>
      <button type="button" class="btn" data-lightbox="next">Weiter ›</button>
    </div>
  </dialog>`;
}

/**
 * Fotogalerie der Detailseite (docs/ARCHITECTURE.md 7.8): Zaehler "n / max Fotos", Upload-Button (verschwindet, wenn
 * das Limit erreicht ist), Raster aus Vorschaubildern (= Originalbilder, lazy geladen — DECISIONS #80), Grossansicht
 * als <dialog> mit Zurueck/Weiter, Loeschen-Button je Foto. Reine Render-Funktion: kein API-Aufruf, kein Bestaetigungs-
 * dialog — beides macht die Seite in onUpload/onDelete.
 * @param {HTMLElement} container
 * @param {{photos: Array<{filename: string, url: string}>, maxPhotos: number, busy?: boolean}} props
 *   busy: waehrend Upload/Loeschen sind die Buttons gesperrt
 * @param {{onUpload: (files: File[]) => void, onDelete: (filename: string) => void}} handlers
 */
export function renderPhotoGallery(container, { photos, maxPhotos, busy = false }, { onUpload, onDelete }) {
  const grid =
    photos.length > 0
      ? `<div class="gallery">${photos.map((photo, index) => itemHtml(photo, index, busy)).join('')}</div>`
      : '<div class="table__empty">Noch keine Fotos vorhanden.</div>';
  container.innerHTML = `<div class="gallery__toolbar">
      <span class="gallery__count">${escapeHtml(photoCountLabel(photos.length, maxPhotos))}</span>
      ${canUploadPhotos(photos.length, maxPhotos) ? uploadHtml(busy) : ''}
    </div>
    ${grid}
    ${lightboxHtml(photos.length)}`;

  const dialog = container.querySelector('.lightbox');
  let current = 0;
  const show = (index) => {
    current = index;
    const image = dialog.querySelector('.lightbox__image');
    image.src = photos[current].url;
    image.alt = photos[current].filename;
    dialog.querySelector('.lightbox__caption').textContent =
      `${photos[current].filename} (${current + 1} / ${photos.length})`;
  };

  container.onclick = (ev) => {
    const openButton = ev.target.closest('.gallery__open');
    const deleteButton = ev.target.closest('.gallery__delete');
    const lightboxAction = ev.target.closest('[data-lightbox]')?.dataset.lightbox;
    if (openButton) {
      show(Number(openButton.dataset.index));
      dialog.showModal();
    } else if (deleteButton && !deleteButton.disabled) {
      onDelete(deleteButton.dataset.filename);
    } else if (ev.target.closest('.gallery__pick')) {
      container.querySelector('.gallery__input').click();
    } else if (lightboxAction === 'close') {
      dialog.close();
    } else if (lightboxAction === 'prev') {
      show(stepPhotoIndex(current, -1, photos.length));
    } else if (lightboxAction === 'next') {
      show(stepPhotoIndex(current, 1, photos.length));
    }
  };
  container.onchange = (ev) => {
    const input = ev.target.closest('.gallery__input');
    if (!input || input.files.length === 0) return;
    const files = Array.from(input.files);
    input.value = ''; // dieselbe Datei kann danach erneut gewaehlt werden
    onUpload(files);
  };
  container.onkeydown = (ev) => {
    if (!dialog.open || photos.length < 2) return;
    if (ev.key === 'ArrowLeft') show(stepPhotoIndex(current, -1, photos.length));
    if (ev.key === 'ArrowRight') show(stepPhotoIndex(current, 1, photos.length));
  };
}
