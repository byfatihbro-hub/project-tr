const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Kullanıcı adı -> Socket ID eşlemesi
const activeUsers = new Map();

// Online kullanıcı listesini herkese gönderen yardımcı fonksiyon
function broadcastActiveUsers() {
    const users = Array.from(activeUsers.keys());
    io.emit('active_users', users);
}

// MongoDB Atlas Bağlantısı
mongoose.connect('mongodb+srv://fatih:fatih123@cluster0.shfpkht.mongodb.net/project-tr?retryWrites=true&w=majority')
    .then(() => console.log('MongoDB Atlas bağlantısı başarılı! 🟢'))
    .catch(err => console.error('MongoDB bağlantı hatası:', err));

app.use(express.static('public'));

io.on('connection', async (socket) => {
    console.log('Project TR hattına bağlandılar! 🚗');

    socket.on('set-username', (username, callback) => {
        if (!username || username.trim() === '') {
            return callback({ success: false, message: "Geçersiz isim kanka!" });
        }
        
        const cleanUser = username.trim();
        
        if (activeUsers.has(cleanUser)) {
            const existingSocketId = activeUsers.get(cleanUser);
            if (io.sockets.sockets.has(existingSocketId)) {
                return callback({ success: false, message: "Bu isim şu an başka bir cihazda aktif kullanılıyor kanka!" });
            } else {
                activeUsers.delete(cleanUser);
            }
        }

        for (let [user, sId] of activeUsers.entries()) {
            if (sId === socket.id) {
                activeUsers.delete(user);
            }
        }

        activeUsers.set(cleanUser, socket.id);
        socket.username = cleanUser;
        callback({ success: true });
        
        // Listeyi güncelle
        broadcastActiveUsers();
    });

    // 1. Geçmiş mesajları gönder
    try {
        const previousMessages = await Message.find().sort({ timestamp: 1 }).limit(50);
        socket.emit('init_messages', previousMessages);
    } catch (err) {
        console.error('Geçmiş mesajlar yüklenemedi:', err);
    }

    // 2. Yeni mesajı kaydet ve dağıt
    socket.on('chat message', async (data) => {
        try {
            const newMessage = new Message({
                user: data.user,
                text: data.text
            });
            await newMessage.save();

            io.emit('chat message', newMessage);
        } catch (err) {
            console.error('Mesaj kaydedilemedi:', err);
        }
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            activeUsers.delete(socket.username);
            console.log(`${socket.username} hattan düştü.`);
            broadcastActiveUsers();
        } else {
            console.log('Biri hattan düştü.');
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ayakta! Port: ${PORT}`);
});
