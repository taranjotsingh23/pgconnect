/**
 * Chat between one tenant and the owner of one PG. Polls every few seconds (paused while the tab is hidden).
 */
(function (PGC) {
  'use strict';

  const { html } = PGC.utils;
  const { emptyState } = PGC.c;
  PGC.views = PGC.views || {};

  const bubbles = (messages, myId) => (messages.length
    ? html`${messages.map((m) => html`<div class="bubble ${m.sender_id === myId ? 'bubble--mine' : 'bubble--theirs'}" data-message-id="${m.message_id}">${m.text}</div>`)}`
    : html`<p class="chat__empty">No messages yet. Say hello 👋</p>`);

  PGC.views.chat = async function chat(ctx) {
    const pgId = ctx.params.pgId;
    const me = PGC.auth.user;
    const tenantId = ctx.query.tenant_id || (PGC.auth.isTenant ? me.user_id : '');
    const backTo = PGC.auth.isOwner ? '/owner/inquiries' : '/bookings';

    ctx.title('Chat');
    ctx.render(html`<div class="chat card"><div class="chat__bar"><div class="skeleton skeleton--line" style="width:40%"></div></div></div>`);

    if (!tenantId) {
      ctx.render(emptyState({ icon: '💬', title: 'Pick a conversation', text: 'Open a chat from your inquiries list.', action: html`<a class="btn btn--soft" href="#${backTo}">Go to inquiries</a>` }));
      return;
    }

    let pg; let messages;
    try {
      [pg, messages] = await Promise.all([
        PGC.query.get(['pg', pgId], () => PGC.api.getPg(pgId)),
        PGC.api.chat(pgId, tenantId),
      ]);
    } catch (e) {
      if (!ctx.alive()) return;
      ctx.render(emptyState({ icon: '💬', title: 'Chat unavailable', text: e.message, action: html`<a class="btn btn--soft" href="#${backTo}">Back</a>` }));
      return;
    }
    if (!ctx.alive()) return;

    ctx.title(`Chat · ${pg.name}`);
    const subtitle = PGC.auth.isOwner ? 'Tenant conversation' : `Owner · ${pg.owner.name}`;
    ctx.render(html`
      <section class="chat card" aria-label="Conversation about ${pg.name}">
        <header class="chat__bar">
          <button type="button" class="circle-btn circle-btn--plain" data-action="back" data-fallback="${backTo}" aria-label="Back" data-testid="chat-back">←</button>
          <div class="chat__titles">
            <h1 class="chat__title">${pg.name}</h1>
            <p class="chat__sub">${subtitle}</p>
          </div>
        </header>
        <div class="chat__messages" data-messages role="log" aria-live="polite" aria-label="Messages"></div>
        <form class="chat__form" data-form="chat" autocomplete="off">
          <label class="sr-only" for="chat-input">Message</label>
          <input class="chat__input" id="chat-input" name="text" type="text" maxlength="1000" placeholder="Type a message" data-testid="chat-input">
          <button type="submit" class="chat__send" data-testid="chat-send">Send</button>
        </form>
      </section>`);

    const box = ctx.app.querySelector('[data-messages]');
    const input = ctx.app.querySelector('[name="text"]');
    let signature = '';

    function paint(list, { forceScroll = false } = {}) {
      const sig = `${list.length}:${list.length ? list[list.length - 1].message_id : ''}`;
      if (sig === signature) return;
      const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      signature = sig;
      box.innerHTML = bubbles(list, me.user_id).toString();
      if (forceScroll || nearBottom) box.scrollTop = box.scrollHeight;
    }

    async function poll() {
      if (document.hidden || !ctx.alive()) return;
      try { paint(await PGC.api.chat(pgId, tenantId)); } catch (_) { /* transient: try again on the next tick */ }
    }

    paint(messages, { forceScroll: true });
    ctx.interval(poll, PGC_CONFIG.CHAT_POLL_MS);
    document.addEventListener('visibilitychange', poll, { signal: ctx.signal });

    ctx.on('submit', '[data-form="chat"]', async (e, form) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      const send = form.querySelector('.chat__send');
      send.disabled = true;
      try {
        await PGC.api.sendChat(pgId, tenantId, text);
        input.value = '';
        paint(await PGC.api.chat(pgId, tenantId), { forceScroll: true });
      } catch (err) {
        PGC.ui.toast(err.message, { type: 'error' });
      } finally {
        send.disabled = false;
        if (ctx.alive()) input.focus();
      }
    });
  };
})(window.PGC);
