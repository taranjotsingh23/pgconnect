/**
 * Demo data used by the local (browser-only) backend. It mirrors the documented backend seed:
 * two demo accounts, five verified PGs owned by the demo owner, and one review per PG.
 *
 * Image order is rotated per PG exactly as documented (same three photos, rotated by position).
 */
(function (PGC) {
  'use strict';

  // PGImage5, PGImage2 and PGImage1, in the same positions as the three photos they replaced.
  const BASE_IMAGES = [
    'assets/images/pg-image-5.jpg',
    'assets/images/pg-image-2.webp',
    'assets/images/pg-image-1.webp',
  ];

  const rotate = (list, by) => list.map((_, i) => list[(i + by) % list.length]);

  const DEMO_ACCOUNTS = {
    tenant: { name: 'Ananya Verma', email: 'tenant@pgconnect.in', password: 'tenant123', phone: '+919812345678' },
    owner: { name: 'Rakesh Mehta', email: 'owner@pgconnect.in', password: 'owner1234', phone: '+919812345679' },
  };

  const COMMON_RULES = ['No smoking', 'Entry till 11 PM', 'Guests only in common area'];

  // Order matters: later entries get newer timestamps, so the list (newest first) starts with HiTech.
  const PGS = [
    { id: 'pgsunshine01', name: 'Sunshine Girls PG', city: 'Bengaluru', locality: 'Koramangala 5th Block', gender: 'female',
      rooms: { single: 13500, double: 9500 }, food: true, rating: 4.6,
      amenities: ['WiFi', 'AC', 'Laundry', 'CCTV', 'Hot Water', 'Power Backup'] },
    { id: 'pgurbannest02', name: 'Urban Nest Co-living', city: 'Bengaluru', locality: 'HSR Layout', gender: 'unisex',
      rooms: { single: 16000, double: 12000 }, food: false, rating: 4.4,
      amenities: ['WiFi', 'AC', 'Gym', 'Housekeeping', 'CCTV'] },
    // price_from is the documented "starts at" price (7000), which is the double room, not the cheapest triple room.
    { id: 'pgscholars003', name: 'Delhi Scholars Boys PG', city: 'Delhi', locality: 'Mukherjee Nagar', gender: 'male',
      rooms: { double: 7000, triple: 5500 }, from: 7000, food: true, rating: 4.2,
      amenities: ['WiFi', 'Laundry', 'Hot Water'] },
    { id: 'pggreenleaf04', name: 'Green Leaf Girls PG', city: 'Pune', locality: 'Kothrud', gender: 'female',
      rooms: { single: 11000, double: 8200 }, food: true, rating: 4.5,
      amenities: ['WiFi', 'CCTV', 'Housekeeping', 'Power Backup'] },
    { id: 'pghitech00005', name: 'HiTech Co-living', city: 'Hyderabad', locality: 'Madhapur', gender: 'unisex',
      rooms: { single: 14000, double: 10500 }, food: false, rating: 4.3,
      amenities: ['WiFi', 'AC', 'Gym', 'Laundry'] },
  ];

  /** Builds the full document set stored by the local backend (password hashes are added by the caller). */
  function buildSeed() {
    const now = Date.now();
    const ownerId = 'ownerdemo001';
    const tenantId = 'tenantdemo01';
    const reviewerId = 'priyareview1';

    const pgs = PGS.map((p, i) => {
      const room_types = Object.entries(p.rooms).map(([type, price]) => ({ type, price, available: 3, total: 8 }));
      return {
        pg_id: p.id,
        owner_id: ownerId,
        name: p.name,
        city: p.city,
        locality: p.locality,
        address: `${p.locality}, ${p.city}`,
        gender: p.gender,
        description: `Clean, safe and fully furnished stay in ${p.locality}. Verified by the PGConnect team.`,
        price_from: p.from || Math.min(...Object.values(p.rooms)),
        amenities: p.amenities,
        rules: COMMON_RULES,
        food_included: p.food,
        images: rotate(BASE_IMAGES, i % BASE_IMAGES.length),
        verified: true,
        rating: p.rating,
        review_count: 1,
        room_types,
        created_at: new Date(now - (PGS.length - i) * 60000).toISOString(),
      };
    });

    // The documented seed rounds the PG rating to the nearest star for its single review (4.5 -> 5, 4.4 -> 4).
    const reviews = PGS.map((p, i) => ({
      review_id: `seedreview${String(i + 1).padStart(2, '0')}`,
      pg_id: p.id,
      tenant_id: reviewerId,
      tenant_name: 'Priya S.',
      rating: Math.round(p.rating),
      comment: 'Safe, clean and the owner responds quickly.',
      created_at: new Date(now - 3600000).toISOString(),
    }));

    return {
      users: [
        { user_id: tenantId, name: DEMO_ACCOUNTS.tenant.name, email: DEMO_ACCOUNTS.tenant.email, role: 'tenant',
          phone: DEMO_ACCOUNTS.tenant.phone, _plain: DEMO_ACCOUNTS.tenant.password, created_at: new Date(now).toISOString() },
        { user_id: ownerId, name: DEMO_ACCOUNTS.owner.name, email: DEMO_ACCOUNTS.owner.email, role: 'owner',
          phone: DEMO_ACCOUNTS.owner.phone, _plain: DEMO_ACCOUNTS.owner.password, created_at: new Date(now).toISOString() },
      ],
      pgs,
      reviews,
      shortlist: [],
      bookings: [],
      messages: [],
    };
  }

  PGC.seed = { buildSeed, DEMO_ACCOUNTS, BASE_IMAGES };
})(window.PGC);
