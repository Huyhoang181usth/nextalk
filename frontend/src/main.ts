import './style.css';
import { io, Socket } from 'socket.io-client';

const API_URL = 'https://nextalk-production-ace7.up.railway.app'; // IP cục bộ của máy tính bạn

function formatUrl(url: string | undefined | null) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_URL}${url}`;
}
let socket: Socket | null = null;
let currentUserId: number | null = null;
let currentUsername: string | null = null;
let activeChatUserId: number | null = null;
let myInviteCode: string | null = null;
let users: { id: number; username: string; status: 'online' | 'offline'; avatarUrl?: string }[] = [];

// DOM Elements
const authScreen = document.getElementById('auth-screen')!;
const chatScreen = document.getElementById('chat-screen')!;
const authForm = document.getElementById('auth-form') as HTMLFormElement;
const usernameInput = document.getElementById('username') as HTMLInputElement;
const passwordInput = document.getElementById('password') as HTMLInputElement;
const authTitle = document.getElementById('auth-title')!;
const authSubtitle = document.getElementById('auth-subtitle')!;
const authToggleText = document.getElementById('auth-toggle-text')!;
const toggleAuthBtn = document.getElementById('toggle-auth-btn')!;
const authSubmitBtn = document.getElementById('auth-submit')!;
const authError = document.getElementById('auth-error')!;

const currentUsernameSpan = document.getElementById('current-username')!;
const logoutBtn = document.getElementById('logout-btn')!;
const inviteBtn = document.getElementById('invite-btn')!;
const userList = document.getElementById('user-list')!;
const chatHeader = document.getElementById('chat-header')!;
const chatHeaderName = document.getElementById('chat-header-name')!;
const chatHeaderAvatar = document.getElementById('chat-header-avatar')!;
const chatHeaderAvatarImg = document.getElementById('chat-header-avatar-img') as HTMLImageElement;
const chatMessages = document.getElementById('chat-messages')!;
const chatInputArea = document.getElementById('chat-input-area')!;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const messageInput = document.getElementById('message-input') as HTMLInputElement;
const attachBtn = document.getElementById('attach-btn') as HTMLButtonElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;

const addFriendInput = document.getElementById('add-friend-input') as HTMLInputElement;
const addFriendBtn = document.getElementById('add-friend-btn')!;
const toastContainer = document.getElementById('toast-container')!;
const mobileBackBtn = document.getElementById('mobile-back-btn')!;
const mainChat = document.querySelector('.main-chat') as HTMLElement;

mobileBackBtn.addEventListener('click', () => {
  mainChat.classList.remove('mobile-active');
  activeChatUserId = null;
  renderUsers();
});
// Settings DOM
const settingsMenuBtn = document.getElementById('settings-menu-btn')!;
const settingsOverlay = document.getElementById('settings-overlay')!;
const closeSettingsBtn = document.getElementById('close-settings-btn')!;

// Camera DOM
const cameraBtn = document.getElementById('camera-btn')!;
const cameraOverlay = document.getElementById('camera-overlay')!;
const closeCameraBtn = document.getElementById('close-camera-btn')!;
const switchCameraBtn = document.getElementById('switch-camera-btn')!;
const cameraVideo = document.getElementById('camera-video') as HTMLVideoElement;
const cameraTimer = document.getElementById('camera-timer')!;
const modePhotoBtn = document.getElementById('mode-photo-btn')!;
const modeVideoBtn = document.getElementById('mode-video-btn')!;
const captureMediaBtn = document.getElementById('capture-media-btn')!;

const cameraPreviewContainer = document.getElementById('camera-preview-container')!;
const photoPreview = document.getElementById('photo-preview') as HTMLImageElement;
const videoPreview = document.getElementById('video-preview') as HTMLVideoElement;
const retakeMediaBtn = document.getElementById('retake-media-btn') as HTMLButtonElement;
const sendMediaBtn = document.getElementById('send-media-btn') as HTMLButtonElement;
const settingsForm = document.getElementById('settings-form') as HTMLFormElement;
const settingsUsername = document.getElementById('settings-username') as HTMLInputElement;
const settingsEmail = document.getElementById('settings-email') as HTMLInputElement;
const settingsInvite = document.getElementById('settings-invite') as HTMLInputElement;
const copySettingsInviteBtn = document.getElementById('copy-settings-invite-btn')!;
const settingsFriendCount = document.getElementById('settings-friend-count')!;
const settingsJoinedDate = document.getElementById('settings-joined-date')!;
const settingsError = document.getElementById('settings-error')!;
const settingsAvatarInput = document.getElementById('settings-avatar-input') as HTMLInputElement;
const avatarUploadOverlay = document.getElementById('avatar-upload-overlay')!;
const settingsAvatarPreview = document.getElementById('settings-avatar-preview') as HTMLImageElement;
const settingsAvatarPlaceholder = document.getElementById('settings-avatar-placeholder')!;

// Calling DOM
const voiceCallBtn = document.getElementById('voice-call-btn')!;
const videoCallBtn = document.getElementById('video-call-btn')!;
const callOverlay = document.getElementById('call-overlay')!;
const callAvatar = document.getElementById('call-avatar')!;
const callName = document.getElementById('call-name')!;
const callStatus = document.getElementById('call-status')!;
const localVideo = document.getElementById('local-video') as HTMLVideoElement;
const remoteVideo = document.getElementById('remote-video') as HTMLVideoElement;
const toggleMicBtn = document.getElementById('toggle-mic-btn')!;
const toggleVideoBtn = document.getElementById('toggle-video-btn')!;
const endCallBtn = document.getElementById('end-call-btn')!;
const acceptCallBtn = document.getElementById('accept-call-btn')!;

let isLoginMode = true;
let pendingInviteCode: string | null = null;

// WebRTC State
let peerConnection: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let isVideoCall = false;
let callTargetId: number | null = null;
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// Initialize
function init() {
  // Check for invite code in URL
  const urlParams = new URLSearchParams(window.location.search);
  const inviteCode = urlParams.get('invite');
  if (inviteCode) {
    pendingInviteCode = inviteCode;
    // Remove from URL without refreshing
    window.history.replaceState({}, document.title, window.location.pathname);
    showToast(`You have an invite code! Log in or register to connect.`, 'success');
  }

  const token = localStorage.getItem('token');
  const storedUserId = localStorage.getItem('userId');
  const storedUsername = localStorage.getItem('username');
  const storedInviteCode = localStorage.getItem('inviteCode');
  //const storedAvatarUrl = localStorage.getItem('avatarUrl');

  if (token && storedUserId && storedUsername) {
    currentUserId = parseInt(storedUserId);
    currentUsername = storedUsername;
    myInviteCode = storedInviteCode;
    showChatScreen();
  } else {
    showAuthScreen();
  }

  // Init Lucide
  if ((window as any).lucide) {
    (window as any).lucide.createIcons();
  }
}

// Google Login Handler
(window as any).handleGoogleLogin = async (response: any) => {
  try {
    const res = await fetch(`${API_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: response.credential })
    });

    const data = await res.json();
    if (!res.ok) {
      authError.textContent = data.error || 'Google login failed';
      return;
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('userId', data.userId.toString());
    localStorage.setItem('username', data.username);
    localStorage.setItem('inviteCode', data.inviteCode || '');
    if (data.avatarUrl) localStorage.setItem('avatarUrl', data.avatarUrl);

    currentUserId = data.userId;
    currentUsername = data.username;
    myInviteCode = data.inviteCode;

    showChatScreen();
  } catch (err) {
    authError.textContent = 'Network error during Google Login.';
  }
};

