import './style.css';
import { io, Socket } from 'socket.io-client';

const API_URL = (import.meta as any).env?.VITE_API_URL || 
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? 'http://localhost:3000' 
    : window.location.origin);
let socket: Socket | null = null;
let currentUserId: number | null = null;
let currentUsername: string | null = null;
let activeChatUserId: number | null = null;
let myZaloId: string | null = null;
let myAvatarUrl: string | null = null;
interface UserItem {
  id: number;
  zaloId?: string;
  username: string;
  status: 'online' | 'offline';
  avatarUrl?: string;
  isOnline?: boolean;
  lastSeen?: string;
}
let users: UserItem[] = [];

// Navigation state
type ActiveTab = 'messages' | 'feed' | 'contacts' | 'notifications';
let currentActiveTab: ActiveTab = 'messages';

interface FriendRequestItem {
  id: number;
  createdAt: string;
  sender: { id: number; username: string; avatarUrl?: string; email?: string };
}
let friendRequests: FriendRequestItem[] = [];

// Newsfeed posts state
interface PostComment {
  id: number;
  content: string;
  createdAt: string;
  author: { id: number; username: string; zaloId?: string; avatarUrl?: string };
  parentId?: number | null;
  parent?: { id: number; author: { username: string } } | null;
}

interface SystemNotification {
  id: number;
  type: 'like' | 'comment' | 'reply';
  content: string;
  isRead: boolean;
  postId?: number;
  createdAt: string;
  sender: { id: number; username: string; zaloId?: string; avatarUrl?: string };
}
let systemNotifications: SystemNotification[] = [];

interface PostItem {
  id: number;
  content?: string;
  imageUrl?: string;
  createdAt: string;
  author: { id: number; username: string; avatarUrl?: string };
  likeCount: number;
  isLikedByMe: boolean;
  comments: PostComment[];
}

let posts: PostItem[] = [];

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

// Rail DOM
const myAvatarDisplay = document.getElementById('my-avatar-display')!;
const myAvatarImg = document.getElementById('my-avatar-img') as HTMLImageElement;
const tabMessagesBtn = document.getElementById('tab-messages')!;
const tabFeedBtn = document.getElementById('tab-feed')!;
const tabContactsBtn = document.getElementById('tab-contacts')!;
const tabNotificationsBtn = document.getElementById('tab-notifications')!;
const notifBadgeCount = document.getElementById('notif-badge-count')!;
const logoutBtn = document.getElementById('logout-btn')!;
const profileBtn = document.getElementById('profile-btn');
const railUserAvatar = document.getElementById('rail-user-avatar');

// Profile Modal DOM
const profileModal = document.getElementById('profile-modal')!;
const closeProfileModalBtn = document.getElementById('close-profile-modal')!;
const cancelProfileBtn = document.getElementById('cancel-profile-btn')!;
const profileForm = document.getElementById('profile-form') as HTMLFormElement;
const profileFullnameInput = document.getElementById('profile-fullname-input') as HTMLInputElement;
const profileZaloIdDisplay = document.getElementById('profile-zalo-id-display') as HTMLInputElement;
const profileDobInput = document.getElementById('profile-dob-input') as HTMLInputElement;
const profileEmailDisplay = document.getElementById('profile-email-display') as HTMLInputElement;
const profileDisplayUsername = document.getElementById('profile-display-username')!;
const profileAvatarText = document.getElementById('profile-avatar-text')!;
const profileAvatarImg = document.getElementById('profile-avatar-img') as HTMLImageElement;
const profileAvatarInput = document.getElementById('profile-avatar-input') as HTMLInputElement;
const copyZaloIdBtn = document.getElementById('copy-zalo-id-btn')!;

// Sub-sidebar DOM
const subHeaderChat = document.getElementById('sub-header-chat')!;
const subHeaderFriends = document.getElementById('sub-header-friends')!;
const subHeaderFeed = document.getElementById('sub-header-feed')!;
const subHeaderNotifications = document.getElementById('sub-header-notifications')!;
const friendsCountBadge = document.getElementById('friends-count-badge')!;
const friendsSearchInput = document.getElementById('friends-search-input') as HTMLInputElement | null;
const userList = document.getElementById('user-list')!;
const addFriendInput = document.getElementById('add-friend-input') as HTMLInputElement;
const addFriendBtn = document.getElementById('add-friend-btn')!;
const toastContainer = document.getElementById('toast-container')!;

// Workspace DOM
const chatViewContainer = document.getElementById('chat-view-container')!;
const newsfeedViewContainer = document.getElementById('newsfeed-view-container')!;
const notificationsViewContainer = document.getElementById('notifications-view-container')!;
const friendRequestsList = document.getElementById('friend-requests-list')!;
const systemNotificationsList = document.getElementById('system-notifications-list')!;

// Chat DOM
const chatHeader = document.getElementById('chat-header')!;
const chatBackBtn = document.getElementById('chat-back-btn');
const chatHeaderName = document.getElementById('chat-header-name')!;
const chatHeaderStatus = document.getElementById('chat-header-status')!;
const chatHeaderAvatar = document.getElementById('chat-header-avatar')!;
const chatHeaderAvatarImg = document.getElementById('chat-header-avatar-img') as HTMLImageElement;
const chatMessages = document.getElementById('chat-messages')!;
const chatInputArea = document.getElementById('chat-input-area')!;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const messageInput = document.getElementById('message-input') as HTMLInputElement;
const attachBtn = document.getElementById('attach-btn') as HTMLButtonElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;

