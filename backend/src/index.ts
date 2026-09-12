import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { OAuth2Client } from 'google-auth-library';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*', // In production, replace with frontend URL
    methods: ['GET', 'POST']
  }
});
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';
const PORT = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const connectedUsers = new Map<number, string>();

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}
app.use('/uploads', express.static(uploadsDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Helper to generate a unique random 6-digit Zalo ID
async function generateUniqueZaloId(): Promise<string> {
  let zaloId = '';
  let exists = true;
  while (exists) {
    zaloId = Math.floor(100000 + Math.random() * 900000).toString();
    const user = await prisma.user.findUnique({ where: { zaloId } });
    if (!user) exists = false;
  }
  return zaloId;
}

// -- REST API ENDPOINTS --

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const zaloId = await generateUniqueZaloId();
    const user = await prisma.user.create({
      data: { username, passwordHash, zaloId }
    });

    res.status(201).json({ message: 'User created successfully', userId: user.id, zaloId: user.zaloId, inviteCode: user.inviteCode, avatarUrl: user.avatarUrl });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    let user = await prisma.user.findUnique({ where: { username } });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Auto-generate 6-digit zaloId for existing accounts if missing
    if (!user.zaloId) {
      const newZaloId = await generateUniqueZaloId();
      user = await prisma.user.update({
        where: { id: user.id },
        data: { zaloId: newZaloId }
      });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, userId: user.id, username: user.username, zaloId: user.zaloId, inviteCode: user.inviteCode, avatarUrl: user.avatarUrl });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Google Login
app.post('/api/auth/google', async (req: any, res: any) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: GOOGLE_CLIENT_ID
    });
    
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid Google token payload' });
    }

    const { email, name, picture } = payload;
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      let baseUsername = email.split('@')[0];
      let username = baseUsername;
      let count = 1;
      while (await prisma.user.findUnique({ where: { username } })) {
        username = `${baseUsername}${count}`;
        count++;
      }
      const zaloId = await generateUniqueZaloId();

      user = await prisma.user.create({
        data: {
          username,
          email,
          avatarUrl: picture,
          zaloId
        }
      });
    } else {
      if (!user.zaloId || user.avatarUrl !== picture) {
        const zaloId = user.zaloId || (await generateUniqueZaloId());
        user = await prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: picture, zaloId }
        });
      }
    }

    const jwtToken = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token: jwtToken, userId: user.id, username: user.username, zaloId: user.zaloId, inviteCode: user.inviteCode, avatarUrl: user.avatarUrl });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Middleware for API auth
const authenticateAPI = (req: any, res: any, next: any) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Missing authorization header' });

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Get current user profile (with auto 6-digit zaloId generation)
app.get('/api/auth/me', authenticateAPI, async (req: any, res: any) => {
  try {
    const currentUserId = req.user.userId;
    let user = await prisma.user.findUnique({ where: { id: currentUserId } });

    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.zaloId) {
      const zaloId = await generateUniqueZaloId();
      user = await prisma.user.update({
        where: { id: user.id },
        data: { zaloId }
      });
    }

    res.json({
      userId: user.id,
      username: user.username,
      fullName: user.fullName || user.username,
      zaloId: user.zaloId,
      dob: user.dob || '',
      inviteCode: user.inviteCode,
      avatarUrl: user.avatarUrl,
      email: user.email
    });
  } catch (error) {
    console.error('Fetch me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Profile (Full Name, Date of Birth)
app.put('/api/profile', authenticateAPI, async (req: any, res: any) => {
  try {
    const currentUserId = req.user.userId;
    const { fullName, dob } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: currentUserId },
      data: {
        fullName: fullName !== undefined ? fullName.trim() : undefined,
        dob: dob !== undefined ? dob.trim() : undefined
      }
    });

    res.json({
      userId: updatedUser.id,
      username: updatedUser.username,
      fullName: updatedUser.fullName || updatedUser.username,
      zaloId: updatedUser.zaloId,
      dob: updatedUser.dob || '',
      inviteCode: updatedUser.inviteCode,
      avatarUrl: updatedUser.avatarUrl,
      email: updatedUser.email
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Lỗi cập nhật hồ sơ cá nhân' });
  }
});

// Upload Profile Avatar
app.post('/api/profile/avatar', authenticateAPI, upload.single('avatar'), async (req: any, res: any) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Vui lòng chọn ảnh đại diện' });
    const avatarUrl = `/uploads/${file.filename}`;
    const updatedUser = await prisma.user.update({
      where: { id: req.user.userId },
      data: { avatarUrl }
    });
    res.json({ avatarUrl: updatedUser.avatarUrl });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ error: 'Lỗi tải ảnh đại diện' });
  }
});

