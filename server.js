const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const activeUsers = new Map();
const userProfiles = new Map();

let groupSettings = {
    icon: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=500', // Kesin çalışan sağlam grup resmi
    admins: ['Fatih', 'fatih']
};

function broadcastActiveUsers() {
    const users = Array.from(activeUsers.keys()).map(u => ({
        username: u,
        avatar: userProfiles.get(u) || ''
    }));
    io.emit('active_users', users);
}

mongoose.connect('mongodb+srv://fatih:fatih123@cluster0.shfpkht.mongodb.net/project-tr?retryWrites=true&w=majority')
    .then(async () => {
        console.log('MongoDB Atlas bağlantısı başarılı! 🟢');
        // Sunucu açıldığı an şu ana kadarki tüm eski/çöp mesajları temizle (İstediğin sıfırlama)
        try {
            await Message.deleteMany({ pinned: { $ne: true } });
            console.log('Şu ana kadarki eski/çöp mesajlar temizlendi, sadece sabitlenenler bırakıldı! 🧹');
        } catch(e) {}
    })
    .catch(err => console.error('MongoDB bağlantı hatası:', err));

app.use(express.static('public'));

io.on('connection', async (socket) => {
    console.log('Project TR hattına bağlandılar! 🚗');
    socket.emit('group_settings', groupSettings);

    socket.on('set-username', (data, callback) => {
        let username, avatar;
        if (typeof data === 'object') {
            username = data.username ? data.username.trim() : '';
            avatar = data.avatar || '';
        } else {
            username = data ? data.trim() : '';
            avatar = '';
        }

        if (!username) {
            return callback({ success: false, message: "Geçersiz isim kanka!" });
        }
        
        if (activeUsers.has(username)) {
            const oldSocketId = activeUsers.get(username);
            const oldSocket = io.sockets.sockets.get(oldSocketId);
            if (oldSocket) oldSocket.disconnect();
            activeUsers.delete(username);
        }

        for (let [user, sId] of activeUsers.entries()) {
            if (sId === socket.id) activeUsers.delete(user);
        }

        activeUsers.set(username, socket.id);
        if(avatar) userProfiles.set(username, avatar);
        socket.username = username;
        callback({ success: true });
        
        broadcastActiveUsers();
    });

    socket.on('update_avatar', (avatarUrl) => {
        if (socket.username) {
            userProfiles.set(socket.username, avatarUrl);
            broadcastActiveUsers();
        }
    });

    socket.on('change_group_icon', (newUrl) => {
        if (groupSettings.admins.includes(socket.username)) {
            groupSettings.icon = newUrl;
            io.emit('group_settings', groupSettings);
        }
    });

    // YENİ: ŞİFRE İLE YÖNETİCİ OLMA (Admin password: 1992)
    socket.on('claim_admin', (pin) => {
        if (pin === "1992" && socket.username) {
            if (!groupSettings.admins.includes(socket.username)) {
                groupSettings.admins.push(socket.username);
                io.emit('group_settings', groupSettings);
            }
        }
    });

    socket.on('make_admin', (targetUser) => {
        if (groupSettings.admins.includes(socket.username) && !groupSettings.admins.includes(targetUser)) {
            groupSettings.admins.push(targetUser);
            io.emit('group_settings', groupSettings);
        }
    });

    socket.on('toggle_pin', async (msgId) => {
        if (groupSettings.admins.includes(socket.username)) {
            try {
                const msg = await Message.findById(msgId);
                if (msg) {
                    msg.pinned = !msg.pinned;
                    await msg.save();
                    io.emit('pinned_updated', msg);
                }
            } catch (err) {
                console.error('Sabitleme hatası:', err);
            }
        }
    });

    try {
        const previousMessages = await Message.find().sort({ timestamp: 1 }).limit(100);
        socket.emit('init_messages', previousMessages);
    } catch (err) {
        console.error('Geçmiş mesajlar yüklenemedi:', err);
    }

    socket.on('chat message', async (data) => {
        try {
            const cleanUser = data.user ? data.user.trim() : '';
            const userAvatar = userProfiles.get(cleanUser) || '';
            const newMessage = new Message({
                user: cleanUser,
                text: data.text,
                avatar: userAvatar,
                pinned: false
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
            broadcastActiveUsers();
        }
    });
});

// 3 günden eski sabitlenmemiş mesajları temizleyen döngü
setInterval(async () => {
    try {
        const threeDaysAgo = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000));
        await Message.deleteMany({
            timestamp: { $lt: threeDaysAgo },
            pinned: { $ne: true }
        });
    } catch (err) {
        console.error('Otomatik temizleme hatası:', err);
    }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ayakta! Port: ${PORT}`);
});
