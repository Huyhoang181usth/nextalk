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
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

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

app.get('/', (req, res) => {
  res.status(200).send('Nextalk Backend is running!');
});


const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';
const PORT = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'nextalk_uploads',
    resource_type: 'auto',
    allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'pdf', 'doc', 'docx', 'zip', 'rar', 'webm', 'mp4'],
  } as any,
});

const upload = multer({ storage });

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
    const user = await prisma.user.create({
      data: { username, passwordHash }
    });

    res.status(201).json({ message: 'User created successfully', userId: user.id, inviteCode: user.inviteCode, avatarUrl: user.avatarUrl });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, userId: user.id, username: user.username, inviteCode: user.inviteCode, avatarUrl: user.avatarUrl });
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

      user = await prisma.user.create({
        data: {
          username,
          email,
          avatarUrl: picture,
        }
      });
    } else {
      if (user.avatarUrl !== picture) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { avatarUrl: picture }
        });
      }
    }

    const jwtToken = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token: jwtToken, userId: user.id, username: user.username, inviteCode: user.inviteCode, avatarUrl: user.avatarUrl });
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

// Get friends
app.get('/api/friends', authenticateAPI, async (req: any, res: any) => {
  try {
    const currentUserId = req.user.userId;
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [{ user1Id: currentUserId }, { user2Id: currentUserId }]
      },
      include: {
        user1: { select: { id: true, username: true, avatarUrl: true } },
        user2: { select: { id: true, username: true, avatarUrl: true } }
      }
    });

    const friends = friendships.map(f => {
      return f.user1Id === currentUserId ? f.user2 : f.user1;
    });

    res.json(friends);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users', authenticateAPI, async (req: any, res: any) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, avatarUrl: true }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Current User Profile
app.get('/api/users/me', authenticateAPI, async (req: any, res: any) => {
  try {
    const currentUserId = req.user.userId;
    const user = await prisma.user.findUnique({
      where: { id: currentUserId },
      include: {
        friendshipsInitiated: true,
        friendshipsReceived: true
      }
    });
    
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    const friendCount = user.friendshipsInitiated.length + user.friendshipsReceived.length;
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      inviteCode: user.inviteCode,
      createdAt: user.createdAt,
      friendCount
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Current User Profile
app.put('/api/users/me', authenticateAPI, async (req: any, res: any) => {
  try {
    const currentUserId = req.user.userId;
    const { username } = req.body;
    
    if (!username || username.trim() === '') {
      return res.status(400).json({ error: 'Username cannot be empty' });
    }
    
    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing && existing.id !== currentUserId) {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    
    const updatedUser = await prisma.user.update({
      where: { id: currentUserId },
      data: { username: username.trim() }
    });
    
    res.json({ message: 'Profile updated', username: updatedUser.username });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Avatar
app.post('/api/users/avatar', authenticateAPI, upload.single('avatar'), async (req: any, res: any) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const currentUserId = req.user.userId;
    const avatarUrl = req.file.path; // Cloudinary absolute URL
    
    const updatedUser = await prisma.user.update({
      where: { id: currentUserId },
      data: { avatarUrl }
    });
    
    res.json({ avatarUrl: updatedUser.avatarUrl });
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add Friend via invite code
app.post('/api/friends/add', authenticateAPI, async (req: any, res: any) => {
  try {
    const { inviteCode } = req.body;
    const currentUserId = req.user.userId;

    if (!inviteCode) return res.status(400).json({ error: 'Invite code required' });

    const targetUser = await prisma.user.findUnique({ where: { inviteCode } });
    if (!targetUser) return res.status(404).json({ error: 'Invalid invite code' });
    if (targetUser.id === currentUserId) return res.status(400).json({ error: 'Cannot add yourself' });

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { user1Id: currentUserId, user2Id: targetUser.id },
          { user1Id: targetUser.id, user2Id: currentUserId }
        ]
      }
    });

    if (existing) {
      return res.status(400).json({ error: 'Already friends' });
    }

    await prisma.friendship.create({
      data: {
        user1Id: currentUserId,
        user2Id: targetUser.id
      }
    });

    res.json({ message: 'Friend added successfully', friend: { id: targetUser.id, username: targetUser.username, avatarUrl: targetUser.avatarUrl } });
  } catch (error) {
    console.error('Add friend error:', error);
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
    const isVideo = file.mimetype.startsWith('video/');
    const type = isImage ? 'image' : (isVideo ? 'video' : 'file');
    const fileUrl = file.path; // Cloudinary absolute URL

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

// Track connected users: userId -> socketId
const connectedUsers = new Map<number, string>();

io.on('connection', (socket) => {
  const user = socket.data.user;
  console.log(`User connected: ${user.username} (${socket.id})`);
  
  connectedUsers.set(user.userId, socket.id);

  // Broadcast to all that a user came online
  io.emit('user_status', { userId: user.userId, status: 'online' });

  // Expose an endpoint or emit event for initial online statuses?
  // Frontend can just assume those with status='online' are online,
  // but it's better to just send the currently connected users list when someone connects.
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

  // --- WEBRTC SIGNALING ---
  
  socket.on('call_user', ({ to, fromName, type }) => {
    const targetSocketId = connectedUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('incoming_call', {
        from: user.userId,
        fromName,
        type // 'voice' or 'video'
      });
    }
  });

  socket.on('call_response', ({ to, accepted }) => {
    const targetSocketId = connectedUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_answered', { accepted });
    }
  });

  socket.on('webrtc_signal', ({ to, signal }) => {
    const targetSocketId = connectedUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('webrtc_signal', {
        from: user.userId,
        signal
      });
    }
  });

  socket.on('end_call', ({ to }) => {
    const targetSocketId = connectedUsers.get(to);
    if (targetSocketId) {
      io.to(targetSocketId).emit('call_ended');
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${user.username}`);
    connectedUsers.delete(user.userId);
    io.emit('user_status', { userId: user.userId, status: 'offline' });
  });
});

server.listen(typeof PORT === 'string' ? parseInt(PORT, 10) : PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