function showToast(message: string, type: 'success' | 'error' = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Auth Toggle
toggleAuthBtn.addEventListener('click', (e) => {
  e.preventDefault();
  isLoginMode = !isLoginMode;
  if (isLoginMode) {
    authTitle.textContent = 'Welcome Back!';
    authSubtitle.textContent = 'Log in to continue chatting';
    authToggleText.textContent = "New here?";
    toggleAuthBtn.textContent = 'Create an account';
    authSubmitBtn.textContent = "Let's Go!";
  } else {
    authTitle.textContent = 'Join the fun!';
    authSubtitle.textContent = 'Sign up to get started';
    authToggleText.textContent = 'Already have an account?';
    toggleAuthBtn.textContent = 'Log in';
    authSubmitBtn.textContent = 'Register';
  }
  authError.textContent = '';
});

// Auth Form Submit
authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value.trim();

  if (!username || !password) return;

  const endpoint = isLoginMode ? '/api/auth/login' : '/api/auth/register';

  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok) {
      authError.textContent = data.error || 'Authentication failed';
      return;
    }

    if (!isLoginMode) {
      // Auto login after register
      isLoginMode = true;
      toggleAuthBtn.click();
      authError.textContent = 'Registration successful! Please log in.';
      authError.style.color = 'var(--success)';
      return;
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('userId', data.userId.toString());
    localStorage.setItem('username', data.username);
    localStorage.setItem('inviteCode', data.inviteCode || '');

    currentUserId = data.userId;
    currentUsername = data.username;
    myInviteCode = data.inviteCode;

    showChatScreen();
  } catch (err) {
    authError.textContent = 'Network error. Make sure backend is running.';
  }
});

