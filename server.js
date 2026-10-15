const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const activeUsers = new Map();

// GRUP AYARLARI VE YÖNETİCİ LİSTESİ
let groupSettings = {
    icon: 'https://cdn-icons-png.flaticon.com/512/882/882747.png', // Varsayılan grup resmi (araba filan)
    admins: ['Fatih', 'fatih'] // Kurucu yönetici sensin kanka!
};

function broadcastActiveUsers() {
    const users = Array.from(activeUsers.keys());
    io.emit('active_users', users);
}

mongoose.connect('mongodb+srv://fatih:fatih123@cluster0.shfpkht.mongodb.net/project-tr?retryWrites=true&w=majority')
    .then(() => console.log('MongoDB Atlas bağlantısı başarılı! 🟢'))
    .catch(err => console.error('MongoDB bağlantı hatası:', err));

app.use(express.static('public'));

io.on('connection', async (socket) => {
    console.log('Project TR hattına bağlandılar! 🚗');

    // Giriş yapana güncel grup bilgilerini gönder
    socket.emit('group_settings', groupSettings);

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
        
        broadcastActiveUsers();
    });

    // Grup fotoğrafı değiştirme yetkisi (Sadece adminler)
    socket.on('change_group_icon', (newUrl) => {
        if (groupSettings.admins.includes(socket.username)) {
            groupSettings.icon = newUrl;
            io.emit('group_settings', groupSettings); // Herkese yeni resmi yolla
        }
    });

    // Başkasını yönetici yapma yetkisi (Sadece adminler)
    socket.on('make_admin', (targetUser) => {
        if (groupSettings.admins.includes(socket.username) && !groupSettings.admins.includes(targetUser)) {
            groupSettings.admins.push(targetUser);
            io.emit('group_settings', groupSettings); // Herkese yeni admin listesini yolla
        }
    });

    try {
        const previousMessages = await Message.find().sort({ timestamp: 1 }).limit(50);
        socket.emit('init_messages', previousMessages);
    } catch (err) {
        console.error('Geçmiş mesajlar yüklenemedi:', err);
    }

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
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ayakta! Port: ${PORT}`);
});