// Post Composer DOM
const composerAvatar = document.getElementById('composer-avatar')!;
const composerAvatarImg = document.getElementById('composer-avatar-img') as HTMLImageElement;
const composerUsername = document.getElementById('composer-username')!;
const createPostForm = document.getElementById('create-post-form') as HTMLFormElement;
const postContentInput = document.getElementById('post-content-input') as HTMLTextAreaElement;
const postImageInput = document.getElementById('post-image-input') as HTMLInputElement;
const postImagePreviewContainer = document.getElementById('post-image-preview-container')!;
const postImagePreview = document.getElementById('post-image-preview') as HTMLImageElement;
const removePreviewBtn = document.getElementById('remove-preview-btn')!;
const feedListContainer = document.getElementById('feed-list-container')!;

let isLoginMode = true;
let pendingInviteCode: string | null = null;
let selectedPostFile: File | null = null;

// Initialize App
function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const inviteCode = urlParams.get('invite');
  if (inviteCode) {
    pendingInviteCode = inviteCode;
    window.history.replaceState({}, document.title, window.location.pathname);
    showToast(`Bạn có mã giới thiệu! Vui lòng đăng nhập hoặc đăng ký để kết bạn.`, 'success');
  }

  const token = localStorage.getItem('token');
  const storedUserId = localStorage.getItem('userId');
  const storedUsername = localStorage.getItem('username');
  const storedAvatarUrl = localStorage.getItem('avatarUrl');
  const storedZaloId = localStorage.getItem('zaloId');

  if (token && storedUserId && storedUsername) {
    currentUserId = parseInt(storedUserId);
    currentUsername = storedUsername;
    myAvatarUrl = storedAvatarUrl;
    myZaloId = storedZaloId;
    showMainScreen();
  } else {
    showAuthScreen();
  }

  refreshIcons();
}

function refreshIcons() {
  if ((window as any).lucide) {
    (window as any).lucide.createIcons();
  }
}

// Toast helper
function showToast(message: string, type: 'success' | 'error' = 'success', onClick?: () => void) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = message;
  if (onClick) {
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', () => {
      onClick();
      toast.remove();
    });
  }
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
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
      authError.textContent = data.error || 'Đăng nhập Google thất bại';
      return;
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('userId', data.userId.toString());
    localStorage.setItem('username', data.username);
    localStorage.setItem('inviteCode', data.inviteCode || '');
    if (data.zaloId) localStorage.setItem('zaloId', data.zaloId);
    if (data.avatarUrl) localStorage.setItem('avatarUrl', data.avatarUrl);

    currentUserId = data.userId;
    currentUsername = data.username;
    myAvatarUrl = data.avatarUrl;
    myZaloId = data.zaloId;

    showMainScreen();
  } catch (err) {
    authError.textContent = 'Lỗi kết nối khi đăng nhập Google.';
  }
};

// Auth Toggle
toggleAuthBtn.addEventListener('click', (e) => {
  e.preventDefault();
  isLoginMode = !isLoginMode;
  if (isLoginMode) {
    authTitle.textContent = 'Đăng Nhập NexTalk';
    authSubtitle.textContent = 'Kết nối và chia sẻ khoảnh khắc cùng bạn bè';
    authToggleText.textContent = "Chưa có tài khoản?";
    toggleAuthBtn.textContent = 'Đăng ký ngay';
    authSubmitBtn.textContent = "Đăng Nhập";
  } else {
    authTitle.textContent = 'Tạo Tài Khoản Mới';
    authSubtitle.textContent = 'Tham gia cùng cộng đồng NexTalk';
    authToggleText.textContent = 'Đã có tài khoản?';
    toggleAuthBtn.textContent = 'Đăng nhập';
    authSubmitBtn.textContent = 'Tạo Tài Khoản';
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
      authError.textContent = data.error || 'Xác thực thất bại';
      return;
    }

    if (!isLoginMode) {
      isLoginMode = true;
      toggleAuthBtn.click();
      authError.textContent = 'Đăng ký thành công! Vui lòng đăng nhập.';
      authError.style.color = 'var(--success)';
      return;
    }

    localStorage.setItem('token', data.token);
    localStorage.setItem('userId', data.userId.toString());
    localStorage.setItem('username', data.username);
    localStorage.setItem('inviteCode', data.inviteCode || '');
    if (data.zaloId) localStorage.setItem('zaloId', data.zaloId);

    currentUserId = data.userId;
    currentUsername = data.username;
    myZaloId = data.zaloId;

    showMainScreen();
  } catch (err) {
    authError.textContent = 'Lỗi mạng. Hãy đảm bảo server backend đang chạy.';
  }
});

// Logout
logoutBtn.addEventListener('click', () => {
  localStorage.clear();
  if (socket) socket.disconnect();
  showAuthScreen();
});