// Logout
logoutBtn.addEventListener('click', () => {
  localStorage.clear();
  if (socket) socket.disconnect();
  showAuthScreen();
});

// Settings Handlers
settingsMenuBtn.addEventListener('click', openSettings);
closeSettingsBtn.addEventListener('click', () => settingsOverlay.classList.add('hidden'));

async function openSettings() {
  settingsOverlay.classList.remove('hidden');
  settingsError.textContent = '';

  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/users/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to fetch profile');
    const data = await res.json();

    settingsUsername.value = data.username;
    settingsEmail.value = data.email || '';
    settingsInvite.value = data.inviteCode;
    settingsFriendCount.textContent = data.friendCount.toString();
    settingsJoinedDate.textContent = new Date(data.createdAt).toLocaleDateString();

    if (data.avatarUrl) {
      settingsAvatarPreview.src = formatUrl(data.avatarUrl);
      settingsAvatarPreview.style.display = 'block';
      settingsAvatarPlaceholder.style.display = 'none';
    } else {
      settingsAvatarPreview.style.display = 'none';
      settingsAvatarPlaceholder.style.display = 'flex';
      settingsAvatarPlaceholder.textContent = data.username.charAt(0).toUpperCase();
    }
  } catch (err) {
    settingsError.textContent = 'Failed to load profile data.';
  }
}

copySettingsInviteBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(settingsInvite.value);
  showToast('Invite code copied to clipboard!');
});

// Avatar Upload Handler
avatarUploadOverlay.addEventListener('click', () => settingsAvatarInput.click());

settingsAvatarInput.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('avatar', file);

  try {
    const token = localStorage.getItem('token');
    settingsError.textContent = 'Uploading avatar...';
    settingsError.style.color = 'var(--text-muted)';

    const res = await fetch(`${API_URL}/api/users/avatar`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('avatarUrl', data.avatarUrl);
      settingsAvatarPreview.src = formatUrl(data.avatarUrl);
      settingsAvatarPreview.style.display = 'block';
      settingsAvatarPlaceholder.style.display = 'none';
      settingsError.textContent = '';
      showToast('Avatar updated successfully!');

      const currentUserBadge = document.getElementById('current-username')!;
      currentUserBadge.textContent = currentUsername || '';
    } else {
      throw new Error(data.error);
    }
  } catch (err: any) {
    settingsError.style.color = 'var(--danger)';
    settingsError.textContent = err.message || 'Avatar upload failed';
  }
});