// Get accepted friends
app.get('/api/friends', authenticateAPI, async (req: any, res: any) => {
  try {
    const currentUserId = req.user.userId;
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [{ senderId: currentUserId }, { receiverId: currentUserId }]
      },
      include: {
        sender: { select: { id: true, zaloId: true, username: true, avatarUrl: true, lastSeen: true } },
        receiver: { select: { id: true, zaloId: true, username: true, avatarUrl: true, lastSeen: true } }
      }
    });

    const friends = friendships.map(f => {
      const friend = f.senderId === currentUserId ? f.receiver : f.sender;
      return {
        ...friend,
        isOnline: connectedUsers.has(friend.id)
      };
    });

    res.json(friends);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send Friend Request
app.post('/api/friends/add', authenticateAPI, async (req: any, res: any) => {
  try {
    const rawQuery = (req.body.inviteCode || req.body.query || '').toString().trim();
    const currentUserId = req.user.userId;

    if (!rawQuery) {
      return res.status(400).json({ error: 'Vui lòng nhập ID, Tên người dùng, Email hoặc Mã mời' });
    }

    const queryInt = parseInt(rawQuery);
    const targetUser = await prisma.user.findFirst({
      where: {
        OR: [
          { zaloId: rawQuery },
          { inviteCode: rawQuery },
          { username: rawQuery },
          { email: rawQuery },
          ...(!isNaN(queryInt) ? [{ id: queryInt }] : [])
        ]
      }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Không tìm thấy người dùng phù hợp' });
    }

    if (targetUser.id === currentUserId) {
      return res.status(400).json({ error: 'Không thể kết bạn với chính mình' });
    }

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: targetUser.id },
          { senderId: targetUser.id, receiverId: currentUserId }
        ]
      }
    });

    if (existing) {
      if (existing.status === 'accepted') {
        return res.status(400).json({ error: `Bạn và ${targetUser.username} đã là bạn bè!` });
      }
      if (existing.status === 'pending') {
        if (existing.senderId === currentUserId) {
          return res.status(400).json({ error: `Đã gửi lời mời kết bạn tới ${targetUser.username}. Vui lòng chờ phản hồi!` });
        } else {
          return res.status(400).json({ error: `${targetUser.username} đã gửi lời mời kết bạn cho bạn! Vui lòng vào tab Thông báo để đồng ý.` });
        }
      }
    }

    const newRequest = await prisma.friendship.create({
      data: {
        senderId: currentUserId,
        receiverId: targetUser.id,
        status: 'pending'
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } }
      }
    });

    // Send real-time socket notification if target user is online
    const targetSocketId = connectedUsers.get(targetUser.id);
    if (targetSocketId) {
      io.to(targetSocketId).emit('friend_request', newRequest);
    }

    res.json({
      message: `Đã gửi lời mời kết bạn tới ${targetUser.username}!`,
      friend: {
        id: targetUser.id,
        username: targetUser.username,
        avatarUrl: targetUser.avatarUrl
      }
    });
  } catch (error) {
    console.error('Add friend request error:', error);
    res.status(500).json({ error: 'Lỗi hệ thống khi gửi lời mời kết bạn' });
  }
});

