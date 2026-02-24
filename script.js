(function() {
    // ==================== CONFIGURATION ====================
    const API_BASE = 'https://my-proxy-server-phi.vercel.app/api/proxy'; // Replace with your proxy URL

    // ---------- Device ID (unique, stored) ----------
    let deviceId = localStorage.getItem('chatDeviceId');
    if (!deviceId) {
        deviceId = crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('chatDeviceId', deviceId);
    }

    // ---------- Global state ----------
    let currentUser = null;               // { deviceId, name }
    let lastMessageTime = new Date(0).toISOString();
    let polling = false;
    let myName = localStorage.getItem('chatMyName') || 'Anonymous';
    let allUsers = [];
    let messages = [];
    let typingTimeout = null;
    let isTyping = false;
    let replyToMessage = null;            // { id, text, from }
    let searchQuery = '';
    let notificationsEnabled = localStorage.getItem('notifications') !== 'false';
    let soundEnabled = localStorage.getItem('sound') !== 'false';
    let historyEnabled = localStorage.getItem('history') !== 'false';
    let readReceiptsEnabled = localStorage.getItem('readReceipts') !== 'false';
    let typingIndicatorEnabled = localStorage.getItem('typingIndicator') !== 'false';
    let isOffline = !navigator.onLine;
    let pendingMessages = [];              // for offline queue

    // ---------- Touch/swipe state ----------
    let touchStartX = 0;
    let touchEndX = 0;
    const minSwipeDistance = 50;

    // ---------- DOM Elements ----------
    const appContainer = document.querySelector('.app-container');
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const rightPanel = document.getElementById('rightPanel');
    const rightPanelToggle = document.getElementById('rightPanelToggle');
    const themeToggle = document.getElementById('themeToggle');
    const themeSelect = document.getElementById('themeSelect');
    const notificationsToggle = document.getElementById('notificationsToggle');
    const soundToggle = document.getElementById('soundToggle');
    const historyToggle = document.getElementById('historyToggle');
    const readReceiptsToggle = document.getElementById('readReceiptsToggle');
    const typingIndicatorToggle = document.getElementById('typingIndicatorToggle');
    const statusSelect = document.getElementById('statusSelect');
    const offlineIndicator = document.getElementById('offlineIndicator');
    const contactSearch = document.getElementById('contactSearch');
    const recentChatsList = document.getElementById('recentChatsList');
    const onlineUsersList = document.getElementById('onlineUsersList');
    const offlineUsersList = document.getElementById('offlineUsersList');
    const chatWithSpan = document.getElementById('chatWith');
    const chatStatus = document.getElementById('chatStatus');
    const messageContainer = document.getElementById('messageContainer');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');
    const attachBtn = document.getElementById('attachBtn');
    const emojiBtn = document.getElementById('emojiBtn');
    const voiceBtn = document.getElementById('voiceBtn');
    const replyPreview = document.getElementById('replyPreview');
    const replyText = document.getElementById('replyText');
    const cancelReply = document.getElementById('cancelReply');
    const typingIndicatorEl = document.getElementById('typingIndicator');
    const currentUserAvatar = document.getElementById('currentUserAvatar');
    const currentUserDisplayName = document.getElementById('currentUserDisplayName');
    const currentUserStatus = document.getElementById('currentUserStatus');
    const profileAvatar = document.getElementById('profileAvatar');
    const profileName = document.getElementById('profileName');
    const profileBio = document.getElementById('profileBio');
    const nameInputContainer = document.getElementById('nameInputContainer');
    const nameInput = document.getElementById('nameInput');
    const setNameBtn = document.getElementById('setNameBtn');
    const editProfileBtn = document.getElementById('editProfileBtn');
    const userMenuToggle = document.getElementById('userMenuToggle');
    const emojiModal = document.getElementById('emojiPickerModal');
    const mediaModal = document.getElementById('mediaPreviewModal');
    const userProfileModal = document.getElementById('userProfileModal');
    const closeModals = document.querySelectorAll('.close-modal');
    const emojiGrid = document.getElementById('emojiGrid');
    const mediaPreviewContent = document.getElementById('mediaPreviewContent');
    const settingsDropdown = document.getElementById('settingsDropdown');
    const dropdownMenu = settingsDropdown?.querySelector('.dropdown-menu');
    const collapsibleTriggers = document.querySelectorAll('[data-toggle="collapse"]');
    const swipeableElements = document.querySelectorAll('[data-swipeable="true"]');

    // ==================== INITIALISATION ====================
    // Set initial profile
    profileName.textContent = myName;
    profileAvatar.textContent = myName[0] || '?';
    currentUserAvatar.textContent = myName[0] || '?';
    currentUserDisplayName.textContent = myName;
    nameInput.value = myName;

    // Load theme preference
    const savedTheme = localStorage.getItem('theme') || 'auto';
    document.documentElement.setAttribute('data-theme', savedTheme);
    themeSelect.value = savedTheme;
    updateThemeIcon(savedTheme);

    // Set toggle states
    notificationsToggle.checked = notificationsEnabled;
    soundToggle.checked = soundEnabled;
    historyToggle.checked = historyEnabled;
    if (readReceiptsToggle) readReceiptsToggle.checked = readReceiptsEnabled;
    if (typingIndicatorToggle) typingIndicatorToggle.checked = typingIndicatorEnabled;
    if (statusSelect) statusSelect.value = localStorage.getItem('userStatus') || 'online';

    // Notification permission
    if ('Notification' in window && Notification.permission !== 'denied' && notificationsEnabled) {
        Notification.requestPermission().then(perm => {
            notificationsEnabled = perm === 'granted';
        });
    }

    // Register on load
    registerDevice();

    // Online/offline detection
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();

    // ==================== CORE FUNCTIONS ====================
    function registerDevice() {
        fetch(`${API_BASE}?action=register&deviceId=${deviceId}`)
            .then(res => res.json())
            .then(data => console.log('Registered', data))
            .catch(err => console.warn('Registration failed, will retry', err));
    }

    function updateOnlineStatus() {
        isOffline = !navigator.onLine;
        offlineIndicator.classList.toggle('hidden', !isOffline);
        if (!isOffline && pendingMessages.length > 0) {
            sendPendingMessages();
        }
    }

    function sendPendingMessages() {
        pendingMessages.forEach(msgData => {
            fetch(`${API_BASE}?action=sendMessage&fromDeviceId=${deviceId}&toDeviceId=${msgData.to}&message=${encodeURIComponent(msgData.text)}`, { method: 'POST' })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        pendingMessages = pendingMessages.filter(m => m !== msgData);
                    }
                })
                .catch(() => {});
        });
    }

    // Load users
    function loadUsers() {
        if (isOffline) return;
        fetch(`${API_BASE}?action=getUsers&deviceId=${deviceId}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    allUsers = data.data;
                    renderUsers(allUsers);
                    renderRecentChats(allUsers);
                }
            })
            .catch(() => {});
    }

    function renderUsers(users) {
        // Simulate online/offline (in real app, use lastSeen)
        const online = users.filter(() => Math.random() > 0.5);
        const offline = users.filter(u => !online.includes(u));

        onlineUsersList.innerHTML = '';
        offlineUsersList.innerHTML = '';

        online.forEach(user => renderUserItem(user, onlineUsersList, true));
        offline.forEach(user => renderUserItem(user, offlineUsersList, false));

        if (online.length === 0) {
            onlineUsersList.innerHTML = '<div class="section-title" style="margin-top:0;">No users online</div>';
        }
        if (offline.length === 0) {
            offlineUsersList.innerHTML = '<div class="section-title" style="margin-top:0;">No offline users</div>';
        }
    }

    function renderUserItem(user, container, isOnline) {
        const div = document.createElement('div');
        div.className = 'user-item' + (currentUser && currentUser.deviceId === user.deviceId ? ' selected' : '');
        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        avatar.textContent = (user.name && user.name[0]) || '?';
        const info = document.createElement('div');
        info.className = 'user-info';
        info.innerHTML = `<div class="user-name">${user.name} ${isOnline ? '<span class="badge-online"></span>' : ''}</div>
                           <div class="user-status">${user.deviceId.substr(0,6)}…</div>`;
        div.appendChild(avatar);
        div.appendChild(info);
        div.onclick = () => selectUser(user);
        container.appendChild(div);
    }

    function renderRecentChats(users) {
        recentChatsList.innerHTML = '';
        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'chat-item' + (currentUser && currentUser.deviceId === user.deviceId ? ' selected' : '');
            const avatar = document.createElement('div');
            avatar.className = 'chat-avatar';
            avatar.textContent = (user.name && user.name[0]) || '?';
            const info = document.createElement('div');
            info.className = 'chat-info';
            info.innerHTML = `<div class="chat-name">${user.name}</div>
                               <div class="chat-last-message">Last message preview...</div>`;
            const time = document.createElement('div');
            time.className = 'chat-timestamp';
            time.textContent = 'now';
            div.appendChild(avatar);
            div.appendChild(info);
            div.appendChild(time);
            div.onclick = () => selectUser(user);
            recentChatsList.appendChild(div);
        });
    }

    function selectUser(user) {
        currentUser = user;
        chatWithSpan.textContent = user.name;
        messageContainer.innerHTML = '';
        messages = [];
        lastMessageTime = new Date(0).toISOString();
        loadMessages();
        startPolling();
        document.querySelectorAll('.user-item, .chat-item').forEach(el => el.classList.remove('selected'));
        if (event && event.currentTarget) event.currentTarget.classList.add('selected');
        replyToMessage = null;
        replyPreview.classList.add('hidden');
    }

    function loadMessages() {
        if (!currentUser || isOffline) return;
        fetch(`${API_BASE}?action=getMessages&deviceId=${deviceId}&since=${lastMessageTime}`)
            .then(res => res.json())
            .then(data => {
                if (data.success && data.data.length > 0) {
                    const newMessages = data.data.filter(m => !messages.some(ex => ex.id === m.id));
                    if (newMessages.length) {
                        messages = [...messages, ...newMessages];
                        appendMessages(newMessages);
                        if (notificationsEnabled && currentUser && Notification.permission === 'granted') {
                            newMessages.forEach(msg => {
                                if (msg.from !== deviceId) {
                                    new Notification(`Message from ${currentUser.name}`, {
                                        body: msg.text,
                                        icon: 'https://via.placeholder.com/48'
                                    });
                                }
                            });
                        }
                        if (soundEnabled) {
                            playNotificationSound();
                        }
                    }
                    const latest = data.data[data.data.length - 1].timestamp;
                    if (latest > lastMessageTime) lastMessageTime = latest;
                }
            })
            .catch(() => {});
    }

    function playNotificationSound() {
        try {
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioContext.createOscillator();
            const gainNode = audioContext.createGain();
            oscillator.connect(gainNode);
            gainNode.connect(audioContext.destination);
            oscillator.frequency.value = 800;
            gainNode.gain.value = 0.1;
            oscillator.start();
            oscillator.stop(audioContext.currentTime + 0.1);
        } catch (e) {
            console.log('Sound not available');
        }
    }

    function appendMessages(messagesToAdd) {
        messagesToAdd.forEach(msg => {
            const msgDiv = createMessageElement(msg);
            messageContainer.appendChild(msgDiv);
        });
        messageContainer.scrollTop = messageContainer.scrollHeight;
    }

    function createMessageElement(msg) {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'message ' + (msg.from === deviceId ? 'mine' : '');
        msgDiv.dataset.messageId = msg.id;
        msgDiv.dataset.from = msg.from;
        msgDiv.dataset.text = msg.text;

        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = (msg.from === deviceId) ? (myName[0] || 'U') : (currentUser.name[0] || 'U');

        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';

        let formattedText = msg.text
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>')
            .replace(/__(.*?)__/g, '<u>$1</u>')
            .replace(/`(.*?)`/g, '<code>$1</code>');
        bubbleDiv.innerHTML = formattedText;

        const reactionsDiv = document.createElement('div');
        reactionsDiv.className = 'message-reactions';
        bubbleDiv.appendChild(reactionsDiv);

        const meta = document.createElement('div');
        meta.className = 'message-meta';
        const d = new Date(msg.timestamp);
        meta.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (msg.from === deviceId && readReceiptsEnabled) {
            const statusSpan = document.createElement('span');
            statusSpan.className = 'message-status';
            statusSpan.innerHTML = ' ✓✓';
            meta.appendChild(statusSpan);
        }
        bubbleDiv.appendChild(meta);

        msgDiv.appendChild(avatar);
        msgDiv.appendChild(bubbleDiv);

        msgDiv.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showMessageContextMenu(e, msg);
        });

        msgDiv.addEventListener('dblclick', () => {
            showReactionPicker(msg);
        });

        return msgDiv;
    }

    // ==================== ENHANCED FEATURES (Placeholders) ====================
    function showReactionPicker(msg) {
        alert('✨ Reactions coming soon!');
    }

    function showMessageContextMenu(e, msg) {
        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.position = 'absolute';
        menu.style.background = 'var(--bg-primary)';
        menu.style.border = '1px solid var(--border-light)';
        menu.style.borderRadius = '12px';
        menu.style.padding = '8px 0';
        menu.style.boxShadow = 'var(--shadow-md)';
        menu.style.zIndex = '1000';
        menu.style.minWidth = '150px';

        const items = [
            { label: 'Reply', action: () => replyTo(msg) },
            { label: 'Copy', action: () => copyMessage(msg.text) },
            { label: 'Forward', action: () => alert('✨ Forward coming soon!') },
            { label: 'Edit', action: () => editMessage(msg), disabled: msg.from !== deviceId },
            { label: 'Delete', action: () => deleteMessage(msg), disabled: msg.from !== deviceId }
        ];

        items.forEach(item => {
            if (item.disabled) return;
            const div = document.createElement('div');
            div.textContent = item.label;
            div.style.padding = '8px 16px';
            div.style.cursor = 'pointer';
            div.style.fontSize = '0.9rem';
            div.style.color = 'var(--text-primary)';
            div.onmouseover = () => div.style.background = 'var(--bg-tertiary)';
            div.onmouseout = () => div.style.background = 'transparent';
            div.onclick = () => {
                item.action();
                menu.remove();
            };
            menu.appendChild(div);
        });

        document.body.appendChild(menu);
        menu.style.left = e.pageX + 'px';
        menu.style.top = e.pageY + 'px';

        setTimeout(() => {
            document.addEventListener('click', function closeMenu() {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }, { once: true });
        }, 10);
    }

    function replyTo(msg) {
        replyToMessage = { id: msg.id, text: msg.text, from: msg.from };
        replyText.textContent = `Replying to ${msg.from === deviceId ? 'yourself' : currentUser.name}: ${msg.text.substring(0,30)}...`;
        replyPreview.classList.remove('hidden');
    }

    function copyMessage(text) {
        navigator.clipboard.writeText(text).then(() => {
            alert('Message copied!');
        });
    }

    function editMessage(msg) {
        alert('✨ Edit coming soon!');
    }

    function deleteMessage(msg) {
        alert('✨ Delete coming soon!');
    }

    // ==================== TYPING INDICATOR ====================
    messageInput.addEventListener('input', () => {
        if (!currentUser || !typingIndicatorEnabled) return;
        if (!isTyping) {
            isTyping = true;
            chatStatus.innerHTML = '<span class="badge-online"></span> typing...';
        }
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            isTyping = false;
            chatStatus.innerHTML = '<span class="badge-online"></span> online';
        }, 2000);
    });

    // ==================== EMOJI PICKER ====================
    emojiBtn.addEventListener('click', () => {
        emojiModal.classList.remove('hidden');
        if (emojiGrid.children.length === 0) {
            const emojis = ['😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃','😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜','🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔','😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤','😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓','🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦','😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮','🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','🤡','💩','👻','💀','☠️','👽','👾','🤖','🎃','😺','😸','😹','😻','😼','😽','🙀','😿','😾'];
            emojis.forEach(emoji => {
                const btn = document.createElement('button');
                btn.textContent = emoji;
                btn.onclick = () => {
                    messageInput.value += emoji;
                    emojiModal.classList.add('hidden');
                };
                emojiGrid.appendChild(btn);
            });
        }
    });

    // ==================== FILE ATTACHMENT ====================
    attachBtn.addEventListener('click', () => {
        alert('✨ File upload coming soon!');
    });

    // ==================== VOICE MESSAGE ====================
    voiceBtn.addEventListener('click', () => {
        alert('✨ Voice messages coming soon!');
    });

    // ==================== SEND MESSAGE ====================
    sendBtn.addEventListener('click', () => {
        let msg = messageInput.value;
        if (!msg || !currentUser) return;

        if (replyToMessage) {
            msg = `> ${replyToMessage.text}\n\n` + msg;
            replyToMessage = null;
            replyPreview.classList.add('hidden');
        }

        if (isOffline) {
            pendingMessages.push({ to: currentUser.deviceId, text: msg });
            const tempMsg = {
                id: 'pending-' + Date.now(),
                from: deviceId,
                text: msg + ' (pending)',
                timestamp: new Date().toISOString()
            };
            messages.push(tempMsg);
            appendMessages([tempMsg]);
            messageInput.value = '';
            return;
        }

        fetch(`${API_BASE}?action=sendMessage&fromDeviceId=${deviceId}&toDeviceId=${currentUser.deviceId}&message=${encodeURIComponent(msg)}`, { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    messageInput.value = '';
                    const tempMsg = {
                        id: data.data.messageId || 'temp-' + Date.now(),
                        from: deviceId,
                        text: msg,
                        timestamp: data.data.timestamp || new Date().toISOString()
                    };
                    messages.push(tempMsg);
                    appendMessages([tempMsg]);
                }
            })
            .catch(() => {
                pendingMessages.push({ to: currentUser.deviceId, text: msg });
                const tempMsg = {
                    id: 'pending-' + Date.now(),
                    from: deviceId,
                    text: msg + ' (pending)',
                    timestamp: new Date().toISOString()
                };
                messages.push(tempMsg);
                appendMessages([tempMsg]);
                messageInput.value = '';
            });
    });

    // ==================== SET NAME (hide input after set) ====================
    setNameBtn.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (!name) return;
        fetch(`${API_BASE}?action=setName&deviceId=${deviceId}&name=${encodeURIComponent(name)}`, { method: 'POST' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    myName = name;
                    localStorage.setItem('chatMyName', myName);
                    profileName.textContent = myName;
                    profileAvatar.textContent = myName[0] || '?';
                    currentUserAvatar.textContent = myName[0] || '?';
                    currentUserDisplayName.textContent = myName;
                    // Hide the name input container after successful set
                    nameInputContainer.classList.add('hidden');
                    loadUsers();
                }
            });
    });

    // ==================== CANCEL REPLY ====================
    cancelReply.addEventListener('click', () => {
        replyToMessage = null;
        replyPreview.classList.add('hidden');
    });

    // ==================== SEARCH ====================
    contactSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = allUsers.filter(u => u.name.toLowerCase().includes(query) || u.deviceId.includes(query));
        renderUsers(filtered);
    });

    // ==================== THEME ====================
    themeToggle.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        let newTheme;
        if (current === 'light') newTheme = 'dark';
        else if (current === 'dark') newTheme = 'auto';
        else newTheme = 'light';
        applyTheme(newTheme);
    });

    themeSelect.addEventListener('change', (e) => {
        applyTheme(e.target.value);
    });

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        updateThemeIcon(theme);
        themeSelect.value = theme;
    }

    function updateThemeIcon(theme) {
        if (theme === 'dark') {
            themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        } else if (theme === 'auto') {
            themeToggle.innerHTML = '<i class="fas fa-circle-half-stroke"></i>';
        } else {
            themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        }
    }

    // ==================== SETTINGS TOGGLES ====================
    notificationsToggle.addEventListener('change', (e) => {
        notificationsEnabled = e.target.checked;
        localStorage.setItem('notifications', notificationsEnabled);
        if (notificationsEnabled && Notification.permission !== 'granted') {
            Notification.requestPermission();
        }
    });

    soundToggle.addEventListener('change', (e) => {
        soundEnabled = e.target.checked;
        localStorage.setItem('sound', soundEnabled);
    });

    historyToggle.addEventListener('change', (e) => {
        historyEnabled = e.target.checked;
        localStorage.setItem('history', historyEnabled);
    });

    if (readReceiptsToggle) {
        readReceiptsToggle.addEventListener('change', (e) => {
            readReceiptsEnabled = e.target.checked;
            localStorage.setItem('readReceipts', readReceiptsEnabled);
            // Optionally refresh current chat to show/hide status
        });
    }

    if (typingIndicatorToggle) {
        typingIndicatorToggle.addEventListener('change', (e) => {
            typingIndicatorEnabled = e.target.checked;
            localStorage.setItem('typingIndicator', typingIndicatorEnabled);
        });
    }

    if (statusSelect) {
        statusSelect.addEventListener('change', (e) => {
            const status = e.target.value;
            localStorage.setItem('userStatus', status);
            currentUserStatus.textContent = status;
            // In a real app, would send status update to backend
        });
    }

    // ==================== DROPDOWN MENU (settings cog) ====================
    if (settingsDropdown) {
        const cogBtn = settingsDropdown.querySelector('.icon-btn');
        cogBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdownMenu.classList.toggle('hidden');
        });

        document.addEventListener('click', (e) => {
            if (!settingsDropdown.contains(e.target)) {
                dropdownMenu.classList.add('hidden');
            }
        });
    }

    // ==================== COLLAPSIBLE SECTIONS ====================
    collapsibleTriggers.forEach(trigger => {
        trigger.addEventListener('click', () => {
            const targetId = trigger.dataset.target;
            const target = document.querySelector(targetId);
            if (target) {
                target.classList.toggle('expanded');
                const expanded = target.classList.contains('expanded');
                trigger.setAttribute('aria-expanded', expanded);
            }
        });
    });

    // ==================== SWIPE DETECTION ====================
    swipeableElements.forEach(el => {
        el.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        el.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe(el);
        }, { passive: true });
    });

    function handleSwipe(el) {
        const diff = touchEndX - touchStartX;
        if (Math.abs(diff) < minSwipeDistance) return;

        if (el === sidebar && diff > 0) {
            // Swipe right on sidebar – open (if closed)
            sidebar.classList.add('open');
        } else if (el === sidebar && diff < 0) {
            // Swipe left on sidebar – close (if open)
            sidebar.classList.remove('open');
        } else if (el === rightPanel && diff < 0) {
            // Swipe left on right panel – open (if closed)
            rightPanel.classList.add('open');
        } else if (el === rightPanel && diff > 0) {
            // Swipe right on right panel – close (if open)
            rightPanel.classList.remove('open');
        }
    }

    // ==================== SIDEBAR / RIGHT PANEL TOGGLES (for mobile) ====================
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    if (rightPanelToggle) {
        rightPanelToggle.addEventListener('click', () => {
            rightPanel.classList.toggle('open');
        });
    }

    // Close sidebars when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
                sidebar.classList.remove('open');
            }
            if (!rightPanel.contains(e.target) && !rightPanelToggle.contains(e.target) && !userMenuToggle.contains(e.target)) {
                rightPanel.classList.remove('open');
            }
        }
    });

    // ==================== EDIT PROFILE (placeholder) ====================
    editProfileBtn.addEventListener('click', () => {
        if (profileBio.isContentEditable) {
            profileBio.contentEditable = false;
            editProfileBtn.innerHTML = '<i class="fas fa-edit"></i> Edit';
            // Save bio (would send to backend)
            alert('✨ Profile updated (placeholder)');
        } else {
            profileBio.contentEditable = true;
            profileBio.focus();
            editProfileBtn.innerHTML = '<i class="fas fa-save"></i> Save';
        }
    });

    // ==================== USER MENU (placeholder) ====================
    userMenuToggle.addEventListener('click', () => {
        alert('✨ User menu coming soon!');
    });

    // ==================== MODALS ====================
    closeModals.forEach(btn => {
        btn.addEventListener('click', () => {
            emojiModal.classList.add('hidden');
            mediaModal.classList.add('hidden');
            userProfileModal.classList.add('hidden');
        });
    });

    window.addEventListener('click', (e) => {
        if (e.target === emojiModal || e.target === mediaModal || e.target === userProfileModal) {
            emojiModal.classList.add('hidden');
            mediaModal.classList.add('hidden');
            userProfileModal.classList.add('hidden');
        }
    });

    // ==================== TAB SWITCHING ====================
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.dataset.tab;
            document.getElementById('chatsPanel').classList.toggle('hidden', target !== 'chats');
            document.getElementById('contactsPanel').classList.toggle('hidden', target !== 'contacts');
            document.getElementById('featuresPanel').classList.toggle('hidden', target !== 'features');
        });
    });

    // ==================== POLLING ====================
    function startPolling() {
        if (polling) return;
        polling = true;
        const interval = setInterval(() => {
            if (!currentUser) {
                clearInterval(interval);
                polling = false;
                return;
            }
            loadMessages();
        }, 3000);
    }

    // ==================== FEATURE TREE ====================
    // !!! PASTE YOUR FULL RAW_TREE CONSTANT HERE (the huge tree from previous scripts) !!!
    const RAW_TREE = `SOCIAL-MEDIA-ECOSYSTEM/
│
├── PLATFORM-TYPES/
│   ├── MESSAGING-PLATFORM/
│   │   ├── CORE-ARCHITECTURE/
│   │   │   ├── CLOUD-INFRASTRUCTURE/
│   │   │   │   ├── Message-Sync-Across-Devices
│   │   │   │   ├── Cloud-Storage
│   │   │   │   ├── Message-History
│   │   │   │   └── Zero-Device-Storage
│   │   │   ├── PROTOCOLS/
│   │   │   │   ├── End-to-End-Encryption
│   │   │   │   ├── Serverless-Mesh
│   │   │   │   ├── Decentralized-Network
│   │   │   │   └── Onion-Routing
│   │   │   └── AUTHENTICATION/
│   │   │       ├── Phone-Number
│   │   │       ├── Email-Only
│   │   │       ├── Anonymous-ID
│   │   │       ├── QR-Code-Login
│   │   │       ├── Passkeys-Biometric
│   │   │       └── Two-Factor
│   │   │
│   │   ├── COMMUNICATION/
│   │   │   ├── ONE-ON-ONE-CHAT/
│   │   │   │   ├── MESSAGE-TYPES/
│   │   │   │   │   ├── Text
│   │   │   │   │   ├── Photo
│   │   │   │   │   ├── Video
│   │   │   │   │   ├── Voice-Message
│   │   │   │   │   ├── File
│   │   │   │   │   ├── GIF
│   │   │   │   │   ├── Sticker
│   │   │   │   │   ├── Location
│   │   │   │   │   └── Payment
│   │   │   │   └── MESSAGE-ACTIONS/
│   │   │   │       ├── Edit
│   │   │   │       ├── Delete-for-Everyone
│   │   │   │       ├── Unsend
│   │   │   │       ├── Schedule
│   │   │   │       ├── Forward
│   │   │   │       ├── Reply
│   │   │   │       ├── Mention
│   │   │   │       ├── Star-Save
│   │   │   │       └── React
│   │   │   │
│   │   │   ├── GROUP-CHAT/
│   │   │   │   ├── Sizes/
│   │   │   │   │   ├── Small (2-50)
│   │   │   │   │   ├── Large (51-1000)
│   │   │   │   │   └── Massive (1001-200000)
│   │   │   │   ├── ADMIN-TOOLS/
│   │   │   │   │   ├── Member-Approval
│   │   │   │   │   ├── Permissions
│   │   │   │   │   ├── Topics
│   │   │   │   │   ├── Announcements
│   │   │   │   │   └── Checklists
│   │   │   │   └── FEATURES/
│   │   │   │       ├── Polls
│   │   │   │       ├── Quizzes
│   │   │   │       ├── Shared-Media
│   │   │   │       └── Group-Transfer
│   │   │   │
│   │   │   ├── VOICE-CALLS/
│   │   │   │   ├── One-on-One
│   │   │   │   ├── Group
│   │   │   │   ├── Encrypted
│   │   │   │   └── Low-Data-Mode
│   │   │   │
│   │   │   └── VIDEO-CALLS/
│   │   │       ├── One-on-One
│   │   │       ├── Group
│   │   │       ├── Screen-Sharing
│   │   │       ├── Call-Links
│   │   │       ├── Reactions
│   │   │       └── Backgrounds
│   │   │
│   │   ├── CHANNELS-BROADCAST/
│   │   │   ├── PUBLIC-CHANNELS/
│   │   │   │   ├── Unlimited-Subscribers
│   │   │   │   ├── Comments
│   │   │   │   └── Suggested-Posts
│   │   │   └── BROADCAST-TOOLS/
│   │   │       ├── Statistics
│   │   │       ├── Schedule
│   │   │       └── Monetization
│   │   │
│   │   ├── STORIES/
│   │   │   ├── CREATION/
│   │   │   │   ├── Photo
│   │   │   │   ├── Video
│   │   │   │   ├── Text
│   │   │   │   ├── Music
│   │   │   │   └── Audio-Files
│   │   │   ├── DURATION/
│   │   │   │   ├── 24-Hours
│   │   │   │   ├── 48-Hours
│   │   │   │   ├── 7-Days
│   │   │   │   └── Permanent-Albums
│   │   │   ├── INTERACTIONS/
│   │   │   │   ├── Reactions
│   │   │   │   ├── Polls
│   │   │   │   ├── Questions
│   │   │   │   ├── Quizzes
│   │   │   │   └── Countdowns
│   │   │   └── PRIVACY/
│   │   │       ├── Close-Friends
│   │   │       ├── Hide-From
│   │   │       └── Viewers-List
│   │   │
│   │   ├── PRIVACY-SECURITY/
│   │   │   ├── ENCRYPTION-LAYERS/
│   │   │   │   ├── Default-Cloud
│   │   │   │   ├── Secret-Chats
│   │   │   │   ├── Self-Destruct-Timer
│   │   │   │   └── Forwarding-Ban
│   │   │   ├── CONTROLS/
│   │   │   │   ├── Last-Seen
│   │   │   │   ├── Profile-Photo
│   │   │   │   ├── Read-Receipts
│   │   │   │   ├── Typing-Indicator
│   │   │   │   ├── Forwarding
│   │   │   │   └── Screenshot-Block
│   │   │   └── ACCOUNT-PROTECTION/
│   │   │       ├── Two-Step-Verification
│   │   │       ├── Login-Alerts
│   │   │       ├── Active-Sessions
│   │   │       ├── Frozen-Accounts
│   │   │       └── Appeals
│   │   │
│   │   ├── FILE-SHARING/
│   │   │   ├── TYPES/
│   │   │   │   ├── Documents
│   │   │   │   ├── Images
│   │   │   │   ├── Videos
│   │   │   │   ├── Audio
│   │   │   │   └── Archives
│   │   │   ├── LIMITS/
│   │   │   │   ├── Small (100MB)
│   │   │   │   ├── Medium (2GB)
│   │   │   │   └── Large (4GB+)
│   │   │   └── CLOUD/
│   │   │       ├── Saved-Messages
│   │   │       ├── Personal-Storage
│   │   │       └── Searchable-Archive
│   │   │
│   │   ├── BOTS-AUTOMATION/
│   │   │   ├── BOT-TYPES/
│   │   │   │   ├── Customer-Service
│   │   │   │   ├── AI-Assistant
│   │   │   │   ├── Games
│   │   │   │   ├── Productivity
│   │   │   │   └── E-commerce
│   │   │   ├── MINI-APPS/
│   │   │   │   ├── Full-Screen
│   │   │   │   ├── Geolocation
│   │   │   │   └── Payments
│   │   │   └── BUSINESS-AUTOMATION/
│   │   │       ├── Away-Messages
│   │   │       ├── Greetings
│   │   │       ├── Quick-Replies
│   │   │       └── Labels
│   │   │
│   │   ├── CUSTOMIZATION/
│   │   │   ├── THEMES/
│   │   │   │   ├── Light-Dark
│   │   │   │   ├── Custom-Colors
│   │   │   │   ├── Liquid-Glass
│   │   │   │   └── Gift-Based
│   │   │   ├── STICKERS/
│   │   │   │   ├── Default
│   │   │   │   ├── Animated
│   │   │   │   ├── Custom-Creation
│   │   │   │   └── Packs
│   │   │   └── PROFILE/
│   │   │       ├── Music
│   │   │       ├── Birthday
│   │   │       ├── Collectibles
│   │   │       └── Default-Tab
│   │   │
│   │   ├── ECONOMY/
│   │   │   ├── CURRENCY/
│   │   │   │   ├── In-App-Stars
│   │   │   │   ├── Blockchain-Collectibles
│   │   │   │   └── Gifts
│   │   │   ├── TRANSACTIONS/
│   │   │   │   ├── Send-Money
│   │   │   │   ├── Receive-Money
│   │   │   │   ├── Tip-Creators
│   │   │   │   └── Upgrade-Gifts
│   │   │   └── COLLECTIBLES/
│   │   │       ├── Crafting
│   │   │       ├── Collections
│   │   │       ├── Trading
│   │   │       └── Offers
│   │   │
│   │   ├── SEARCH/
│   │   │   ├── GLOBAL/
│   │   │   │   ├── Messages
│   │   │   │   ├── Media
│   │   │   │   ├── Links
│   │   │   │   └── Files
│   │   │   ├── PUBLIC/
│   │   │   │   ├── Channels
│   │   │   │   ├── Groups
│   │   │   │   └── Posts
│   │   │   └── ADVANCED/
│   │   │       ├── Filters
│   │   │       ├── Hashtags
│   │   │       └── Date-Range
│   │   │
│   │   ├── DEVICES/
│   │   │   ├── MOBILE/
│   │   │   │   ├── iOS
│   │   │   │   ├── Android
│   │   │   │   └── Gestures
│   │   │   ├── DESKTOP/
│   │   │   │   ├── Windows
│   │   │   │   ├── Mac
│   │   │   │   ├── Linux
│   │   │   │   └── Keyboard-Shortcuts
│   │   │   ├── WEB/
│   │   │   │   ├── Browser-Version
│   │   │   │   └── Progressive-Web-App
│   │   │   └── MULTI-DEVICE/
│   │   │       ├── Simultaneous-Login
│   │   │       ├── Device-Management
│   │   │       └── Logout-Remote
│   │   │
│   │   └── LEGAL/
│   │       ├── Terms-of-Service
│   │       ├── Privacy-Policy
│   │       ├── Community-Guidelines
│   │       ├── Data-Processing
│   │       └── Age-Restrictions
│   │
│   └── ... (additional platforms truncated for brevity – replace with your full tree)
│
└── LEGAL-FRAMEWORK/
    ├── USER-AGREEMENTS/
    │   ├── Terms-of-Service
    │   ├── Acceptable-Use
    │   └── Age-Requirements
    ├── PRIVACY/
    │   ├── Privacy-Policy
    │   ├── Data-Processing
    │   ├── Cookies
    │   └── International-Transfers
    ├── CONTENT/
    │   ├── Community-Guidelines
    │   ├── Copyright
    │   ├── Trademark
    │   └── Prohibited-Content
    ├── COMMERCE/
    │   ├── Merchant-Policies
    │   ├── Advertising-Policies
    │   ├── Payment-Terms
    │   └── Refunds
    └── ENFORCEMENT/
        ├── Reporting
        ├── Appeals
        ├── Account-Suspension
        └── Legal-Requests
`; // End of RAW_TREE (replace with your complete tree)

    function parseTree(text) {
        const lines = text.split('\n');
        const root = { name: 'SOCIAL-MEDIA-ECOSYSTEM', children: [] };
        const stack = [{ node: root, depth: 0 }];
        for (let line of lines) {
            if (line.trim() === '' || line.trim() === '│') continue;
            const dashIndex = line.indexOf('──');
            if (dashIndex === -1) continue;
            const beforeDash = line.substring(0, dashIndex);
            const depth = (beforeDash.match(/│/g) || []).length;
            let name = line.substring(dashIndex + 2).replace(/\/$/, '').trim();
            const newNode = { name, children: [] };
            while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
            if (stack.length === 0) continue;
            const parent = stack[stack.length - 1].node;
            parent.children.push(newNode);
            stack.push({ node: newNode, depth });
        }
        return root;
    }

    function renderFeatureNode(node) {
        const li = document.createElement('li');
        li.className = node.children.length ? 'branch' : 'leaf';
        const div = document.createElement('div');
        div.className = 'tree-node';
        const caretSpan = document.createElement('span');
        caretSpan.className = 'caret';
        caretSpan.textContent = '▶';
        if (node.children.length === 0) caretSpan.style.visibility = 'hidden';
        const nameSpan = document.createElement('span');
        nameSpan.className = 'node-name';
        nameSpan.textContent = node.name;
        div.appendChild(caretSpan);
        div.appendChild(nameSpan);
        li.appendChild(div);
        if (node.children.length > 0) {
            const childUl = document.createElement('ul');
            childUl.className = 'children';
            childUl.style.display = 'none';
            node.children.forEach(child => childUl.appendChild(renderFeatureNode(child)));
            li.appendChild(childUl);
            div.addEventListener('click', (e) => {
                e.stopPropagation();
                const isExpanded = childUl.style.display !== 'none';
                childUl.style.display = isExpanded ? 'none' : 'block';
                caretSpan.classList.toggle('expanded', !isExpanded);
            });
        }
        return li;
    }

    // Build feature tree and insert into DOM
    const treeData = parseTree(RAW_TREE);
    const featureTreeEl = document.getElementById('featureTree');
    if (featureTreeEl) {
        const rootUl = document.createElement('ul');
        rootUl.style.listStyle = 'none';
        rootUl.style.paddingLeft = '0';
        const rootLi = renderFeatureNode(treeData);
        const rootCaret = rootLi.querySelector('.caret');
        if (rootCaret) rootCaret.style.visibility = 'hidden';
        const rootChildren = rootLi.querySelector('ul');
        if (rootChildren) rootChildren.style.display = 'block';
        rootUl.appendChild(rootLi);
        featureTreeEl.appendChild(rootUl);
    }

    // ==================== LOAD INITIAL DATA ====================
    loadUsers();
    setInterval(loadUsers, 10000); // refresh every 10 sec

    // ==================== KEYBOARD SHORTCUT ====================
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendBtn.click();
        }
    });

    // ==================== SHOW NAME INPUT IF NOT SET (optional) ====================
    // If name is still 'Anonymous', keep input visible; otherwise hide it.
    if (myName !== 'Anonymous') {
        nameInputContainer.classList.add('hidden');
    }
})();