// Update Profile Form
settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const newUsername = settingsUsername.value.trim();
  if (!newUsername) return;

  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/users/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ username: newUsername })
    });

    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('username', data.username);
      currentUsername = data.username;

      const currentUserBadge = document.getElementById('current-username')!;
      currentUserBadge.textContent = currentUsername || '';

      showToast('Profile updated successfully!');
      settingsOverlay.classList.add('hidden');
    } else {
      settingsError.style.color = 'var(--danger)';
      settingsError.textContent = data.error || 'Failed to update profile';
    }
  } catch (err) {
    settingsError.style.color = 'var(--danger)';
    settingsError.textContent = 'Network error.';
  }
});

// Screens transition
function showAuthScreen() {
  chatScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
  usernameInput.value = '';
  passwordInput.value = '';
  authError.textContent = '';
  authError.style.color = 'var(--danger)';

  // Init Google Login Button
  setTimeout(() => {
    if ((window as any).google) {
      (window as any).google.accounts.id.initialize({
        client_id: '807355852605-dkha07kak1spvfrd1nicibqilh5p3aau.apps.googleusercontent.com',
        callback: (window as any).handleGoogleLogin
      });
      (window as any).google.accounts.id.renderButton(
        document.getElementById('google-login-btn'),
        { theme: 'outline', size: 'large', width: '100%' }
      );
    }
  }, 500);
}

async function showChatScreen() {
  authScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');
  currentUsernameSpan.textContent = currentUsername;
  activeChatUserId = null;
  chatHeader.classList.add('hidden');
  chatInputArea.classList.add('hidden');
  chatMessages.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon"><i data-lucide="message-square" style="width: 48px; height: 48px;"></i></div>
      Select a friend to start chatting
    </div>`;

  if ((window as any).lucide) (window as any).lucide.createIcons();

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  connectSocket();

  // Handle pending invite code from URL
  if (pendingInviteCode) {
    await processInviteCode(pendingInviteCode);
    pendingInviteCode = null;
  }

  fetchFriends();
}

async function processInviteCode(code: string) {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/friends/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ inviteCode: code })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Added ${data.friend.username} as a friend!`, 'success');
      fetchFriends();
    } else {
      showToast(data.error || 'Failed to add friend', 'error');
    }
  } catch (err) {
    showToast('Network error while adding friend', 'error');
  }
}

// Add Friend button
addFriendBtn.addEventListener('click', () => {
  const code = addFriendInput.value.trim();
  if (!code) return showToast('Please enter an invite code', 'error');
  processInviteCode(code);
  addFriendInput.value = '';
});

// Copy Invite Link
inviteBtn.addEventListener('click', () => {
  if (!myInviteCode) return showToast('Invite code not found', 'error');
  const link = `${window.location.origin}/?invite=${myInviteCode}`;
  navigator.clipboard.writeText(link).then(() => {
    showToast('Invite link copied to clipboard!', 'success');
  }).catch(() => {
    showToast('Failed to copy link', 'error');
  });
});