function showAuthScreen() {
  chatScreen.classList.add('hidden');
  authScreen.classList.remove('hidden');
  usernameInput.value = '';
  passwordInput.value = '';
  authError.textContent = '';
  authError.style.color = 'var(--danger)';

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

async function showMainScreen() {
  authScreen.classList.add('hidden');
  chatScreen.classList.remove('hidden');

  // Update user avatar in rail & post composer
  if (currentUsername) {
    myAvatarDisplay.textContent = currentUsername.charAt(0).toUpperCase();
    composerAvatar.textContent = currentUsername.charAt(0).toUpperCase();
    composerUsername.textContent = currentUsername;
  }
  const myUserIdBadge = document.getElementById('my-user-id-badge');
  if (myUserIdBadge) {
    if (myZaloId) {
      myUserIdBadge.textContent = `ID ${myZaloId}`;
    } else {
      myUserIdBadge.textContent = `ID ...`;
    }
  }
  if (myAvatarUrl) {
    const fullAvatar = getAvatarUrl(myAvatarUrl);
    myAvatarImg.src = fullAvatar;
    myAvatarImg.classList.remove('hidden');
    myAvatarDisplay.classList.add('hidden');

    if (composerAvatarImg) {
      composerAvatarImg.src = fullAvatar;
      composerAvatarImg.classList.remove('hidden');
      if (composerAvatar) composerAvatar.classList.add('hidden');
    }
  }

  activeChatUserId = null;
  chatHeader.classList.add('hidden');
  chatInputArea.classList.add('hidden');
  chatMessages.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon"><i data-lucide="messages-square"></i></div>
      <h3>Chào mừng bạn đến với NexTalk!</h3>
      <p>Hãy chọn một người bạn từ danh sách bên trái để bắt đầu nhắn tin.</p>
    </div>`;

  connectSocket();

  if (pendingInviteCode) {
    await processInviteCode(pendingInviteCode);
    pendingInviteCode = null;
  }

  fetchMyProfile();
  fetchFriends();
  fetchFriendRequests();
  fetchNotifications();
  switchTab('messages');
  refreshIcons();
}

// Navigation Tabs Handling
tabMessagesBtn.addEventListener('click', () => switchTab('messages'));
tabFeedBtn.addEventListener('click', () => switchTab('feed'));
tabContactsBtn.addEventListener('click', () => switchTab('contacts'));
tabNotificationsBtn.addEventListener('click', () => switchTab('notifications'));

if (chatBackBtn) {
  chatBackBtn.addEventListener('click', () => {
    chatScreen.classList.remove('mobile-chat-active');
  });
}

const markAllReadBtn = document.getElementById('mark-all-read-btn');
if (markAllReadBtn) {
  markAllReadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    markAllNotificationsAsRead();
  });
}

if (friendsSearchInput) {
  friendsSearchInput.addEventListener('input', (e) => {
    const val = (e.target as HTMLInputElement).value;
    renderUsers(val);
  });
}

function switchTab(tab: ActiveTab) {
  currentActiveTab = tab;
  chatScreen.classList.remove('mobile-chat-active');

  tabMessagesBtn.classList.toggle('active', tab === 'messages');
  tabFeedBtn.classList.toggle('active', tab === 'feed');
  tabContactsBtn.classList.toggle('active', tab === 'contacts');
  tabNotificationsBtn.classList.toggle('active', tab === 'notifications');

  if (tab === 'messages') {
    subHeaderChat.classList.remove('hidden');
    if (subHeaderFriends) subHeaderFriends.classList.add('hidden');
    subHeaderFeed.classList.add('hidden');
    subHeaderNotifications.classList.add('hidden');
    chatViewContainer.classList.remove('hidden');
    newsfeedViewContainer.classList.add('hidden');
    notificationsViewContainer.classList.add('hidden');
    fetchFriends();
  } else if (tab === 'feed') {
    subHeaderChat.classList.add('hidden');
    if (subHeaderFriends) subHeaderFriends.classList.add('hidden');
    subHeaderFeed.classList.remove('hidden');
    subHeaderNotifications.classList.add('hidden');
    chatViewContainer.classList.add('hidden');
    newsfeedViewContainer.classList.remove('hidden');
    notificationsViewContainer.classList.add('hidden');
    fetchPosts();
  } else if (tab === 'contacts') {
    subHeaderChat.classList.add('hidden');
    if (subHeaderFriends) subHeaderFriends.classList.remove('hidden');
    subHeaderFeed.classList.add('hidden');
    subHeaderNotifications.classList.add('hidden');
    chatViewContainer.classList.remove('hidden');
    newsfeedViewContainer.classList.add('hidden');
    notificationsViewContainer.classList.add('hidden');
    fetchFriends();
  } else if (tab === 'notifications') {
    subHeaderChat.classList.add('hidden');
    if (subHeaderFriends) subHeaderFriends.classList.add('hidden');
    subHeaderFeed.classList.add('hidden');
    subHeaderNotifications.classList.remove('hidden');
    chatViewContainer.classList.add('hidden');
    newsfeedViewContainer.classList.add('hidden');
    notificationsViewContainer.classList.remove('hidden');
    fetchFriendRequests();
    fetchNotifications();
  }

  refreshIcons();
}

// Process invite code
async function processInviteCode(code: string) {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/friends/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ query: code })
    });
    const data = await res.json();
    if (res.ok) {
      showToast(`Đã thêm ${data.friend.username} (ID #${data.friend.id}) làm bạn bè!`, 'success');
      fetchFriends();
    } else {
      showToast(data.error || 'Không tìm thấy người dùng phù hợp', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối khi thêm bạn', 'error');
  }
}

addFriendBtn.addEventListener('click', () => {
  const code = addFriendInput.value.trim();
  if (!code) return showToast('Vui lòng nhập ID, Username, Email hoặc Mã mời', 'error');
  processInviteCode(code);
  addFriendInput.value = '';
});

if (profileBtn) profileBtn.addEventListener('click', openProfileModal);
if (railUserAvatar) railUserAvatar.addEventListener('click', openProfileModal);
if (closeProfileModalBtn) closeProfileModalBtn.addEventListener('click', closeProfileModal);
if (cancelProfileBtn) cancelProfileBtn.addEventListener('click', closeProfileModal);

if (profileModal) {
  profileModal.addEventListener('click', (e) => {
    if (e.target === profileModal) closeProfileModal();
  });
}

if (profileForm) {
  profileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const fullName = profileFullnameInput.value.trim();
      const dob = profileDobInput.value.trim();

      const res = await fetch(`${API_URL}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ fullName, dob })
      });

      if (!res.ok) {
        showToast('Lỗi cập nhật thông tin cá nhân', 'error');
        return;
      }

      showToast('Cập nhật thông tin cá nhân thành công!', 'success');
      closeProfileModal();
      await fetchMyProfile();
    } catch (err) {
      showToast('Lỗi kết nối khi cập nhật hồ sơ', 'error');
    }
  });
}

if (profileAvatarInput) {
  profileAvatarInput.addEventListener('change', async () => {
    const file = profileAvatarInput.files?.[0];
    if (!file) return;

    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await fetch(`${API_URL}/api/profile/avatar`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });

      if (!res.ok) {
        showToast('Lỗi tải ảnh đại diện lên', 'error');
        return;
      }

      showToast('Cập nhật ảnh đại diện thành công!', 'success');
      await fetchMyProfile();
      populateProfileModalData();
    } catch (err) {
      showToast('Lỗi kết nối khi tải ảnh đại diện', 'error');
    }
  });
}

if (copyZaloIdBtn) {
  copyZaloIdBtn.addEventListener('click', () => {
    const idVal = myZaloId;
    if (idVal) {
      navigator.clipboard.writeText(idVal);
      showToast(`Đã sao chép NexTalk ID: ${idVal}`, 'success');
    }
  });
}

// Socket Connection
function connectSocket() {
  const token = localStorage.getItem('token');
  if (!token) return;

  socket = io(API_URL, {
    auth: { token }
  });

  socket.on('initial_online_users', (onlineUserIds: number[]) => {
    users.forEach(u => {
      u.isOnline = onlineUserIds.includes(u.id);
      u.status = u.isOnline ? 'online' : 'offline';
    });
    renderUsers();
  });

  socket.on('user_status', (data: { userId: number; status?: string; isOnline?: boolean; lastSeen?: string }) => {
    const user = users.find(u => u.id === data.userId);
    if (user) {
      const isOnline = data.isOnline !== undefined ? data.isOnline : (data.status === 'online');
      user.isOnline = isOnline;
      user.status = isOnline ? 'online' : 'offline';
      if (data.lastSeen) user.lastSeen = data.lastSeen;
      renderUsers();
      if (activeChatUserId === data.userId) {
        chatHeaderStatus.textContent = formatUserLastSeen(user.isOnline, user.lastSeen);
      }
    }
  });

  socket.on('new_message', (message) => {
    if (
      (message.senderId === activeChatUserId && message.receiverId === currentUserId) ||
      (message.senderId === currentUserId && message.receiverId === activeChatUserId)
    ) {
      appendMessage(message);
      scrollToBottom();
    } else if (currentActiveTab !== 'messages' && message.senderId !== currentUserId) {
      showToast('Bạn vừa nhận được 1 tin nhắn mới!', 'success');
    }
  });

  socket.on('friend_request', (requestData: any) => {
    showToast(`🔔 ${requestData.sender.username} (ID #${requestData.sender.id}) vừa gửi cho bạn một lời mời kết bạn!`, 'success');
    fetchFriendRequests();
  });

  socket.on('friend_request_accepted', (data: any) => {
    showToast(`🎉 ${data.friend.username} (ID #${data.friend.id}) đã chấp nhận lời mời kết bạn!`, 'success');
    fetchFriends();
  });

  socket.on('post_interaction', (notif: any) => {
    showToast(`🔔 ${notif.content} (Nhấn để xem)`, 'success', () => {
      if (notif.postId) {
        navigateToPost(notif.postId);
        if (notif.id) markNotificationAsRead(notif.id);
      }
    });
    fetchNotifications();
    fetchPosts();
  });
}

// Format lastSeen text: online, minutes (<60), hours (60-119 = 1h, 120-179 = 2h), or days
function formatUserLastSeen(isOnline?: boolean, lastSeen?: string): string {
  if (isOnline) {
    return 'Đang hoạt động';
  }
  if (!lastSeen) {
    return 'Ngoại tuyến';
  }
  const date = new Date(lastSeen);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  if (isNaN(diffMs) || diffMs < 0) {
    return 'Truy cập vừa xong';
  }

  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);

  if (diffMin < 1) {
    return 'Truy cập vừa xong';
  }
  if (diffMin < 60) {
    return `Truy cập ${diffMin} phút trước`;
  }

  const diffHours = Math.floor(diffMin / 60);

  if (diffHours < 24) {
    return `Truy cập ${diffHours} giờ trước`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) {
    return `Truy cập ${diffDays} ngày trước`;
  }

  return `Truy cập ${date.toLocaleDateString('vi-VN')}`;
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
    users = data.map((u: any) => ({
      ...u,
      isOnline: u.isOnline ?? false,
      status: u.isOnline ? 'online' : 'offline'
    }));
    if (friendsCountBadge) {
      friendsCountBadge.textContent = users.length.toString();
    }
    renderUsers();
  } catch (err) {
    console.error('Lỗi lấy danh sách bạn bè', err);
  }
}

