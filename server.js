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

// İSTEDİĞİN EFSANE PROJECT TR LOGOSU GRUP İKONU OLARAK AYARLANDI!
let groupSettings = {
    icon: 'https://i.ibb.co/1G34639/1000092861.png', 
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
    .then(() => console.log('MongoDB Atlas bağlantısı başarılı! 🟢'))
    .catch(err => console.error('MongoDB bağlantı hatası:', err));

app.use(express.static('public'));

io.on('connection', async (socket) => {
    console.log('Project TR hattına bağlandılar! 🚗');
    socket.emit('group_settings', groupSettings);

    socket.on('set-username', (data, callback) => {
        let username, avatar;
        if (typeof data === 'object') {
            username = data.username;
            avatar = data.avatar || '';
        } else {
            username = data;
            avatar = '';
        }

        if (!username || username.trim() === '') {
            return callback({ success: false, message: "Geçersiz isim kanka!" });
        }
        
        const cleanUser = username.trim();
        
        if (activeUsers.has(cleanUser)) {
            const oldSocketId = activeUsers.get(cleanUser);
            const oldSocket = io.sockets.sockets.get(oldSocketId);
            if (oldSocket) {
                oldSocket.disconnect();
            }
            activeUsers.delete(cleanUser);
        }

        for (let [user, sId] of activeUsers.entries()) {
            if (sId === socket.id) {
                activeUsers.delete(user);
            }
        }

        activeUsers.set(cleanUser, socket.id);
        if(avatar) userProfiles.set(cleanUser, avatar);
        socket.username = cleanUser;
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
            const userAvatar = userProfiles.get(data.user) || '';
            const newMessage = new Message({
                user: data.user,
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
