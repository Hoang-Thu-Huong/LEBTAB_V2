import { describe, it, expect, vi } from 'vitest';
import { renderPhotoGallery } from './photoGallery.js';

const photo = (n) => ({ filename: `170000000000${n}-foto_${n}.jpg`, url: `/uploads/A1CK00/170000000000${n}-foto_${n}.jpg` });
const PHOTOS = [photo(1), photo(2), photo(3)];

/** Container-Attrappe ohne DOM (wie message.test.js): merkt sich innerHTML und liefert Dialog/Input als Objekte. */
function fakeContainer() {
  const image = { src: '', alt: '' };
  const caption = { textContent: '' };
  const dialog = {
    open: false,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    querySelector: (selector) => (selector === '.lightbox__image' ? image : caption),
  };
  const input = { value: 'C:\\fakepath\\a.png', files: [], click: vi.fn() };
  return {
    innerHTML: '',
    dialog,
    image,
    caption,
    input,
    querySelector: (selector) => (selector === '.lightbox' ? dialog : input),
  };
}

/** Ereignis, dessen target nur zu EINEM Selektor passt — wie ein Klick auf genau dieses Element. */
const eventOn = (selector, element) => ({
  target: { closest: (candidate) => (candidate === selector ? element : null) },
});

function render(props = {}, handlers = {}) {
  const container = fakeContainer();
  const onUpload = vi.fn();
  const onDelete = vi.fn();
  renderPhotoGallery(container, { photos: PHOTOS, maxPhotos: 10, ...props }, { onUpload, onDelete, ...handlers });
  return { container, onUpload, onDelete };
}

describe('renderPhotoGallery — markup', () => {
  it('shows the counter, one lazily loaded thumbnail per photo and the upload button', () => {
    const { container } = render();
    expect(container.innerHTML).toContain('3 / 10 Fotos');
    expect(container.innerHTML.match(/class="gallery__thumb"/g)).toHaveLength(3);
    expect(container.innerHTML.match(/loading="lazy"/g)).toHaveLength(3);
    expect(container.innerHTML).toContain(`src="${PHOTOS[0].url}"`);
    expect(container.innerHTML).toContain('Fotos hochladen');
    expect(container.innerHTML).toContain('accept="image/png,image/jpeg,image/gif,image/webp"');
  });

  it('shows a hint instead of the grid while there is no photo', () => {
    const { container } = render({ photos: [] });
    expect(container.innerHTML).toContain('0 / 10 Fotos');
    expect(container.innerHTML).toContain('Noch keine Fotos vorhanden.');
    expect(container.innerHTML).not.toContain('gallery__thumb');
  });

  it('offers no upload once the limit is reached or exceeded', () => {
    for (const maxPhotos of [3, 2]) {
      const { container } = render({ maxPhotos });
      expect(container.innerHTML).not.toContain('gallery__pick');
      expect(container.innerHTML).not.toContain('gallery__input');
    }
  });

  it('locks upload and delete buttons while busy', () => {
    const { container } = render({ busy: true });
    expect(container.innerHTML).toContain('Lade hoch …');
    expect(container.innerHTML.match(/gallery__delete" data-filename="[^"]+" disabled/g)).toHaveLength(3);
  });

  it('escapes file name and url', () => {
    const { container } = render({ photos: [{ filename: 'a"><img src=x>.png', url: '/uploads/X/"onerror="y' }] });
    expect(container.innerHTML).not.toContain('<img src=x>');
    expect(container.innerHTML).not.toContain('"onerror="');
    expect(container.innerHTML).toContain('a&quot;&gt;&lt;img src=x&gt;.png');
  });
});

describe('renderPhotoGallery — events', () => {
  it('reports the file name of the clicked delete button', () => {
    const { container, onDelete } = render();
    container.onclick(eventOn('.gallery__delete', { disabled: false, dataset: { filename: PHOTOS[1].filename } }));
    expect(onDelete).toHaveBeenCalledWith(PHOTOS[1].filename);
  });

  it('ignores a disabled delete button', () => {
    const { container, onDelete } = render({ busy: true });
    container.onclick(eventOn('.gallery__delete', { disabled: true, dataset: { filename: PHOTOS[1].filename } }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('opens the file dialog through the hidden input', () => {
    const { container } = render();
    container.onclick(eventOn('.gallery__pick', {}));
    expect(container.input.click).toHaveBeenCalledTimes(1);
  });

  it('passes the chosen files to onUpload and clears the input', () => {
    const { container, onUpload } = render();
    const files = [{ name: 'a.png', size: 1 }, { name: 'b.png', size: 2 }];
    container.input.files = files;
    container.onchange(eventOn('.gallery__input', container.input));
    expect(onUpload).toHaveBeenCalledWith(files);
    expect(container.input.value).toBe('');
  });

  it('does nothing when the file dialog was cancelled', () => {
    const { container, onUpload } = render();
    container.onchange(eventOn('.gallery__input', container.input));
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('opens the large view on the clicked photo and steps with wrap-around', () => {
    const { container } = render();
    container.onclick(eventOn('.gallery__open', { dataset: { index: '2' } }));
    expect(container.dialog.open).toBe(true);
    expect(container.image.src).toBe(PHOTOS[2].url);
    expect(container.caption.textContent).toBe(`${PHOTOS[2].filename} (3 / 3)`);

    container.onclick(eventOn('[data-lightbox]', { dataset: { lightbox: 'next' } }));
    expect(container.image.src).toBe(PHOTOS[0].url);
    container.onclick(eventOn('[data-lightbox]', { dataset: { lightbox: 'prev' } }));
    expect(container.image.src).toBe(PHOTOS[2].url);
    container.onkeydown({ key: 'ArrowLeft' });
    expect(container.image.src).toBe(PHOTOS[1].url);
    container.onkeydown({ key: 'ArrowRight' });
    expect(container.image.src).toBe(PHOTOS[2].url);

    container.onclick(eventOn('[data-lightbox]', { dataset: { lightbox: 'close' } }));
    expect(container.dialog.open).toBe(false);
  });

  it('ignores arrow keys while the large view is closed', () => {
    const { container } = render();
    container.onkeydown({ key: 'ArrowRight' });
    expect(container.image.src).toBe('');
  });
});