function renderUsers(filterQuery = '') {
  userList.innerHTML = '';
  
  const query = filterQuery.trim().toLowerCase();
  const filteredUsers = users.filter(u => 
    u.username.toLowerCase().includes(query) ||
    (u.zaloId && u.zaloId.includes(query))
  );

  if (filteredUsers.length === 0) {
    userList.innerHTML = `<li style="text-align:center; padding: 1.5rem; color: var(--text-muted); font-size: 0.85rem;">
      ${query ? 'Không tìm thấy bạn bè nào phù hợp.' : 'Chưa có bạn bè. Hãy nhập NexTalk ID 6 số để kết bạn!'}
    </li>`;
    return;
  }

  filteredUsers.forEach(user => {
    const li = document.createElement('li');
    li.className = `user-item ${activeChatUserId === user.id ? 'active' : ''}`;

    let avatarHtml = `<div class="avatar">${user.username.charAt(0).toUpperCase()}</div>`;
    if (user.avatarUrl) {
      avatarHtml = `<img src="${getAvatarUrl(user.avatarUrl)}" class="avatar" style="object-fit: cover;" />`;
    }

    const displayId = user.zaloId || user.id;
    const statusText = formatUserLastSeen(user.isOnline, user.lastSeen);
    const statusClass = user.isOnline ? 'online' : '';

    li.innerHTML = `
      ${avatarHtml}
      <div class="user-info">
        <div class="user-name">${escapeHtml(user.username)} <span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal; margin-left:2px;">(ID: ${displayId})</span></div>
        <div class="user-status-subtext ${statusClass}">${statusText}</div>
      </div>
      <div class="user-status-dot ${user.isOnline ? 'online' : 'offline'}"></div>
    `;
    li.addEventListener('click', () => selectUser(user.id, user.username, user.isOnline ? 'online' : 'offline', user.avatarUrl, user.lastSeen));
    userList.appendChild(li);
  });
}

