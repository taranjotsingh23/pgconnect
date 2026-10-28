/**
 * One-time migration: the three room photos were replaced by PGImage1, PGImage2 and PGImage5.
 * Data already saved in a browser still holds the old image paths, so they are remapped here, one for one:
 *   old "room gray chair" -> pg-image-1.webp,  old "room plants" -> pg-image-2.webp,  old "room ring light" -> pg-image-5.jpg
 * Only PG `images` and the booking `pg_image` snapshot are touched, order and count are kept, and every other
 * value (accounts, bookings, saved PGs, chats, reviews, all other PG fields) is left exactly as it was.
 * Safe to run any number of times: new paths are not keys of the map, and `images_rev` marks the database as done.
 *
 * This file is the only place that still names the old image paths, because it has to recognise them.
 */
(function (PGC) {
  'use strict';

  const REV = 1;
  const MAP = {
    'assets/images/room-grey-chair.jpg': 'assets/images/pg-image-1.webp',
    'assets/images/room-plants.jpg': 'assets/images/pg-image-2.webp',
    'assets/images/room-ring-light.jpg': 'assets/images/pg-image-5.jpg',
  };
  const swap = (value) => (typeof value === 'string' && Object.prototype.hasOwnProperty.call(MAP, value) ? MAP[value] : value);

  /** Remaps the old paths inside a database object (in place). Returns how many values changed. */
  function apply(db) {
    let changed = 0;
    (db.pgs || []).forEach((pg) => {
      if (!Array.isArray(pg.images)) return;
      pg.images = pg.images.map((src) => { const next = swap(src); if (next !== src) changed += 1; return next; });
    });
    (db.bookings || []).forEach((b) => {
      const next = swap(b.pg_image);
      if (next !== b.pg_image) { b.pg_image = next; changed += 1; }
    });
    db.images_rev = REV;
    return changed;
  }

  PGC.imageSwap = { REV, apply };
})(window.PGC);