// Socket Connection
function connectSocket() {
  const token = localStorage.getItem('token');
  if (!token) return;

  socket = io(API_URL, {
    auth: { token }
  });

  socket.on('initial_online_users', (onlineUserIds: number[]) => {
    users.forEach(u => {
      u.status = onlineUserIds.includes(u.id) ? 'online' : 'offline';
    });
    renderUsers();
  });

  socket.on('user_status', ({ userId, status }) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      user.status = status;
      renderUsers();
    }
  });

  socket.on('new_message', (message) => {
    // Only process incoming messages (skip our own to avoid duplicates with optimistic UI)
    if (message.senderId !== currentUserId) {
      // If message is for the currently active chat
      if (message.senderId === activeChatUserId && message.receiverId === currentUserId) {
        appendMessage(message);
        scrollToBottom();
      }

      if (document.hidden || message.senderId !== activeChatUserId) {
        const sender = users.find(u => u.id === message.senderId);
        const senderName = sender ? sender.username : 'Someone';
        
        if ('Notification' in window && Notification.permission === 'granted') {
          const notification = new Notification(`New message from ${senderName}`, {
            body: message.type === 'image' || message.type === 'video' ? `Sent an attachment` : message.content,
            icon: sender?.avatarUrl || undefined
          });
          
          notification.onclick = () => {
            window.focus();
            if (sender) {
              selectUser(sender.id, sender.username, sender.avatarUrl);
            }
          };
        } else {
          showToast(`New message from ${senderName}`);
        }
      }
    }
  });

  // --- Calling Listeners ---
  
  socket.on('incoming_call', ({ from, fromName, type }) => {
    callTargetId = from;
    isVideoCall = type === 'video';
    
    callOverlay.classList.remove('hidden');
    callName.textContent = fromName;
    callStatus.textContent = `Incoming ${type} call...`;
    callAvatar.textContent = fromName.charAt(0).toUpperCase();
    
    acceptCallBtn.classList.remove('hidden');
    // Change hangup button style
    endCallBtn.classList.add('hangup-btn');
  });

  socket.on('call_answered', async ({ accepted }) => {
    if (accepted) {
      callStatus.textContent = 'Call connected';
      acceptCallBtn.classList.add('hidden');
      await startWebRTC(true); // true means we are the initiator
    } else {
      showToast('Call rejected', 'error');
      closeCall();
    }
  });

  socket.on('webrtc_signal', async ({ from, signal }) => {
    if (!peerConnection) await startWebRTC(false);
    
    if (signal.sdp) {
      await peerConnection!.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      if (signal.sdp.type === 'offer') {
        const answer = await peerConnection!.createAnswer();
        await peerConnection!.setLocalDescription(answer);
        socket!.emit('webrtc_signal', { to: from, signal: { sdp: answer } });
      }
    } else if (signal.candidate) {
      await peerConnection!.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }
  });

  socket.on('call_ended', () => {
    showToast('Call ended');
    closeCall(false);
  });
}

// Fetch Friends
async function fetchFriends() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/friends`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) {
      if (res.status === 401) logoutBtn.click();
      return;
    }
    const data = await res.json();
    // Merge status if exists
    users = data.map((u: any) => {
      const existing = users.find(oldU => oldU.id === u.id);
      return { ...u, status: existing ? existing.status : 'offline' };
    });
    renderUsers();
  } catch (err) {
    console.error('Failed to fetch friends', err);
  }
}

// Render Users list
function renderUsers() {
  userList.innerHTML = '';
  if (users.length === 0) {
    userList.innerHTML = '<li style="text-align:center; padding: 1rem; color: var(--text-muted); font-size: 0.9rem;">No friends yet. Add one!</li>';
    return;
  }

  users.forEach(user => {
    const li = document.createElement('li');
    li.className = `user-item ${activeChatUserId === user.id ? 'active' : ''}`;

    let avatarHtml = `<div class="avatar">${user.username.charAt(0).toUpperCase()}</div>`;
    if (user.avatarUrl) {
      avatarHtml = `<img src="${formatUrl(user.avatarUrl)}" class="avatar" style="object-fit: cover;" />`;
    }

    li.innerHTML = `
      ${avatarHtml}
      <div class="user-info">
        <div class="user-name">${user.username}</div>
      </div>
      <div class="status-dot ${user.status}"></div>
    `;
    li.addEventListener('click', () => selectUser(user.id, user.username, user.avatarUrl));
    userList.appendChild(li);
  });
}

// Select User to Chat
async function selectUser(userId: number, username: string, avatarUrl?: string) {
  activeChatUserId = userId;
  renderUsers(); // update active state

  chatHeader.classList.remove('hidden');
  chatInputArea.classList.remove('hidden');
  chatHeaderName.textContent = username;
  mainChat.classList.add('mobile-active');

  if (avatarUrl) {
    chatHeaderAvatarImg.src = formatUrl(avatarUrl);
    chatHeaderAvatarImg.classList.remove('hidden');
    chatHeaderAvatar.classList.add('hidden');
  } else {
    chatHeaderAvatarImg.classList.add('hidden');
    chatHeaderAvatar.classList.remove('hidden');
    chatHeaderAvatar.textContent = username.charAt(0).toUpperCase();
  }

  // Force refresh icons to ensure call buttons appear
  if ((window as any).lucide) (window as any).lucide.createIcons();

  chatMessages.innerHTML = ''; // clear current messages

  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/messages/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const messages = await res.json();

    if (messages.length === 0) {
      chatMessages.innerHTML = `
        <div class="empty-state" style="margin-top:auto; margin-bottom:auto">
          No messages yet. Say hi to ${username}!
        </div>`;
    } else {
      messages.forEach(appendMessage);
      scrollToBottom();
    }
  } catch (err) {
    console.error('Failed to fetch messages', err);
  }
}

// Send Message
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const content = messageInput.value.trim();
  if (!content || !activeChatUserId || !socket) return;

  // Optimistic UI Update (Instant send)
  appendMessage({
    id: `temp_${Date.now()}`,
    senderId: currentUserId,
    receiverId: activeChatUserId,
    content,
    type: 'text',
    createdAt: new Date().toISOString()
  });
  scrollToBottom();

  socket.emit('private_message', {
    receiverId: activeChatUserId,
    content
  });

  messageInput.value = '';
});

// File Upload Logic
attachBtn.addEventListener('click', () => {
  if (activeChatUserId) {
    fileInput.click();
  } else {
    showToast('Select a friend first', 'error');
  }
});

fileInput.addEventListener('change', async (e) => {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file || !activeChatUserId) return;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('receiverId', activeChatUserId.toString());

  try {
    const token = localStorage.getItem('token');
    showToast('Uploading...', 'success');

    const res = await fetch(`${API_URL}/api/messages/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (res.ok) {
      showToast('Uploaded successfully', 'success');
      const uploadedMsg = await res.json();
      appendMessage(uploadedMsg);
      scrollToBottom();
    } else {
      const data = await res.json();
      showToast(data.error || 'Failed to upload', 'error');
    }
  } catch (err) {
    showToast('Network error during upload', 'error');
  } finally {
    target.value = ''; // Reset input
  }
});