async function selectUser(userId: number, username: string, status: 'online' | 'offline', avatarUrl?: string, lastSeen?: string) {
  activeChatUserId = userId;
  chatScreen.classList.add('mobile-chat-active');
  renderUsers();

  chatHeader.classList.remove('hidden');
  chatInputArea.classList.remove('hidden');
  chatHeaderName.textContent = username;

  const targetUser = users.find(u => u.id === userId);
  const isOnline = targetUser ? targetUser.isOnline : (status === 'online');
  const userLastSeen = targetUser ? targetUser.lastSeen : lastSeen;

  chatHeaderStatus.textContent = formatUserLastSeen(isOnline, userLastSeen);

  if (avatarUrl) {
    chatHeaderAvatarImg.src = getAvatarUrl(avatarUrl);
    chatHeaderAvatarImg.classList.remove('hidden');
    chatHeaderAvatar.classList.add('hidden');
  } else {
    chatHeaderAvatarImg.classList.add('hidden');
    chatHeaderAvatar.classList.remove('hidden');
    chatHeaderAvatar.textContent = username.charAt(0).toUpperCase();
  }

  chatMessages.innerHTML = '';

  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/messages/${userId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const messages = await res.json();

    if (messages.length === 0) {
      chatMessages.innerHTML = `
        <div class="empty-state" style="margin-top:auto; margin-bottom:auto">
          Chưa có tin nhắn. Gửi lời chào tới ${username} nhé!
        </div>`;
    } else {
      messages.forEach(appendMessage);
      scrollToBottom();
    }
  } catch (err) {
    console.error('Lỗi lấy tin nhắn', err);
  }
}

// Send Chat Message
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const content = messageInput.value.trim();
  if (!content || !activeChatUserId || !socket) return;

  socket.emit('private_message', {
    receiverId: activeChatUserId,
    content
  });

  messageInput.value = '';
});

attachBtn.addEventListener('click', () => {
  if (activeChatUserId) {
    fileInput.click();
  } else {
    showToast('Hãy chọn bạn bè trước khi đính kèm tệp', 'error');
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
    showToast('Đang tải lên...', 'success');

    const res = await fetch(`${API_URL}/api/messages/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    if (res.ok) {
      showToast('Đã tải tệp lên thành công', 'success');
    } else {
      const data = await res.json();
      showToast(data.error || 'Tải tệp thất bại', 'error');
    }
  } catch (err) {
    showToast('Lỗi mạng khi tải tệp', 'error');
  } finally {
    target.value = '';
  }
});

function appendMessage(message: any) {
  const emptyState = chatMessages.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const isSent = message.senderId === currentUserId;
  const div = document.createElement('div');
  div.className = `message ${isSent ? 'sent' : 'received'}`;

  const time = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let mediaContent = '';
  if (message.type === 'image' && message.fileUrl) {
    mediaContent = `<img src="${getAvatarUrl(message.fileUrl)}" class="message-image" alt="Attachment" />`;
  } else if (message.type === 'file' && message.fileUrl) {
    mediaContent = `
      <a href="${getAvatarUrl(message.fileUrl)}" target="_blank" class="message-file">
        <i data-lucide="file-text"></i>
        <span>${message.content || 'Tải tệp về'}</span>
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
  refreshIcons();
}

function scrollToBottom() {
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ---------------- NEWSFEED LOGIC ----------------

// Image attachment preview handling
postImageInput.addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    selectedPostFile = file;
    const reader = new FileReader();
    reader.onload = (event) => {
      postImagePreview.src = event.target?.result as string;
      postImagePreviewContainer.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
  }
});

removePreviewBtn.addEventListener('click', () => {
  selectedPostFile = null;
  postImageInput.value = '';
  postImagePreview.src = '';
  postImagePreviewContainer.classList.add('hidden');
});

// Create Post Submit
createPostForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const content = postContentInput.value.trim();

  if (!content && !selectedPostFile) {
    showToast('Hãy nhập nội dung hoặc đính kèm ảnh cho bài viết', 'error');
    return;
  }

  const formData = new FormData();
  if (content) formData.append('content', content);
  if (selectedPostFile) formData.append('image', selectedPostFile);

  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/posts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Đã đăng nhật ký mới thành công!', 'success');
      postContentInput.value = '';
      removePreviewBtn.click();
      fetchPosts();
    } else {
      showToast(data.error || 'Đăng bài viết thất bại', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối khi đăng bài viết', 'error');
  }
});

