"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const client_1 = require("@prisma/client");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const google_auth_library_1 = require("google-auth-library");
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: {
        origin: '*', // In production, replace with frontend URL
        methods: ['GET', 'POST']
    }
});
const prisma = new client_1.PrismaClient();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretjwtkey';
const PORT = process.env.PORT || 3000;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new google_auth_library_1.OAuth2Client(GOOGLE_CLIENT_ID);
const uploadsDir = path_1.default.join(__dirname, '../uploads');
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir);
}
app.use('/uploads', express_1.default.static(uploadsDir));
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path_1.default.extname(file.originalname));
    }
});
const upload = (0, multer_1.default)({ storage });
// -- REST API ENDPOINTS --
// Register
app.post('/api/auth/register', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }
        const existingUser = yield prisma.user.findUnique({ where: { username } });
        if (existingUser) {
            return res.status(400).json({ error: 'Username already taken' });
        }
        const passwordHash = yield bcrypt_1.default.hash(password, 10);
        const user = yield prisma.user.create({
            data: { username, passwordHash }
        });
        res.status(201).json({ message: 'User created successfully', userId: user.id, inviteCode: user.inviteCode, avatarUrl: user.avatarUrl });
    }
    catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// Login
app.post('/api/auth/login', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username, password } = req.body;
        const user = yield prisma.user.findUnique({ where: { username } });
        if (!user || !user.passwordHash) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const isValid = yield bcrypt_1.default.compare(password, user.passwordHash);
        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, userId: user.id, username: user.username, inviteCode: user.inviteCode, avatarUrl: user.avatarUrl });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// Google Login
app.post('/api/auth/google', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { token } = req.body;
        if (!token)
            return res.status(400).json({ error: 'Token is required' });
        const ticket = yield googleClient.verifyIdToken({
            idToken: token,
            audience: GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
            return res.status(400).json({ error: 'Invalid Google token payload' });
        }
        const { email, name, picture } = payload;
        let user = yield prisma.user.findUnique({ where: { email } });
        if (!user) {
            let baseUsername = email.split('@')[0];
            let username = baseUsername;
            let count = 1;
            while (yield prisma.user.findUnique({ where: { username } })) {
                username = `${baseUsername}${count}`;
                count++;
            }
            user = yield prisma.user.create({
                data: {
                    username,
                    email,
                    avatarUrl: picture,
                }
            });
        }
        else {
            if (user.avatarUrl !== picture) {
                user = yield prisma.user.update({
                    where: { id: user.id },
                    data: { avatarUrl: picture }
                });
            }
        }
        const jwtToken = jsonwebtoken_1.default.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token: jwtToken, userId: user.id, username: user.username, inviteCode: user.inviteCode, avatarUrl: user.avatarUrl });
    }
    catch (error) {
        console.error('Google Auth Error:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
}));
// Middleware for API auth
const authenticateAPI = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader)
        return res.status(401).json({ error: 'Missing authorization header' });
    const token = authHeader.split(' ')[1];
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = payload;
        next();
    }
    catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
};
// Get friends
app.get('/api/friends', authenticateAPI, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const currentUserId = req.user.userId;
        const friendships = yield prisma.friendship.findMany({
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
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}));
app.get('/api/users', authenticateAPI, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const users = yield prisma.user.findMany({
            select: { id: true, username: true, avatarUrl: true }
        });
        res.json(users);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// Get Current User Profile
app.get('/api/users/me', authenticateAPI, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const currentUserId = req.user.userId;
        const user = yield prisma.user.findUnique({
            where: { id: currentUserId },
            include: {
                friendshipsInitiated: true,
                friendshipsReceived: true
            }
        });
        if (!user)
            return res.status(404).json({ error: 'User not found' });
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
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// Update Current User Profile
app.put('/api/users/me', authenticateAPI, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const currentUserId = req.user.userId;
        const { username } = req.body;
        if (!username || username.trim() === '') {
            return res.status(400).json({ error: 'Username cannot be empty' });
        }
        const existing = yield prisma.user.findUnique({ where: { username } });
        if (existing && existing.id !== currentUserId) {
            return res.status(400).json({ error: 'Username is already taken' });
        }
        const updatedUser = yield prisma.user.update({
            where: { id: currentUserId },
            data: { username: username.trim() }
        });
        res.json({ message: 'Profile updated', username: updatedUser.username });
    }
    catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// Update Avatar
app.post('/api/users/avatar', authenticateAPI, upload.single('avatar'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!req.file)
            return res.status(400).json({ error: 'No file uploaded' });
        const currentUserId = req.user.userId;
        const avatarUrl = `/uploads/${req.file.filename}`;
        const updatedUser = yield prisma.user.update({
            where: { id: currentUserId },
            data: { avatarUrl }
        });
        res.json({ avatarUrl: updatedUser.avatarUrl });
    }
    catch (error) {
        console.error('Avatar upload error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// Add Friend via invite code
app.post('/api/friends/add', authenticateAPI, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { inviteCode } = req.body;
        const currentUserId = req.user.userId;
        if (!inviteCode)
            return res.status(400).json({ error: 'Invite code required' });
        const targetUser = yield prisma.user.findUnique({ where: { inviteCode } });
        if (!targetUser)
            return res.status(404).json({ error: 'Invalid invite code' });
        if (targetUser.id === currentUserId)
            return res.status(400).json({ error: 'Cannot add yourself' });
        const existing = yield prisma.friendship.findFirst({
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
        yield prisma.friendship.create({
            data: {
                user1Id: currentUserId,
                user2Id: targetUser.id
            }
        });
        res.json({ message: 'Friend added successfully', friend: { id: targetUser.id, username: targetUser.username, avatarUrl: targetUser.avatarUrl } });
    }
    catch (error) {
        console.error('Add friend error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// Upload endpoint
app.post('/api/messages/upload', authenticateAPI, upload.single('file'), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const message = yield prisma.message.create({
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
    }
    catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// Get messages between current user and target user
app.get('/api/messages/:targetUserId', authenticateAPI, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const currentUserId = req.user.userId;
        const targetUserId = parseInt(req.params.targetUserId);
        const messages = yield prisma.message.findMany({
            where: {
                OR: [
                    { senderId: currentUserId, receiverId: targetUserId },
                    { senderId: targetUserId, receiverId: currentUserId }
                ]
            },
            orderBy: { createdAt: 'asc' }
        });
        res.json(messages);
    }
    catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
}));
// -- WEBSOCKET (Socket.io) --
// Socket Authentication Middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
        return next(new Error('Authentication error'));
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        socket.data.user = payload;
        next();
    }
    catch (err) {
        next(new Error('Authentication error'));
    }
});
// Track connected users: userId -> socketId
const connectedUsers = new Map();
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
    socket.on('private_message', (_a) => __awaiter(void 0, [_a], void 0, function* ({ receiverId, content }) {
        try {
            // Save message to DB
            const message = yield prisma.message.create({
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
        }
        catch (error) {
            console.error('Socket message error:', error);
        }
    }));
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${user.username}`);
        connectedUsers.delete(user.userId);
        io.emit('user_status', { userId: user.userId, status: 'offline' });
    });
});
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