// Append Message to UI
function appendMessage(message: any) {
  const emptyState = chatMessages.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const isSent = message.senderId === currentUserId;
  const div = document.createElement('div');
  div.className = `message ${isSent ? 'sent' : 'received'}`;

  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let mediaContent = '';
  if (message.type === 'image' && message.fileUrl) {
    const fallbackSvg = `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='150' height='150'><rect width='150' height='150' fill='%23e2e8f0'/><text x='75' y='75' font-family='sans-serif' font-size='14' fill='%2364748b' text-anchor='middle' dy='5'>Image Expired</text></svg>`;
    mediaContent = `<img src="${formatUrl(message.fileUrl)}" class="message-image" alt="Attachment" onerror="this.onerror=null; this.src='${fallbackSvg}';" />`;
  } else if (message.type === 'video' && message.fileUrl) {
    mediaContent = `<video src="${formatUrl(message.fileUrl)}" class="message-video" controls style="max-width: 100%; border-radius: var(--radius-sm); margin-bottom: 5px;"></video>`;
  } else if (message.type === 'file' && message.fileUrl) {
    mediaContent = `
      <a href="${formatUrl(message.fileUrl)}" target="_blank" class="message-file">
        <i data-lucide="file-text" class="message-file-icon"></i>
        <span>${message.content || 'Download File'}</span>
      </a>`;
  }

  const textContent = message.type === 'text' || (!mediaContent && message.content)
    ? `<div class="message-content">${message.content || ''}</div>`
    : '';

  div.innerHTML = `
    ${mediaContent}
    ${textContent}
    <span class="message-time">${time}</span>
  `;

  chatMessages.appendChild(div);

  if ((window as any).lucide) (window as any).lucide.createIcons();
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Google Init
function initGoogle() {
  const win = window as any;
  if (win.google && win.google.accounts) {
    win.google.accounts.id.initialize({
      client_id: "807355852605-dkha07kak1spvfrd1nicibqilh5p3aau.apps.googleusercontent.com",
      callback: win.handleGoogleLogin
    });
    const googleBtn = document.getElementById("google-login-btn");
    if (googleBtn) {
      win.google.accounts.id.renderButton(
        googleBtn,
        { theme: "outline", size: "large", type: "standard", text: "signin_with" }
      );
    }
  } else {
    setTimeout(initGoogle, 100);
  }
}
// ==========================================
// Camera Logic
// ==========================================
let stream: MediaStream | null = null;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: BlobPart[] = [];
let isRecording = false;
let cameraMode: 'photo' | 'video' = 'photo';
let capturedFile: File | null = null;
let recordTimer: number | null = null;
let recordSeconds = 0;
let currentFacingMode: 'user' | 'environment' = 'user';

cameraBtn.addEventListener('click', async () => {
  if (!activeChatUserId) {
    showToast('Select a friend first', 'error');
    return;
  }
  await openCamera();
});

closeCameraBtn.addEventListener('click', closeCamera);

switchCameraBtn.addEventListener('click', async () => {
  currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
  await openCamera();
});

async function openCamera() {
  cameraOverlay.classList.remove('hidden');
  resetCameraState();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: currentFacingMode }, 
      audio: true 
    });
    cameraVideo.srcObject = stream;
    
    // Apply mirroring for front camera
    if (currentFacingMode === 'user') {
      cameraVideo.classList.add('mirrored');
    } else {
      cameraVideo.classList.remove('mirrored');
    }
  } catch (err) {
    showToast('Camera access denied or unavailable', 'error');
    closeCamera();
  }
}

