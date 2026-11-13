// js/messaging.js
// Realtime Private Messaging & Inbox Logic

(function () {
  let supabaseClient = null;
  let currentUser = null;
  let activeRecipientId = null;
  let activeItemRef = null;

  function getClient() {
    if (window.supabaseClient) return window.supabaseClient;
    if (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
      window.supabaseClient = window.supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON_KEY
      );
      return window.supabaseClient;
    }
    return null;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, (tag) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  function showBanner(message, isError = false) {
    const banner = document.getElementById('inboxBanner');
    if (!banner) return;
    banner.textContent = message;
    banner.style.display = 'block';
    banner.style.background = isError ? 'rgba(239, 68, 68, 0.14)' : 'rgba(16, 185, 129, 0.14)';
    banner.style.color = isError ? '#dc2626' : '#059669';
    setTimeout(() => {
      banner.style.display = 'none';
    }, 5000);
  }

  async function initInbox() {
    supabaseClient = getClient();
    if (!supabaseClient) {
      showBanner('Supabase is not configured yet in js/config.js.', true);
      return;
    }

    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session || !session.user) {
      window.location.href = 'pages/login.html';
      return;
    }
    currentUser = session.user;

    await loadUserThemeAndRole();
    await loadConversationsList();

    // Check URL parameters for direct messaging from feed
    const urlParams = new URLSearchParams(window.location.search);
    const targetUser = urlParams.get('user');
    const targetItem = urlParams.get('item');

    if (targetUser && targetUser !== currentUser.id) {
      await openConversation(targetUser, targetItem);
    }

    bindEvents();
  }

  async function loadUserThemeAndRole() {
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('theme, role')
      .eq('id', currentUser.id)
      .maybeSingle();

    const savedTheme = profile?.theme || localStorage.getItem('campcon_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    localStorage.setItem('campcon_theme', savedTheme);

    if (profile && ['super_admin', 'admin', 'moderator'].includes(profile.role)) {
      const adminLink = document.getElementById('navAdminLink');
      if (adminLink) adminLink.style.display = 'inline-block';
    }
  }

  async function loadConversationsList() {
    const listEl = document.getElementById('conversationsList');
    if (!listEl) return;

    // Fetch messages where user is sender or receiver
    const { data, error } = await supabaseClient
      .from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(full_name), receiver:profiles!messages_receiver_id_fkey(full_name)')
      .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
      .order('created_at', { ascending: false });

    if (error) {
      listEl.innerHTML = '<p style="padding:1rem;color:#dc2626;font-size:0.9rem;">Could not load conversations.</p>';
      return;
    }

    if (!data || data.length === 0) {
      listEl.innerHTML = '<p style="padding:1rem;color:var(--text-secondary,#6b7280);font-size:0.9rem;">No messages yet.</p>';
      return;
    }

    // Group by conversation partner
    const map = new Map();
    data.forEach((m) => {
      const partnerId = m.sender_id === currentUser.id ? m.receiver_id : m.sender_id;
      const partnerName = m.sender_id === currentUser.id ? m.receiver?.full_name : m.sender?.full_name;
      if (!map.has(partnerId)) {
        map.set(partnerId, {
          partnerId,
          partnerName: partnerName || 'Campus Member',
          lastMessage: m.content,
          createdAt: m.created_at
        });
      }
    });

    const conversations = Array.from(map.values());

    listEl.innerHTML = conversations.map((c) => `
      <div class="conv-item ${activeRecipientId === c.partnerId ? 'active' : ''}" data-partner-id="${c.partnerId}" data-partner-name="${escapeHTML(c.partnerName)}">
        <div style="font-weight:600; font-size:0.95rem; margin-bottom:0.2rem;">${escapeHTML(c.partnerName)}</div>
        <div style="font-size:0.82rem; color:var(--text-secondary,#6b7280); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
          ${escapeHTML(c.lastMessage)}
        </div>
      </div>
    `).join('');
  }

  async function openConversation(partnerId, itemId = null) {
    activeRecipientId = partnerId;
    activeItemRef = itemId;

    // Highlight active in sidebar
    document.querySelectorAll('.conv-item').forEach((el) => {
      if (el.dataset.partnerId === partnerId) {
        el.classList.add('active');
        const name = el.dataset.partnerName;
        document.getElementById('chatHeader').textContent = `Chat with ${name}`;
      } else {
        el.classList.remove('active');
      }
    });

    const form = document.getElementById('messageForm');
    if (form) form.style.display = 'flex';

    await loadChatMessages();
  }

  async function loadChatMessages() {
    const chatBox = document.getElementById('chatMessages');
    if (!chatBox || !activeRecipientId) return;

    chatBox.innerHTML = '<p style="margin:auto;color:var(--text-secondary,#6b7280);">Loading messages...</p>';

    const { data, error } = await supabaseClient
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${currentUser.id},receiver_id.eq.${activeRecipientId}),and(sender_id.eq.${activeRecipientId},receiver_id.eq.${currentUser.id})`)
      .order('created_at', { ascending: true });

    if (error) {
      chatBox.innerHTML = '<p style="margin:auto;color:#dc2626;">Could not load messages.</p>';
      return;
    }

    if (!data || data.length === 0) {
      chatBox.innerHTML = '<p style="margin:auto;color:var(--text-secondary,#6b7280);">Start the conversation below.</p>';
      return;
    }

    chatBox.innerHTML = data.map((m) => {
      const isOutgoing = m.sender_id === currentUser.id;
      const bubbleClass = isOutgoing ? 'message-outgoing' : 'message-incoming';
      return `
        <div class="message-bubble ${bubbleClass}">
          <div>${escapeHTML(m.content)}</div>
          <div style="font-size:0.7rem;opacity:0.8;text-align:right;margin-top:0.2rem;">
            ${new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      `;
    }).join('');

    chatBox.scrollTop = chatBox.scrollHeight;
  }

  async function handleSendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    if (!content || !activeRecipientId) return;

    const payload = {
      sender_id: currentUser.id,
      receiver_id: activeRecipientId,
      content,
      item_id: activeItemRef
    };

    const { error } = await supabaseClient.from('messages').insert([payload]);

    if (error) {
      showBanner(`Could not send message: ${error.message}`, true);
      return;
    }

    input.value = '';
    await loadChatMessages();
    await loadConversationsList();
  }

  function bindEvents() {
    document.getElementById('conversationsList')?.addEventListener('click', (e) => {
      const item = e.target.closest('.conv-item');
      if (item) {
        openConversation(item.dataset.partnerId);
      }
    });

    document.getElementById('messageForm')?.addEventListener('submit', handleSendMessage);
  }

  document.addEventListener('DOMContentLoaded', initInbox);
})();