// Fetch Posts
async function fetchPosts() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/posts`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) return;

    posts = await res.json();
    renderPosts();
  } catch (err) {
    console.error('Lỗi tải nhật ký', err);
  }
}

// Render Newsfeed Posts
function renderPosts() {
  feedListContainer.innerHTML = '';

  if (posts.length === 0) {
    feedListContainer.innerHTML = `
      <div class="post-card" style="text-align: center; color: var(--text-muted); padding: 2rem;">
        Chưa có bài đăng nào trên nhật ký. Hãy là người đầu tiên đăng khoảnh khắc mới!
      </div>`;
    return;
  }

  posts.forEach(post => {
    const card = document.createElement('div');
    card.className = 'post-card';
    card.id = `post-${post.id}`;

    const isMyPost = post.author.id === currentUserId;
    const timeFormatted = formatPostTime(post.createdAt);

    let authorAvatarHtml = `<div class="avatar">${post.author.username.charAt(0).toUpperCase()}</div>`;
    if (post.author.avatarUrl) {
      authorAvatarHtml = `<img src="${getAvatarUrl(post.author.avatarUrl)}" class="avatar" style="object-fit: cover;" />`;
    }

    const deleteBtnHtml = isMyPost
      ? `<button class="btn-delete-post" title="Xóa bài viết" data-post-id="${post.id}">
           <i data-lucide="trash-2"></i>
         </button>`
      : '';

    const textHtml = post.content ? `<div class="post-text-content">${escapeHtml(post.content)}</div>` : '';
    const imageHtml = post.imageUrl
      ? `<div class="post-image-content">
           <img src="${API_URL}${post.imageUrl}" alt="Post Media" />
         </div>`
      : '';

    // Render Comments List
    let commentsListHtml = '';
    if (post.comments && post.comments.length > 0) {
      commentsListHtml = post.comments.map(c => {
        let cAvatar = `<div class="avatar" style="width: 26px; height: 26px; font-size: 0.72rem;">${c.author.username.charAt(0).toUpperCase()}</div>`;
        if (c.author.avatarUrl) {
          cAvatar = `<img src="${getAvatarUrl(c.author.avatarUrl)}" class="avatar" style="width: 26px; height: 26px; object-fit: cover;" />`;
        }

        const isReplyClass = c.parentId ? 'comment-reply-item' : '';
        const parentTag = c.parent ? `<span style="color:var(--zalo-blue); font-weight:700;">@${c.parent.author.username} </span>` : '';

        return `
          <div class="comment-item ${isReplyClass}">
            ${cAvatar}
            <div class="comment-body">
              <div class="comment-author">${c.author.username}</div>
              <div class="comment-text">${parentTag}${escapeHtml(c.content)}</div>
              <button class="comment-reply-btn" data-reply-comment-id="${c.id}" data-reply-author="${c.author.username}">Trả lời</button>
            </div>
          </div>`;
      }).join('');
    }

    card.innerHTML = `
      <div class="post-card-header">
        <div class="post-author-info">
          ${authorAvatarHtml}
          <div>
            <div class="post-author-name">${post.author.username}</div>
            <div class="post-time">${timeFormatted}</div>
          </div>
        </div>
        ${deleteBtnHtml}
      </div>

      ${textHtml}
      ${imageHtml}

      <div class="post-stats-bar">
        <button class="post-action-btn ${post.isLikedByMe ? 'liked' : ''}" data-like-post-id="${post.id}">
          <i data-lucide="heart"></i>
          <span>${post.likeCount > 0 ? post.likeCount : ''} Yêu thích</span>
        </button>
        <button class="post-action-btn" data-comment-toggle-id="${post.id}">
          <i data-lucide="message-circle"></i>
          <span>${post.comments.length > 0 ? post.comments.length : ''} Bình luận</span>
        </button>
      </div>

      <div class="post-comments-section">
        <div class="comments-list">${commentsListHtml}</div>
        <form class="comment-input-form" data-comment-form-id="${post.id}">
          <input type="text" placeholder="Viết bình luận..." required />
          <button type="submit" class="comment-submit-btn" title="Gửi bình luận">
            <i data-lucide="send" style="width: 14px; height: 14px;"></i>
          </button>
        </form>
      </div>
    `;

    // Event Listeners for Post Actions
    const deleteBtn = card.querySelector('.btn-delete-post');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => deletePost(post.id));
    }

    const likeBtn = card.querySelector(`[data-like-post-id="${post.id}"]`);
    if (likeBtn) {
      likeBtn.addEventListener('click', () => toggleLikePost(post.id));
    }

    const commentForm = card.querySelector(`[data-comment-form-id="${post.id}"]`) as HTMLFormElement;
    if (commentForm) {
      // Reply button click handlers
      card.querySelectorAll('.comment-reply-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const target = e.currentTarget as HTMLButtonElement;
          const commentId = target.getAttribute('data-reply-comment-id');
          const authorName = target.getAttribute('data-reply-author');
          const input = commentForm.querySelector('input') as HTMLInputElement;

          if (commentId && authorName && input) {
            commentForm.dataset.parentId = commentId;
            input.value = `@${authorName} `;
            input.focus();
          }
        });
      });

      commentForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = commentForm.querySelector('input') as HTMLInputElement;
        const val = input.value.trim();
        const parentId = commentForm.dataset.parentId ? parseInt(commentForm.dataset.parentId) : undefined;

        if (val) {
          addCommentToPost(post.id, val, parentId);
          input.value = '';
          delete commentForm.dataset.parentId;
        }
      });
    }

    feedListContainer.appendChild(card);
  });

  refreshIcons();
}

// Delete Post Action
async function deletePost(postId: number) {
  if (!confirm('Bạn có chắc chắn muốn xóa bài viết này không?')) return;

  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/posts/${postId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      showToast('Đã xóa bài viết thành công', 'success');
      fetchPosts();
    } else {
      const data = await res.json();
      showToast(data.error || 'Không thể xóa bài viết', 'error');
    }
  } catch (err) {
    showToast('Lỗi mạng khi xóa bài viết', 'error');
  }
}

// Toggle Like Action
async function toggleLikePost(postId: number) {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/posts/${postId}/like`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      fetchPosts();
    }
  } catch (err) {
    console.error('Lỗi khi thả tim bài viết', err);
  }
}