// Get pending incoming friend requests
app.get('/api/friends/requests', authenticateAPI, async (req: any, res: any) => {
  try {
    const currentUserId = req.user.userId;
    const requests = await prisma.friendship.findMany({
      where: {
        receiverId: currentUserId,
        status: 'pending'
      },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true, email: true } }
      }
    });

    res.json(requests);
  } catch (error) {
    console.error('Fetch friend requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Respond to friend request (accept / reject)
app.post('/api/friends/respond', authenticateAPI, async (req: any, res: any) => {
  try {
    const currentUserId = req.user.userId;
    const { requestId, action } = req.body; // action: 'accept' | 'reject'

    if (!requestId || !['accept', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Dữ liệu không hợp lệ' });
    }

    const request = await prisma.friendship.findUnique({
      where: { id: parseInt(requestId) },
      include: {
        receiver: { select: { id: true, username: true, avatarUrl: true } }
      }
    });

    if (!request || request.receiverId !== currentUserId) {
      return res.status(404).json({ error: 'Không tìm thấy lời mời kết bạn' });
    }

    if (action === 'accept') {
      await prisma.friendship.update({
        where: { id: request.id },
        data: { status: 'accepted' }
      });

      // Emit socket notification back to sender
      const senderSocketId = connectedUsers.get(request.senderId);
      if (senderSocketId) {
        io.to(senderSocketId).emit('friend_request_accepted', {
          friend: request.receiver
        });
      }

      res.json({ message: 'Đã chấp nhận lời mời kết bạn!' });
    } else {
      await prisma.friendship.delete({
        where: { id: request.id }
      });

      res.json({ message: 'Đã từ chối lời mời kết bạn!' });
    }
  } catch (error) {
    console.error('Respond to friend request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Upload endpoint
app.post('/api/messages/upload', authenticateAPI, upload.single('file'), async (req: any, res: any) => {
  try {
    const file = req.file;
    const { receiverId } = req.body;
    const senderId = req.user.userId;

    if (!file || !receiverId) {
      return res.status(400).json({ error: 'File and receiverId are required' });
    }

    const isImage = file.mimetype.startsWith('image/');
    const type = isImage ? 'image' : 'file';
    const fileUrl = `/uploads/${file.filename}`;

    const message = await prisma.message.create({
      data: {
        content: file.originalname,
        type,
        fileUrl,
        senderId,
        receiverId: parseInt(receiverId)
      }
    });

    const receiverSocketId = connectedUsers.get(message.receiverId);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('new_message', message);
    }
    // Also emit back to sender
    const senderSocketId = connectedUsers.get(senderId);
    if (senderSocketId) {
      io.to(senderSocketId).emit('new_message', message);
    }

    res.json(message);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get messages between current user and target user
app.get('/api/messages/:targetUserId', authenticateAPI, async (req: any, res: any) => {
  try {
    const currentUserId = req.user.userId;
    const targetUserId = parseInt(req.params.targetUserId);

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: targetUserId },
          { senderId: targetUserId, receiverId: currentUserId }
        ]
      },
      orderBy: { createdAt: 'asc' }
    });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// -- NEWSFEED API ENDPOINTS --

// Get all posts for Newsfeed (only my posts + accepted friends posts)
app.get('/api/posts', authenticateAPI, async (req: any, res: any) => {
  try {
    const currentUserId = req.user.userId;

    // Find all accepted friend IDs
    const friendships = await prisma.friendship.findMany({
      where: {
        status: 'accepted',
        OR: [{ senderId: currentUserId }, { receiverId: currentUserId }]
      }
    });

    const friendIds = friendships.map(f => f.senderId === currentUserId ? f.receiverId : f.senderId);
    const allowedAuthorIds = [currentUserId, ...friendIds];

    const posts = await prisma.post.findMany({
      where: {
        authorId: { in: allowedAuthorIds }
      },
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { id: true, zaloId: true, username: true, avatarUrl: true }
        },
        likes: {
          select: { userId: true }
        },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, zaloId: true, username: true, avatarUrl: true } },
            parent: { select: { id: true, author: { select: { username: true } } } }
          }
        }
      }
    });

    const formattedPosts = posts.map(post => {
      const isLikedByMe = post.likes.some(like => like.userId === currentUserId);
      return {
        ...post,
        likeCount: post.likes.length,
        isLikedByMe,
        likes: undefined // remove raw likes array for cleaner payload
      };
    });

    res.json(formattedPosts);
  } catch (error) {
    console.error('Fetch posts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a new post (text + optional image)
app.post('/api/posts', authenticateAPI, upload.single('image'), async (req: any, res: any) => {
  try {
    const authorId = req.user.userId;
    const { content } = req.body;
    const file = req.file;

    if (!content && !file) {
      return res.status(400).json({ error: 'Post must contain text or an image' });
    }

    const imageUrl = file ? `/uploads/${file.filename}` : null;

    const post = await prisma.post.create({
      data: {
        content: content || null,
        imageUrl,
        authorId
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        likes: { select: { userId: true } },
        comments: {
          include: {
            author: { select: { id: true, username: true, avatarUrl: true } }
          }
        }
      }
    });

    res.status(201).json({
      ...post,
      likeCount: 0,
      isLikedByMe: false,
      likes: undefined
    });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a post
app.delete('/api/posts/:id', authenticateAPI, async (req: any, res: any) => {
  try {
    const postId = parseInt(req.params.id);
    const currentUserId = req.user.userId;

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.authorId !== currentUserId) {
      return res.status(403).json({ error: 'Unauthorized to delete this post' });
    }

    await prisma.post.delete({ where: { id: postId } });
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle Like on a post
app.post('/api/posts/:id/like', authenticateAPI, async (req: any, res: any) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.user.userId;

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const existingLike = await prisma.like.findUnique({
      where: {
        postId_userId: { postId, userId }
      }
    });

    let isLikedByMe = false;
    if (existingLike) {
      await prisma.like.delete({
        where: { id: existingLike.id }
      });
      isLikedByMe = false;
    } else {
      await prisma.like.create({
        data: { postId, userId }
      });
      isLikedByMe = true;

      // Create notification if liking someone else's post
      if (post.authorId !== userId) {
        const sender = await prisma.user.findUnique({ where: { id: userId } });
        const notif = await prisma.notification.create({
          data: {
            type: 'like',
            content: `${sender?.username} đã thích bài viết của bạn.`,
            userId: post.authorId,
            senderId: userId,
            postId: post.id
          },
          include: {
            sender: { select: { id: true, zaloId: true, username: true, avatarUrl: true } }
          }
        });

        const targetSocketId = connectedUsers.get(post.authorId);
        if (targetSocketId) {
          io.to(targetSocketId).emit('post_interaction', notif);
        }
      }
    }

    const likeCount = await prisma.like.count({ where: { postId } });
    res.json({ isLikedByMe, likeCount });
  } catch (error) {
    console.error('Toggle like error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add Comment or Reply to a post
app.post('/api/posts/:id/comments', authenticateAPI, async (req: any, res: any) => {
  try {
    const postId = parseInt(req.params.id);
    const authorId = req.user.userId;
    const { content, parentId } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment content is required' });
    }

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const sender = await prisma.user.findUnique({ where: { id: authorId } });

    const comment = await prisma.comment.create({
      data: {
        content: content.trim(),
        postId,
        authorId,
        parentId: parentId ? parseInt(parentId) : null
      },
      include: {
        author: { select: { id: true, zaloId: true, username: true, avatarUrl: true } },
        parent: { select: { id: true, author: { select: { id: true, username: true } } } }
      }
    });

    // Handle Notifications for replies or post comments
    if (parentId) {
      const parentComment = await prisma.comment.findUnique({ where: { id: parseInt(parentId) } });
      if (parentComment && parentComment.authorId !== authorId) {
        const notif = await prisma.notification.create({
          data: {
            type: 'reply',
            content: `${sender?.username} đã trả lời bình luận của bạn: "${content.trim().slice(0, 35)}..."`,
            userId: parentComment.authorId,
            senderId: authorId,
            postId: post.id
          },
          include: {
            sender: { select: { id: true, zaloId: true, username: true, avatarUrl: true } }
          }
        });

        const targetSocketId = connectedUsers.get(parentComment.authorId);
        if (targetSocketId) {
          io.to(targetSocketId).emit('post_interaction', notif);
        }
      }
    } else if (post.authorId !== authorId) {
      const notif = await prisma.notification.create({
        data: {
          type: 'comment',
          content: `${sender?.username} đã bình luận bài viết của bạn: "${content.trim().slice(0, 35)}..."`,
          userId: post.authorId,
          senderId: authorId,
          postId: post.id
        },
        include: {
          sender: { select: { id: true, zaloId: true, username: true, avatarUrl: true } }
        }
      });

      const targetSocketId = connectedUsers.get(post.authorId);
      if (targetSocketId) {
        io.to(targetSocketId).emit('post_interaction', notif);
      }
    }

    res.status(201).json(comment);
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get User System Notifications
app.get('/api/notifications', authenticateAPI, async (req: any, res: any) => {
  try {
    const currentUserId = req.user.userId;
    const notifications = await prisma.notification.findMany({
      where: { userId: currentUserId },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: { select: { id: true, zaloId: true, username: true, avatarUrl: true } }
      }
    });

    res.json(notifications);
  } catch (error) {
    console.error('Fetch notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark single notification as read
app.post('/api/notifications/:id/read', authenticateAPI, async (req: any, res: any) => {
  try {
    const notifId = parseInt(req.params.id);
    const currentUserId = req.user.userId;

    await prisma.notification.updateMany({
      where: { id: notifId, userId: currentUserId },
      data: { isRead: true }
    });

    res.json({ message: 'Marked as read' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark all notifications as read
app.post('/api/notifications/read-all', authenticateAPI, async (req: any, res: any) => {
  try {
    const currentUserId = req.user.userId;

    await prisma.notification.updateMany({
      where: { userId: currentUserId, isRead: false },
      data: { isRead: true }
    });

    res.json({ message: 'All marked as read' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// -- WEBSOCKET (Socket.io) --

// Socket Authentication Middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number, username: string };
    socket.data.user = payload;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

// Track connected users: userId -> socketId is declared above

io.on('connection', (socket) => {
  const user = socket.data.user;
  console.log(`User connected: ${user.username} (${socket.id})`);
  
  connectedUsers.set(user.userId, socket.id);

  // Broadcast to all that a user came online
  io.emit('user_status', { userId: user.userId, status: 'online', isOnline: true });

  const onlineUsers = Array.from(connectedUsers.keys());
  socket.emit('initial_online_users', onlineUsers);

  socket.on('private_message', async ({ receiverId, content }) => {
    try {
      // Save message to DB
      const message = await prisma.message.create({
        data: {
          content,
          senderId: user.userId,
          receiverId
        }
      });

      // Send to recipient if online
      const receiverSocketId = connectedUsers.get(receiverId);
      if (receiverSocketId) {
        io.to(receiverSocketId).emit('new_message', message);
      }

      // Send back to sender so they can update their UI
      socket.emit('new_message', message);
    } catch (error) {
      console.error('Socket message error:', error);
    }
  });

  socket.on('disconnect', async () => {
    console.log(`User disconnected: ${user.username}`);
    connectedUsers.delete(user.userId);
    const lastSeen = new Date();
    await prisma.user.update({
      where: { id: user.userId },
      data: { lastSeen }
    }).catch(() => {});
    io.emit('user_status', { userId: user.userId, status: 'offline', isOnline: false, lastSeen: lastSeen.toISOString() });
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
