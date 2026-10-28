/**
 * Roommate matching and batch groups (F1): tenant-only endpoints for the local demo backend.
 *   GET/PUT/DELETE /roommate/profile    GET /roommate/matches?city=
 *   GET /batches?city=   GET /batches/:group_id   POST/DELETE /batches/:group_id/join
 * Privacy rules enforced here: only first name + last initial + quiz answers are ever shared; no response contains
 * another person's email, phone or user id; profiles are opt-in and visible only within the same city.
 * Scores are computed on the "server" with PGC.lib.roommateScore (the brief's half-up rounding).
 */
(function (PGC) {
  'use strict';

  const CITIES = ['Bengaluru', 'Delhi', 'Pune', 'Hyderabad'];
  const INTAKES = ['Summer intern', 'New job', 'College starter', 'Exam aspirant', 'Other'];
  const CAP = 12;

  PGC.localApi.extend(({ route, err, requireRole }) => {
    const lib = PGC.lib;
    const randomId = PGC.utils.randomId;
    const ownProfile = (db, user) => db.roommate_profiles.find((p) => p.user_id === user.user_id) || null;
    /** First name and last initial from the account name; nothing else about the account is copied. */
    const nameParts = (full) => {
      const t = String(full || '').trim().split(/\s+/);
      return { first: t[0] || 'Tenant', last: t.length > 1 ? t[t.length - 1].charAt(0).toUpperCase() : '' };
    };
    const own = (p) => ({
      profile_id: p.profile_id, first_name: p.first_name, last_initial: p.last_initial, city: p.city, intake: p.intake,
      answers: p.answers.slice(), opt_in: !!p.opt_in, created_at: p.created_at, updated_at: p.updated_at,
    });
    const dropMemberships = (db, profileId) => { db.batch_members = db.batch_members.filter((m) => m.profile_id !== profileId); };

    route('GET', '/roommate/profile', async (ctx) => {
      const user = requireRole(ctx, 'tenant');
      const p = ownProfile(ctx.db, user);
      return { profile: p ? own(p) : null };
    });

    route('PUT', '/roommate/profile', async (ctx) => {
      const user = requireRole(ctx, 'tenant');
      const { db, body } = ctx;
      if (!lib.validAnswers(body.answers)) throw err('Answer all 6 questions', 422);
      if (!CITIES.includes(body.city)) throw err('Pick a city', 422);
      const intake = INTAKES.includes(body.intake) ? body.intake : '';
      const optIn = body.opt_in === true;
      const now = new Date().toISOString();
      const { first, last } = nameParts(user.name);
      let p = ownProfile(db, user);
      if (!p) {
        p = { profile_id: randomId(12), user_id: user.user_id, is_sample: false, created_at: now };
        db.roommate_profiles.push(p);
      }
      Object.assign(p, { first_name: first, last_initial: last, city: body.city, intake, answers: body.answers.slice(), opt_in: optIn, updated_at: now });
      if (!optIn) dropMemberships(db, p.profile_id); // switching matching off also leaves the groups
      return own(p);
    });

    route('DELETE', '/roommate/profile', async (ctx) => {
      const user = requireRole(ctx, 'tenant');
      const { db } = ctx;
      const p = ownProfile(db, user);
      if (p) { dropMemberships(db, p.profile_id); db.roommate_profiles = db.roommate_profiles.filter((x) => x !== p); }
      return { ok: true };
    });

    route('GET', '/roommate/matches', async (ctx) => {
      const user = requireRole(ctx, 'tenant');
      const { db, query } = ctx;
      const me = ownProfile(db, user);
      if (!me) throw err('Answer the quiz first', 400);
      const city = CITIES.includes(query.city) ? query.city : me.city;
      return db.roommate_profiles
        .filter((p) => p.opt_in && p.city === city && p.profile_id !== me.profile_id)
        .map((p) => {
          const score = lib.roommateScore(me.answers, p.answers);
          return { profile_id: p.profile_id, first_name: p.first_name, last_initial: p.last_initial, intake: p.intake || '', score, band: lib.band(score), why: lib.whyMatch(me.answers, p.answers), is_sample: !!p.is_sample };
        })
        .sort((a, b) => b.score - a.score || a.profile_id.localeCompare(b.profile_id))
        .slice(0, 30);
    });

    /* ---------- batch groups ---------- */
    const members = (db, groupId) => db.batch_members.filter((m) => m.group_id === groupId);
    const groupView = (db, g, me) => {
      const count = members(db, g.group_id).length;
      return {
        group_id: g.group_id, city: g.city, name: g.name, for_whom: g.for_whom, window_label: g.window_label, cap: g.cap || CAP, is_sample: !!g.is_sample,
        member_count: count, joined: !!me && db.batch_members.some((m) => m.group_id === g.group_id && m.profile_id === me.profile_id), full: count >= (g.cap || CAP),
      };
    };

    route('GET', '/batches', async (ctx) => {
      const user = requireRole(ctx, 'tenant');
      const { db, query } = ctx;
      const me = ownProfile(db, user);
      const city = CITIES.includes(query.city) ? query.city : me ? me.city : '';
      return db.batch_groups.filter((g) => !city || g.city === city).map((g) => groupView(db, g, me))
        .sort((a, b) => a.group_id.localeCompare(b.group_id));
    });

    route('GET', '/batches/:group_id', async (ctx) => {
      const user = requireRole(ctx, 'tenant');
      const { db, params } = ctx;
      const g = db.batch_groups.find((x) => x.group_id === params.group_id);
      if (!g) throw err('Group not found', 404);
      const me = ownProfile(db, user);
      const people = members(db, g.group_id)
        .map((m) => db.roommate_profiles.find((p) => p.profile_id === m.profile_id)).filter(Boolean)
        .map((p) => ({ profile_id: p.profile_id, first_name: p.first_name, last_initial: p.last_initial, is_sample: !!p.is_sample, is_me: !!me && p.profile_id === me.profile_id,
          score: me && p.profile_id !== me.profile_id ? lib.roommateScore(me.answers, p.answers) : null }));
      return { ...groupView(db, g, me), members: people };
    });

    route('POST', '/batches/:group_id/join', async (ctx) => {
      const user = requireRole(ctx, 'tenant');
      const { db, params } = ctx;
      const g = db.batch_groups.find((x) => x.group_id === params.group_id);
      if (!g) throw err('Group not found', 404);
      const me = ownProfile(db, user);
      if (!me || !me.opt_in) throw err("Turn on 'Show me to others' to join a group.", 400);
      const already = db.batch_members.some((m) => m.group_id === g.group_id && m.profile_id === me.profile_id);
      if (!already) {
        if (members(db, g.group_id).length >= (g.cap || CAP)) throw err('Group is full', 400);
        db.batch_members.push({ group_id: g.group_id, profile_id: me.profile_id, joined_at: new Date().toISOString() });
      }
      return { ok: true, member_count: members(db, g.group_id).length };
    });

    route('DELETE', '/batches/:group_id/join', async (ctx) => {
      const user = requireRole(ctx, 'tenant');
      const { db, params } = ctx;
      const me = ownProfile(db, user);
      if (me) db.batch_members = db.batch_members.filter((m) => !(m.group_id === params.group_id && m.profile_id === me.profile_id));
      return { ok: true };
    });
  });
})(window.PGC);