function closeCamera() {
  cameraOverlay.classList.add('hidden');
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  if (isRecording) {
    stopRecording();
  }
}

function resetCameraState() {
  cameraVideo.classList.remove('hidden');
  cameraPreviewContainer.classList.add('hidden');
  photoPreview.classList.add('hidden');
  videoPreview.classList.add('hidden');
  document.getElementById('camera-controls')!.classList.remove('hidden');
  capturedFile = null;
  recordedChunks = [];
}

modePhotoBtn.addEventListener('click', () => {
  if (isRecording) return;
  cameraMode = 'photo';
  modePhotoBtn.classList.add('active');
  modeVideoBtn.classList.remove('active');
  captureMediaBtn.className = 'shutter-btn photo-mode';
});

modeVideoBtn.addEventListener('click', () => {
  if (isRecording) return;
  cameraMode = 'video';
  modeVideoBtn.classList.add('active');
  modePhotoBtn.classList.remove('active');
  captureMediaBtn.className = 'shutter-btn video-mode';
});

captureMediaBtn.addEventListener('click', () => {
  if (cameraMode === 'photo') {
    takePhoto();
  } else {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }
});

function takePhoto() {
  const canvas = document.createElement('canvas');
  canvas.width = cameraVideo.videoWidth;
  canvas.height = cameraVideo.videoHeight;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (blob) {
        capturedFile = new File([blob], `capture-${Date.now()}.png`, { type: 'image/png' });
        showPreview('photo', URL.createObjectURL(blob));
      }
    }, 'image/png');
  }
}

function startRecording() {
  if (!stream) return;
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = e => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    capturedFile = new File([blob], `video-${Date.now()}.webm`, { type: 'video/webm' });
    showPreview('video', URL.createObjectURL(blob));
  };
  mediaRecorder.start();
  isRecording = true;
  captureMediaBtn.classList.add('recording');
  
  // Timer
  recordSeconds = 0;
  cameraTimer.textContent = '00:00';
  cameraTimer.classList.remove('hidden');
  recordTimer = setInterval(() => {
    recordSeconds++;
    const m = String(Math.floor(recordSeconds / 60)).padStart(2, '0');
    const s = String(recordSeconds % 60).padStart(2, '0');
    cameraTimer.textContent = `${m}:${s}`;
  }, 1000);
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
  }
  isRecording = false;
  captureMediaBtn.classList.remove('recording');
  if (recordTimer) clearInterval(recordTimer);
  cameraTimer.classList.add('hidden');
}

