/**
 * Harvest Root — "Need Help" AI Chatbot Widget
 * Lightweight, context-aware customer assistant with instant answers,
 * order lookup, product recommendations, and human support escalation.
 */

(function () {
  // Prevent duplicate initialization
  if (window.HarvestChatbotInitialized) return;
  window.HarvestChatbotInitialized = true;

  // ===== CONFIG & STATE =====
  const STORAGE_KEY = 'harvest_chat_history';
  let isOpen = false;
  let isSending = false;
  let chatHistory = [];

  // Default initial quick chips
  const INITIAL_CHIPS = [
    { label: '🌿 Our Spices & Origin', query: 'Tell me about your spices and origin' },
    { label: '🚚 Shipping & Free Delivery', query: 'What are your shipping rates and delivery times?' },
    { label: '📦 Track My Order', query: 'How do I track my order status?' },
    { label: '💳 Payment & Returns', query: 'What payment methods and return policies do you have?' },
    { label: '📩 Contact Support', query: 'I want to contact human support' }
  ];

  // ===== INJECT DOM =====
  function injectChatbotDOM() {
    // 1. Floating Trigger Button
    const triggerBtn = document.createElement('button');
    triggerBtn.id = 'hr-chat-trigger';
    triggerBtn.className = 'hr-chat-trigger';
    triggerBtn.setAttribute('aria-label', 'Need Help? Chat with us');
    triggerBtn.innerHTML = `
      <div class="hr-trigger-icon-wrap">
        <svg class="hr-trigger-icon" viewBox="0 0 24 24">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>
        </svg>
        <span class="hr-online-dot"></span>
      </div>
      <span class="hr-trigger-label">Need Help?</span>
    `;

    // 2. Chat Window
    const chatWindow = document.createElement('div');
    chatWindow.id = 'hr-chat-window';
    chatWindow.className = 'hr-chat-window';
    chatWindow.innerHTML = `
      <!-- Header -->
      <div class="hr-chat-header">
        <div class="hr-chat-header-info">
          <img src="images/harvest root logo.png" alt="Harvest Root" class="hr-chat-avatar" onerror="this.src='images/hero-banner (2).png'">
          <div class="hr-chat-title-wrap">
            <span class="hr-chat-title">Harvest Assistant</span>
            <span class="hr-chat-status">
              <span class="hr-status-indicator"></span>
              Online · Coorg Spices
            </span>
          </div>
        </div>
        <div class="hr-chat-actions">
          <button class="hr-btn-icon" id="hr-btn-clear" title="Clear chat" aria-label="Clear chat">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
          <button class="hr-btn-icon" id="hr-btn-close" title="Close" aria-label="Close chat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- Messages Body -->
      <div class="hr-chat-body" id="hr-chat-body">
        <!-- Messages rendered dynamically -->
      </div>

      <!-- Footer & Input -->
      <div class="hr-chat-footer">
        <form class="hr-input-form" id="hr-input-form">
          <input 
            type="text" 
            class="hr-chat-input" 
            id="hr-chat-input" 
            placeholder="Ask about spices, shipping, orders..." 
            autocomplete="off"
            maxlength="400"
          >
          <button type="submit" class="hr-send-btn" id="hr-send-btn" aria-label="Send message">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </form>
        <div class="hr-powered-by">Harvest Root • Estate-Grown in Coorg</div>
      </div>
    `;

    document.body.appendChild(triggerBtn);
    document.body.appendChild(chatWindow);

    bindEvents();
    loadHistory();
  }

  // ===== EVENT BINDING =====
  function bindEvents() {
    const triggerBtn = document.getElementById('hr-chat-trigger');
    const closeBtn = document.getElementById('hr-btn-close');
    const clearBtn = document.getElementById('hr-btn-clear');
    const form = document.getElementById('hr-input-form');
    const input = document.getElementById('hr-chat-input');

    triggerBtn.addEventListener('click', toggleChat);
    closeBtn.addEventListener('click', () => setChatOpen(false));

    clearBtn.addEventListener('click', () => {
      chatHistory = [];
      sessionStorage.removeItem(STORAGE_KEY);
      renderInitialGreeting();
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || isSending) return;
      input.value = '';
      handleUserMessage(text);
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen) {
        setChatOpen(false);
      }
    });
  }

  function toggleChat() {
    setChatOpen(!isOpen);
  }

  function setChatOpen(open) {
    isOpen = open;
    const win = document.getElementById('hr-chat-window');
    const input = document.getElementById('hr-chat-input');

    if (isOpen) {
      win.classList.add('active');
      setTimeout(() => input && input.focus(), 250);
      scrollToBottom();
    } else {
      win.classList.remove('active');
    }
  }

  // ===== HISTORY STORAGE & RENDERING =====
  function loadHistory() {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        chatHistory = JSON.parse(saved);
        renderAllMessages();
      } else {
        renderInitialGreeting();
      }
    } catch (e) {
      renderInitialGreeting();
    }
  }

  function saveHistory() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(chatHistory));
    } catch (e) {}
  }

  function renderInitialGreeting() {
    const welcomeMsg = {
      role: 'bot',
      text: `Welcome to **Harvest Root** 🌿<br><br>I'm your spice advisor. Feel free to ask about our **single-origin Coorg spices**, order tracking, shipping policies, or request assistance from our support team!`,
      time: getCurrentTime(),
      chips: INITIAL_CHIPS
    };
    chatHistory = [welcomeMsg];
    saveHistory();
    renderAllMessages();
  }

  function renderAllMessages() {
    const body = document.getElementById('hr-chat-body');
    if (!body) return;
    body.innerHTML = '';

    const divider = document.createElement('div');
    divider.className = 'hr-time-divider';
    divider.textContent = 'Today';
    body.appendChild(divider);

    chatHistory.forEach((msg, idx) => {
      renderMessageElement(msg, idx);
    });

    scrollToBottom();
  }

  function renderMessageElement(msg, idx) {
    const body = document.getElementById('hr-chat-body');
    const msgEl = document.createElement('div');
    msgEl.className = `hr-message ${msg.role}`;

    let contentHtml = `<div class="hr-bubble">${formatText(msg.text)}`;

    // Support Form embedded in bot bubble
    if (msg.isSupportForm) {
      contentHtml += `
        <form class="hr-support-form" onsubmit="window.HarvestChatbotSubmitSupport(event, ${idx})">
          <input type="text" name="name" placeholder="Your Name" required>
          <input type="email" name="email" placeholder="Your Email Address" required>
          <textarea name="message" rows="2" placeholder="How can our support team help you?" required></textarea>
          <button type="submit">Submit to Support Team</button>
        </form>
      `;
    }

    contentHtml += `</div>`;

    // Interactive chips
    if (msg.chips && msg.chips.length > 0) {
      contentHtml += `<div class="hr-quick-chips">`;
      msg.chips.forEach(chip => {
        contentHtml += `<button type="button" class="hr-chip" onclick="window.HarvestChatbotSendChip('${escapeHtml(chip.query)}')">${escapeHtml(chip.label)}</button>`;
      });
      contentHtml += `</div>`;
    }

    msgEl.innerHTML = contentHtml;
    body.appendChild(msgEl);
  }

  function scrollToBottom() {
    const body = document.getElementById('hr-chat-body');
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  }

  function showTypingIndicator() {
    const body = document.getElementById('hr-chat-body');
    const typingEl = document.createElement('div');
    typingEl.id = 'hr-typing-indicator';
    typingEl.className = 'hr-typing-bubble';
    typingEl.innerHTML = `<span></span><span></span><span></span>`;
    body.appendChild(typingEl);
    scrollToBottom();
  }

  function removeTypingIndicator() {
    const el = document.getElementById('hr-typing-indicator');
    if (el) el.remove();
  }

  // ===== MESSAGE HANDLING =====
  async function handleUserMessage(text) {
    // Append user message
    const userMsg = {
      role: 'user',
      text: text,
      time: getCurrentTime()
    };
    chatHistory.push(userMsg);
    saveHistory();
    renderMessageElement(userMsg, chatHistory.length - 1);
    scrollToBottom();

    // Show bot typing
    isSending = true;
    showTypingIndicator();

    try {
      // Natural slight delay for human feel
      await new Promise(r => setTimeout(r, 450));

      const botReply = await queryChatbotEngine(text);

      removeTypingIndicator();
      chatHistory.push(botReply);
      saveHistory();
      renderMessageElement(botReply, chatHistory.length - 1);
      scrollToBottom();
    } catch (err) {
      removeTypingIndicator();
      const fallbackReply = {
        role: 'bot',
        text: "I'm having a little trouble connecting right now, but our support team is happy to help directly!",
        time: getCurrentTime(),
        isSupportForm: true
      };
      chatHistory.push(fallbackReply);
      saveHistory();
      renderMessageElement(fallbackReply, chatHistory.length - 1);
      scrollToBottom();
    } finally {
      isSending = false;
    }
  }

  // Global helper for chip clicking
  window.HarvestChatbotSendChip = function (query) {
    if (isSending) return;
    handleUserMessage(query);
  };

  // Global helper for in-chat support form submission
  window.HarvestChatbotSubmitSupport = async function (e, msgIndex) {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const message = form.message.value.trim();
    const submitBtn = form.querySelector('button');

    if (!name || !email || !message) return;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending message...';

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message })
      });
      const data = await res.json();

      if (res.ok) {
        form.innerHTML = `
          <div style="color:#27ae60;font-weight:600;font-size:0.85rem;padding:4px 0;">
            ✓ Message sent! Our support team will reach out to ${escapeHtml(email)} shortly.
          </div>
        `;
        // Update history
        if (chatHistory[msgIndex]) {
          chatHistory[msgIndex].isSupportForm = false;
          chatHistory[msgIndex].text += `<br><br><em>(Support request submitted for ${escapeHtml(name)})</em>`;
          saveHistory();
        }
      } else {
        alert(data.error || 'Could not send message.');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit to Support Team';
      }
    } catch (err) {
      alert('Connection error. Please try again later.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit to Support Team';
    }
  };

  // ===== LIVE CART HELPER =====
  function getLiveCart() {
    try {
      return JSON.parse(localStorage.getItem('harvestRootCart')) || [];
    } catch (e) {
      return [];
    }
  }

  // Global helper to open cart drawer
  window.HarvestChatbotOpenCart = function () {
    setChatOpen(false);
    const cartBtn = document.getElementById('cart-btn');
    if (cartBtn) {
      cartBtn.click();
    } else if (typeof window.openCart === 'function') {
      window.openCart();
    } else {
      window.location.href = 'checkout.html';
    }
  };

  // ===== CHATBOT ENGINE (SERVER + LOCAL HYBRID) =====
  async function queryChatbotEngine(userQuery) {
    const text = userQuery.toLowerCase();
    const liveCart = getLiveCart();

    // Client-side instant cart interceptor (guarantees real-time cart accuracy and action buttons)
    if (text.includes('cart') || text.includes('basket') || text.includes('bag')) {
      return localResolveQuery(userQuery);
    }

    // 1. Try backend endpoint
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userQuery,
          history: chatHistory.slice(-6),
          cart: liveCart
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (data && data.reply) {
          return {
            role: 'bot',
            text: data.reply,
            time: getCurrentTime(),
            chips: data.chips || null,
            isSupportForm: !!data.isSupportForm
          };
        }
      }
    } catch (e) {
      // Backend offline -> fallback
    }

    // 2. Client-side Intelligent Fallback Matcher
    return localResolveQuery(userQuery);
  }

  // Local Intent & FAQ Matcher
  function localResolveQuery(q) {
    const text = q.toLowerCase();
    const liveCart = getLiveCart();

    // 1. Live Cart Queries ("how do i see my cart", "how many products do i have in my cart", "where is cart")
    if (text.includes('cart') || text.includes('basket') || text.includes('bag')) {
      const totalItems = liveCart.reduce((s, i) => s + (parseInt(i.qty) || 1), 0);
      const totalPrice = liveCart.reduce((s, i) => s + (parseFloat(i.price) || 0) * (parseInt(i.qty) || 1), 0);

      if (liveCart.length > 0) {
        const itemsList = liveCart.map(i => `• **${i.qty || 1}x** ${i.name} — ₹${(i.price || 0) * (i.qty || 1)}`).join('<br>');
        const shippingMsg = totalPrice >= 500 
          ? '🎉 You qualify for **FREE Delivery**!' 
          : `Add **₹${500 - totalPrice}** more for **FREE Delivery**!`;

        return {
          role: 'bot',
          text: `🛒 **Your Shopping Cart:**<br>You currently have **${totalItems} product${totalItems > 1 ? 's' : ''}** in your cart (Total: **₹${totalPrice}**):<br><br>${itemsList}<br><br>${shippingMsg}<br><br><button type="button" class="hr-chip" onclick="window.HarvestChatbotOpenCart()" style="background:var(--green);color:white;cursor:pointer;">🛒 Open Cart Drawer</button> <a href="checkout.html" class="hr-chip" style="background:var(--green);color:white;text-decoration:none;display:inline-block;">💳 Proceed to Checkout</a>`,
          time: getCurrentTime(),
          chips: [
            { label: '💳 How to Checkout', query: 'how do i checkout?' },
            { label: '🚚 Shipping Policy', query: 'what are your shipping rates?' }
          ]
        };
      } else {
        return {
          role: 'bot',
          text: `🛒 **Viewing Your Cart:**<br>You can view your cart anytime by clicking the **cart icon (🛒)** at the top right of the navigation bar, or click below to open it right now:<br><br><button type="button" class="hr-chip" onclick="window.HarvestChatbotOpenCart()" style="background:var(--green);color:white;cursor:pointer;">🛒 Open Cart Drawer</button><br><br>Your cart is currently **empty**. Browse our collection to add fresh Coorg spices!`,
          time: getCurrentTime(),
          chips: [
            { label: '🌿 Explore Spices', query: 'what spices do you sell?' },
            { label: '🚚 Shipping Rates', query: 'how much is shipping?' }
          ]
        };
      }
    }

    // 2. Checkout & How to Order
    if (text.includes('checkout') || text.includes('how to buy') || text.includes('how to order') || text.includes('place order') || text.includes('how do i buy') || text.includes('purchase')) {
      return {
        role: 'bot',
        text: `🛍️ **How to Place an Order:**<br>1. Explore our spices and click **'Add to Cart'**.<br>2. Click your **Cart (🛒)** at the top right of the page.<br>3. Click **'Proceed to Checkout'** in the cart drawer.<br>4. Enter your shipping address and complete secure payment with UPI, Card, or Net Banking!<br><br><button type="button" class="hr-chip" onclick="window.HarvestChatbotOpenCart()" style="background:var(--green);color:white;cursor:pointer;">🛒 Open Cart</button> <a href="checkout.html" class="hr-chip" style="background:var(--green);color:white;text-decoration:none;display:inline-block;">💳 Go to Checkout</a>`,
        time: getCurrentTime(),
        chips: [
          { label: '💳 Payment Methods', query: 'what payment methods do you accept?' },
          { label: '🌿 Browse Spices', query: 'what spices do you sell?' }
        ]
      };
    }

    // 3. Discounts, Offers & Coupons
    if (text.includes('discount') || text.includes('coupon') || text.includes('promo') || text.includes('offer') || text.includes('sale') || text.includes('deal') || text.includes('cheap')) {
      return {
        role: 'bot',
        text: `🎁 **Current Offers & Savings at Harvest Root:**<br>• **FREE Delivery:** On all orders over **₹500** across India!<br>• **Estate-Direct Pricing:** Because our spices are handpicked and packed directly on our Coorg plantation, you get top Tellicherry-grade quality without distributor markups.`,
        time: getCurrentTime(),
        chips: [
          { label: '🚚 Shipping details', query: 'how does shipping work?' },
          { label: '🌿 View Spices', query: 'show me your spices' }
        ]
      };
    }

    // 4. Chai & Cooking Recipes
    if (text.includes('chai') || text.includes('tea')) {
      return {
        role: 'bot',
        text: `☕ **Authentic Coorg Masala Chai:**<br>1. Lightly crush **2 Green Cardamoms**, **2 Whole Cloves**, and a piece of **Cinnamon Stick**.<br>2. Simmer with milk and water, then add tea leaves.<br>3. Finish with a pinch of crushed **Black Pepper** for warmth and immunity!`,
        time: getCurrentTime(),
        chips: [
          { label: '🌿 View Spices', query: 'what spices do you sell?' },
          { label: '🛒 Open Cart', query: 'open cart' }
        ]
      };
    }

    if (text.includes('biryani') || text.includes('curry') || text.includes('cooking')) {
      return {
        role: 'bot',
        text: `🍚 **Whole Spices for Biryani & Curries:**<br>Our whole **Green Cardamom**, **Whole Cloves**, and **Black Pepper** release intense essential oils when tempered in hot ghee, forming the quintessential royal base for Dum Biryani and rich gravies!`,
        time: getCurrentTime(),
        chips: [
          { label: '🌿 Explore Spices', query: 'what spices do you sell?' }
        ]
      };
    }

    // 5. Storage & Shelf Life
    if (text.includes('store') || text.includes('storage') || text.includes('shelf life') || text.includes('expiry') || text.includes('expire') || text.includes('how long')) {
      return {
        role: 'bot',
        text: `🍃 **Spice Storage & Shelf Life:**<br>• Store whole spices in an airtight container in a cool, dry pantry away from sunlight and moisture.<br>• Properly stored, our sun-dried whole spices retain maximum potency and aroma for **12–18 months**!`,
        time: getCurrentTime(),
        chips: [
          { label: '🌿 Our Collection', query: 'tell me about your spices' }
        ]
      };
    }

    // 6. Account & Login
    if (text.includes('sign in') || text.includes('login') || text.includes('account') || text.includes('register') || text.includes('password') || text.includes('profile')) {
      return {
        role: 'bot',
        text: `👤 **Account & Sign In:**<br>You can sign in by clicking **'Sign In'** in the top navbar. We support one-click **Google Sign In** as well as email/password. You can also place orders as a guest anytime!`,
        time: getCurrentTime(),
        chips: [
          { label: '🔍 Track an Order', query: 'how do i track my order?' },
          { label: '💬 Talk to Support', query: 'i need help with my account' }
        ]
      };
    }

    // 7. Order tracking check (e.g., "order 5", "#5", "track order 12")
    const orderMatch = text.match(/(?:order\s*(?:#|no\.?|id)?\s*|#\s*)(\d+)/i);
    if (orderMatch) {
      const orderId = orderMatch[1];
      return {
        role: 'bot',
        text: `To track **Order #${orderId}**, our system checks our live database. If you placed it recently, you can check your confirmation email or message our support team below!`,
        time: getCurrentTime(),
        chips: [
          { label: '📦 Shipping info', query: 'When will my order arrive?' },
          { label: '💬 Contact Support', query: 'I need help with my order' }
        ]
      };
    }

    // 8. Specific Spices
    if (text.includes('black pepper') || text.includes('peppercorn')) {
      return {
        role: 'bot',
        text: `🌿 **Tellicherry Black Pepper (Coorg Estate):**<br>• **Price:** ₹200 / 100g<br>• **Profile:** Bold, sun-dried berries with high piperine content and robust warmth.<br>• **Health Benefits:** Supports digestion, nutrient absorption, and immunity.`,
        time: getCurrentTime(),
        chips: [
          { label: '🛒 Browse All Spices', query: 'what spices do you sell?' },
          { label: '🚚 Shipping Policy', query: 'is shipping free?' }
        ]
      };
    }

    if (text.includes('cardamom') || text.includes('elaichi')) {
      return {
        role: 'bot',
        text: `🌿 **Green Cardamom (Western Ghats):**<br>• **Price:** ₹580 / 100g<br>• **Profile:** Plump green pods with sweet floral eucalyptus aroma.<br>• **Best for:** Chai, biryani, desserts, and natural breath freshening.`,
        time: getCurrentTime(),
        chips: [
          { label: '☕ Chai Recipe', query: 'how to make spiced chai?' },
          { label: '🛒 Browse All Spices', query: 'what spices do you sell?' }
        ]
      };
    }

    if (text.includes('clove') || text.includes('laung')) {
      return {
        role: 'bot',
        text: `🌿 **Whole Cloves (Coorg Hills):**<br>• **Price:** ₹200 / 100g<br>• **Profile:** Hand-sorted, fragrant whole buds loaded with natural eugenol.<br>• **Best for:** Curries, chai, and dental wellness.`,
        time: getCurrentTime(),
        chips: [
          { label: '🛒 Browse All Spices', query: 'what spices do you sell?' }
        ]
      };
    }

    if (text.includes('cinnamon') || text.includes('dalchini')) {
      return {
        role: 'bot',
        text: `🌿 **Cinnamon Sticks (Coorg Plantation):**<br>• **Price:** ₹310 / 100g<br>• **Profile:** True Ceylon-style delicate rolled bark with natural sweetness.<br>• **Best for:** Herbal teas, oatmeal, curries, and metabolic health.`,
        time: getCurrentTime(),
        chips: [
          { label: '🛒 Browse All Spices', query: 'what spices do you sell?' }
        ]
      };
    }

    // 9. Spices & Products General
    if (text.includes('spice') || text.includes('product') || text.includes('shop') || text.includes('item')) {
      return {
        role: 'bot',
        text: `🌿 **Our Handpicked Spice Collection:**<br>
• **Tellicherry Black Pepper** (₹200 / 100g) — Bold, aromatic, sun-dried.<br>
• **Whole Cloves** (₹200 / 100g) — Intensely fragrant, hand-sorted.<br>
• **Green Cardamom** (₹580 / 100g) — Plump, floral pods from the Western Ghats.<br>
• **Cinnamon Sticks** (₹310 / 100g) — Authentic Ceylon-style delicate sweet bark.<br><br>
All spices are grown on our 3rd-generation family plantations in **Coorg**, completely chemical-free!`,
        time: getCurrentTime(),
        chips: [
          { label: '🛒 View Cart', query: 'how do i see my cart?' },
          { label: '🚚 Free Shipping details', query: 'Is shipping free?' }
        ]
      };
    }

    // 10. Shipping & Delivery
    if (text.includes('ship') || text.includes('deliver') || text.includes('cost') || text.includes('charge') || text.includes('free ship') || text.includes('pincode') || text.includes('time')) {
      return {
        role: 'bot',
        text: `🚚 **Shipping & Delivery Policy:**<br>
• **FREE Delivery** across India on all orders over **₹500**!<br>
• For orders under ₹500, a nominal standard fee of ₹50 applies.<br>
• Orders are dispatched within **24 hours** from our Coorg packing hub.<br>
• Delivery takes **3–5 business days** with tracking link sent to your email.`,
        time: getCurrentTime(),
        chips: [
          { label: '💳 Payment Options', query: 'What payment methods do you accept?' },
          { label: '🌿 Browse Spices', query: 'Tell me about your spices' }
        ]
      };
    }

    // 11. Origin / Coorg / Story
    if (text.includes('coorg') || text.includes('origin') || text.includes('farm') || text.includes('organic') || text.includes('story') || text.includes('plantation') || text.includes('location') || text.includes('where are you')) {
      return {
        role: 'bot',
        text: `🏔️ **Rooted in Coorg Heritage:**<br>
Harvest Root is a **3rd-generation family venture** nestled in the misty Western Ghats of Coorg, Karnataka. Our plantations are shaded by native silver oak and rosewood canopies.<br><br>
We skip the middlemen so you receive pure, single-origin spices bursting with fresh essential oils!`,
        time: getCurrentTime(),
        chips: [
          { label: '🌶️ Explore Products', query: 'Show me your spices' },
          { label: '📩 Contact Farm', query: 'How do I contact Harvest Root?' }
        ]
      };
    }

    // 12. Payment / COD / Security
    if (text.includes('pay') || text.includes('cod') || text.includes('card') || text.includes('upi') || text.includes('cash')) {
      return {
        role: 'bot',
        text: `💳 **Payments & Checkout:**<br>
• We accept all major **UPI apps** (Google Pay, PhonePe, Paytm), Credit/Debit Cards, and Net Banking.<br>
• Transactions are secured via 256-bit SSL encryption.<br>
• Simply add spices to your cart and click **"Proceed to Checkout"**!`,
        time: getCurrentTime(),
        chips: [
          { label: '📦 Shipping info', query: 'Shipping rates and delivery' },
          { label: '🛒 Open Cart', query: 'how do i see my cart?' }
        ]
      };
    }

    // 13. Returns / Refunds / Quality guarantee
    if (text.includes('return') || text.includes('refund') || text.includes('replace') || text.includes('cancel') || text.includes('damage')) {
      return {
        role: 'bot',
        text: `🛡️ **Freshness Guarantee & Returns:**<br>
If your package arrives damaged or you are not completely delighted with the freshness, let us know within **48 hours** of delivery. We will promptly issue a free replacement or refund!`,
        time: getCurrentTime(),
        chips: [
          { label: '💬 Talk to Support', query: 'I want to speak with customer support' }
        ]
      };
    }

    // 14. Support / Human Help / Contact
    if (text.includes('support') || text.includes('human') || text.includes('agent') || text.includes('contact') || text.includes('help') || text.includes('email') || text.includes('call') || text.includes('person')) {
      return {
        role: 'bot',
        text: `👋 **Our Support Team is Here for You!**<br>
You can leave a message right here, and our support executive will review your ticket and email you back:`,
        time: getCurrentTime(),
        isSupportForm: true
      };
    }

    // 15. General Greeting
    if (text.match(/^(hi|hello|hey|greetings|good morning|good afternoon|good evening|yo)/)) {
      return {
        role: 'bot',
        text: `Hello! 🌿 Welcome to Harvest Root. How can I assist your spice journey today?`,
        time: getCurrentTime(),
        chips: [
          { label: '🛒 See My Cart', query: 'how do i see my cart?' },
          { label: '🌿 Our Spices', query: 'tell me about your spices' },
          { label: '🚚 Shipping Policy', query: 'what is shipping policy?' }
        ]
      };
    }

    // 16. Thanks / Goodbye
    if (text.includes('thank') || text.includes('bye') || text.includes('awesome') || text.includes('good') || text.includes('nice')) {
      return {
        role: 'bot',
        text: `You're very welcome! Feel free to ask anytime. Happy cooking with authentic Coorg spices! 🍃`,
        time: getCurrentTime()
      };
    }

    // Fallback helpful reply
    return {
      role: 'bot',
      text: `I'd love to help! You can ask about **your cart**, our **Coorg spices**, **shipping rates**, **order tracking**, or leave a direct message for our support staff below:`,
      time: getCurrentTime(),
      chips: [
        { label: '🛒 View My Cart', query: 'how do i see my cart?' },
        { label: '🌿 Our Spices', query: 'What spices do you sell?' },
        { label: '🚚 Shipping Policy', query: 'Shipping costs and delivery time' },
        { label: '💬 Talk to Human', query: 'Connect me with support team' }
      ]
    };
  }

  // ===== UTILITY FUNCTIONS =====
  function getCurrentTime() {
    const d = new Date();
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatText(str) {
    if (!str) return '';
    // Basic Markdown formatting: **bold**, *italic*, newlines
    let formatted = str
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
    return formatted;
  }

  // ===== INITIALIZE WHEN DOM READY =====
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectChatbotDOM);
  } else {
    injectChatbotDOM();
  }
})();