// Add Comment Action (with optional parentId for replies)
async function addCommentToPost(postId: number, content: string, parentId?: number) {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/posts/${postId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ content, parentId })
    });

    if (res.ok) {
      fetchPosts();
    } else {
      showToast('Không thể gửi bình luận', 'error');
    }
  } catch (err) {
    showToast('Lỗi mạng khi bình luận', 'error');
  }
}

// ---------------- FRIEND REQUESTS LOGIC ----------------

async function fetchFriendRequests() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/friends/requests`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) return;

    friendRequests = await res.json();
    updateNotifBadge();
    renderFriendRequests();
  } catch (err) {
    console.error('Lỗi khi lấy lời mời kết bạn', err);
  }
}

function updateNotifBadge() {
  const unreadSystemCount = systemNotifications.filter(n => !n.isRead).length;
  const totalNotifs = friendRequests.length + unreadSystemCount;
  if (totalNotifs > 0) {
    notifBadgeCount.textContent = totalNotifs.toString();
    notifBadgeCount.classList.remove('hidden');
  } else {
    notifBadgeCount.classList.add('hidden');
  }
}

function renderFriendRequests() {
  friendRequestsList.innerHTML = '';

  if (friendRequests.length === 0) {
    friendRequestsList.innerHTML = `
      <div class="post-card" style="text-align: center; color: var(--text-muted); padding: 2rem;">
        Không có lời mời kết bạn nào đang chờ xử lý.
      </div>`;
    return;
  }

  friendRequests.forEach(req => {
    const card = document.createElement('div');
    card.className = 'request-card';

    let avatarHtml = `<div class="avatar">${req.sender.username.charAt(0).toUpperCase()}</div>`;
    if (req.sender.avatarUrl) {
      avatarHtml = `<img src="${getAvatarUrl(req.sender.avatarUrl)}" class="avatar" style="object-fit: cover;" />`;
    }

    const timeFormatted = formatPostTime(req.createdAt);

    const senderIdDisplay = (req.sender as any).zaloId || req.sender.id;
    card.innerHTML = `
      <div class="request-user-info">
        ${avatarHtml}
        <div class="request-details">
          <h4>${req.sender.username} <span style="font-size:0.8rem; color:var(--text-muted); font-weight:normal;">(ID: ${senderIdDisplay})</span></h4>
          <p>Đã gửi lời mời kết bạn • ${timeFormatted}</p>
        </div>
      </div>
      <div class="request-actions">
        <button class="btn-accept" data-accept-id="${req.id}">Đồng ý</button>
        <button class="btn-reject" data-reject-id="${req.id}">Từ chối</button>
      </div>
    `;

    const acceptBtn = card.querySelector(`[data-accept-id="${req.id}"]`);
    if (acceptBtn) {
      acceptBtn.addEventListener('click', () => respondToFriendRequest(req.id, 'accept'));
    }

    const rejectBtn = card.querySelector(`[data-reject-id="${req.id}"]`);
    if (rejectBtn) {
      rejectBtn.addEventListener('click', () => respondToFriendRequest(req.id, 'reject'));
    }

    friendRequestsList.appendChild(card);
  });

  refreshIcons();
}

async function respondToFriendRequest(requestId: number, action: 'accept' | 'reject') {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/friends/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ requestId, action })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message, 'success');
      fetchFriendRequests();
      fetchFriends();
    } else {
      showToast(data.error || 'Thao tác thất bại', 'error');
    }
  } catch (err) {
    showToast('Lỗi mạng khi phản hồi lời mời kết bạn', 'error');
  }
}

// Fetch System Notifications (Likes, Comments, Replies)
async function fetchNotifications() {
  try {
    const token = localStorage.getItem('token');
    const res = await fetch(`${API_URL}/api/notifications`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) return;

    systemNotifications = await res.json();
    updateNotifBadge();
    renderSystemNotifications();
  } catch (err) {
    console.error('Lỗi lấy thông báo hoạt động', err);
  }
}

async function markNotificationAsRead(id: number) {
  try {
    const token = localStorage.getItem('token');
    await fetch(`${API_URL}/api/notifications/${id}/read`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const notif = systemNotifications.find(n => n.id === id);
    if (notif) notif.isRead = true;
    updateNotifBadge();
    renderSystemNotifications();
  } catch (err) {
    console.error('Lỗi đánh dấu thông báo đã đọc', err);
  }
}

async function markAllNotificationsAsRead() {
  try {
    const token = localStorage.getItem('token');
    await fetch(`${API_URL}/api/notifications/read-all`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    systemNotifications.forEach(n => n.isRead = true);
    updateNotifBadge();
    renderSystemNotifications();
  } catch (err) {
    console.error('Lỗi đánh dấu tất cả đã đọc', err);
  }
}

async function navigateToPost(postId?: number) {
  if (!postId) return;
  switchTab('feed');
  if (posts.length === 0) {
    await fetchPosts();
  }
  setTimeout(() => {
    const postEl = document.getElementById(`post-${postId}`);
    if (postEl) {
      postEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      postEl.classList.remove('highlight-pulse');
      void postEl.offsetWidth;
      postEl.classList.add('highlight-pulse');
      setTimeout(() => {
        postEl.classList.remove('highlight-pulse');
      }, 2500);
    }
  }, 150);
}

function renderSystemNotifications() {
  systemNotificationsList.innerHTML = '';

  if (systemNotifications.length === 0) {
    systemNotificationsList.innerHTML = `
      <div class="post-card" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
        Chưa có thông báo tương tác nào.
      </div>`;
    return;
  }

  systemNotifications.forEach(notif => {
    const card = document.createElement('div');
    card.className = notif.isRead ? 'notification-card' : 'notification-card unread';

    let iconClass = 'like';
    let iconLucide = 'heart';
    if (notif.type === 'comment') { iconClass = 'comment'; iconLucide = 'message-circle'; }
    if (notif.type === 'reply') { iconClass = 'reply'; iconLucide = 'corner-down-right'; }

    const timeFormatted = formatPostTime(notif.createdAt);

    card.innerHTML = `
      <div class="notif-icon-box ${iconClass}">
        <i data-lucide="${iconLucide}"></i>
      </div>
      <div class="notif-details">
        <h4>${escapeHtml(notif.content)}</h4>
        <span>${timeFormatted}</span>
      </div>
    `;

    card.addEventListener('click', async () => {
      if (!notif.isRead) {
        await markNotificationAsRead(notif.id);
      }
      if (notif.postId) {
        navigateToPost(notif.postId);
      }
    });

    systemNotificationsList.appendChild(card);
  });

  refreshIcons();
}

// Utilities
function formatPostTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return 'Vừa xong';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

let myProfileData: {
  userId?: number;
  username?: string;
  fullName?: string;
  zaloId?: string;
  dob?: string;
  inviteCode?: string;
  avatarUrl?: string;
  email?: string;
} = {};

async function fetchMyProfile() {
  try {
    const token = localStorage.getItem('token');
    if (!token) return;
    const res = await fetch(`${API_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.status === 401 || res.status === 404) {
      // Stale token or database reset - log out to clear old cache
      localStorage.clear();
      showAuthScreen();
      return;
    }
    if (res.ok) {
      const data = await res.json();
      myProfileData = data;
      myZaloId = data.zaloId || null;
      myAvatarUrl = data.avatarUrl || null;
      if (data.zaloId) localStorage.setItem('zaloId', data.zaloId);

      const myUserIdBadge = document.getElementById('my-user-id-badge');
      if (myUserIdBadge && myZaloId) {
        myUserIdBadge.textContent = `ID ${myZaloId}`;
      }

      // Update rail top user avatar
      if (data.avatarUrl) {
        const fullAvatar = getAvatarUrl(data.avatarUrl);
        myAvatarImg.src = fullAvatar;
        myAvatarImg.classList.remove('hidden');
        myAvatarDisplay.classList.add('hidden');

        if (composerAvatarImg) {
          composerAvatarImg.src = fullAvatar;
          composerAvatarImg.classList.remove('hidden');
          if (composerAvatar) composerAvatar.classList.add('hidden');
        }
      } else {
        const displayName = data.fullName || data.username || 'U';
        myAvatarDisplay.textContent = displayName.charAt(0).toUpperCase();
        myAvatarDisplay.classList.remove('hidden');
        myAvatarImg.classList.add('hidden');
      }
    }
  } catch (err) {
    console.error('Lỗi lấy profile cá nhân', err);
  }
}

async function openProfileModal() {
  await fetchMyProfile();
  populateProfileModalData();
  profileModal.classList.remove('hidden');
  refreshIcons();
}

function closeProfileModal() {
  profileModal.classList.add('hidden');
}

function populateProfileModalData() {
  profileDisplayUsername.textContent = myProfileData.username || '';
  profileFullnameInput.value = myProfileData.fullName || myProfileData.username || '';
  profileZaloIdDisplay.value = myProfileData.zaloId ? `#${myProfileData.zaloId}` : '';
  profileDobInput.value = myProfileData.dob || '';
  profileEmailDisplay.value = myProfileData.email || 'Chưa cập nhật';

  const avatarUrl = myProfileData.avatarUrl;
  if (avatarUrl) {
    const fullAvatar = getAvatarUrl(avatarUrl);
    profileAvatarImg.src = fullAvatar;
    profileAvatarImg.classList.remove('hidden');
    profileAvatarText.classList.add('hidden');
  } else {
    profileAvatarImg.classList.add('hidden');
    profileAvatarText.classList.remove('hidden');
    const name = myProfileData.fullName || myProfileData.username || 'U';
    profileAvatarText.textContent = name.charAt(0).toUpperCase();
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

function getAvatarUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

// Startup
init();