function showPreview(type: 'photo' | 'video', url: string) {
  cameraVideo.classList.add('hidden');
  document.getElementById('camera-controls')!.classList.add('hidden');
  cameraPreviewContainer.classList.remove('hidden');
  
  if (type === 'photo') {
    photoPreview.src = url;
    photoPreview.classList.remove('hidden');
    videoPreview.classList.add('hidden');
  } else {
    videoPreview.src = url;
    videoPreview.classList.remove('hidden');
    photoPreview.classList.add('hidden');
  }
}

retakeMediaBtn.addEventListener('click', () => {
  resetCameraState();
});

sendMediaBtn.addEventListener('click', async () => {
  if (!capturedFile || !activeChatUserId) return;
  
  const formData = new FormData();
  formData.append('file', capturedFile);
  formData.append('receiverId', activeChatUserId.toString());

  try {
    const token = localStorage.getItem('token');
    showToast('Sending media...', 'success');
    sendMediaBtn.disabled = true;

    const res = await fetch(`${API_URL}/api/messages/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (res.ok) {
      showToast('Media sent successfully', 'success');
      const uploadedMsg = await res.json();
      appendMessage(uploadedMsg);
      scrollToBottom();
      closeCamera();
    } else {
      showToast('Failed to send media', 'error');
    }
  } catch (err) {
    showToast('Network error during upload', 'error');
  } finally {
    sendMediaBtn.disabled = false;
  }
});

// --- Calling Logic ---

voiceCallBtn.addEventListener('click', () => startCall('voice'));
videoCallBtn.addEventListener('click', () => startCall('video'));

async function startCall(type: 'voice' | 'video') {
  if (!activeChatUserId || !socket) return;
  
  callTargetId = activeChatUserId;
  isVideoCall = type === 'video';
  
  callOverlay.classList.remove('hidden');
  callName.textContent = chatHeaderName.textContent;
  callStatus.textContent = 'Calling...';
  acceptCallBtn.classList.add('hidden');
  
  socket.emit('call_user', {
    to: callTargetId,
    fromName: currentUsername,
    type
  });
}

acceptCallBtn.addEventListener('click', () => {
  if (!callTargetId || !socket) return;
  socket.emit('call_response', { to: callTargetId, accepted: true });
  callStatus.textContent = 'Connecting...';
  acceptCallBtn.classList.add('hidden');
});

endCallBtn.addEventListener('click', () => {
  if (callTargetId && socket) {
    socket.emit('end_call', { to: callTargetId });
  }
  closeCall();
});

async function startWebRTC(isInitiator: boolean) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: isVideoCall
    });
    
    if (isVideoCall) {
      localVideo.srcObject = localStream;
      localVideo.classList.remove('hidden');
    }

    peerConnection = new RTCPeerConnection(configuration);
    
    localStream.getTracks().forEach(track => {
      peerConnection!.addTrack(track, localStream!);
    });

    peerConnection.ontrack = (event) => {
      remoteVideo.srcObject = event.streams[0];
      remoteVideo.classList.remove('hidden');
      if (isVideoCall) {
        callAvatar.classList.add('hidden');
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && callTargetId) {
        socket!.emit('webrtc_signal', { to: callTargetId, signal: { candidate: event.candidate } });
      }
    };

    if (isInitiator) {
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket!.emit('webrtc_signal', { to: callTargetId, signal: { sdp: offer } });
    }
  } catch (err) {
    console.error('WebRTC error:', err);
    showToast('Could not access camera/mic', 'error');
    closeCall();
  }
}

function closeCall(notify = true) {
  if (notify && callTargetId && socket) {
    socket.emit('end_call', { to: callTargetId });
  }
  
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
  
  callOverlay.classList.add('hidden');
  localVideo.classList.add('hidden');
  remoteVideo.classList.add('hidden');
  callAvatar.classList.remove('hidden');
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  callTargetId = null;
}

toggleMicBtn.addEventListener('click', () => {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    toggleMicBtn.classList.toggle('muted', !audioTrack.enabled);
  }
});

toggleVideoBtn.addEventListener('click', () => {
  if (localStream && isVideoCall) {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    toggleVideoBtn.classList.toggle('muted', !videoTrack.enabled);
  }
});

// Startup
init();
initGoogle();
