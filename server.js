const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

// Modülleri ayrı klasörden çekiyoruz
const Message = require('./models/Message');
const Group = require('./models/Group');
const Settings = require('./models/Settings');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const activeUsers = new Map();
const userProfiles = new Map();

let groupSettings = { icon: '', admins: [] };

function broadcastActiveUsers() {
    const users = Array.from(activeUsers.keys()).map(u => ({
        username: u,
        avatar: userProfiles.get(u) || ''
    }));
    io.emit('active_users', users);
}

async function broadcastGroups() {
    const groups = await Group.find().sort({ timestamp: 1 });
    io.emit('update_groups', groups);
}

mongoose.connect('mongodb+srv://fatih:fatih123@cluster0.shfpkht.mongodb.net/project-tr?retryWrites=true&w=majority')
    .then(async () => {
        console.log('MongoDB Atlas bağlantısı başarılı! 🟢');
        
        let dbSettings = await Settings.findOne({ type: 'global' });
        if (!dbSettings) {
            dbSettings = new Settings({ type: 'global' });
            await dbSettings.save();
        }
        groupSettings.icon = dbSettings.icon;
        groupSettings.admins = dbSettings.admins;

    }).catch(err => console.error('MongoDB bağlantı hatası:', err));

app.use(express.static('public'));

io.on('connection', async (socket) => {
    console.log('Project TR hattına bağlandılar! 🚗');
    
    socket.emit('group_settings', groupSettings);
    broadcastGroups();

    socket.join('global');
    socket.currentRoom = 'global';

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

    socket.on('switch_room', async (newRoomId) => {
        if (socket.currentRoom) {
            socket.leave(socket.currentRoom);
        }
        socket.join(newRoomId);
        socket.currentRoom = newRoomId;

        try {
            const roomMessages = await Message.find({ roomId: newRoomId }).sort({ timestamp: 1 }).limit(100);
            socket.emit('room_history', roomMessages);
        } catch (err) {
            console.error('Oda geçmişi çekilemedi:', err);
        }
    });

    socket.on('create_group', async (groupName) => {
        if (!groupName || groupName.trim() === '') return;
        const gId = 'group-' + Date.now();
        try {
            const newGroup = new Group({ roomId: gId, name: groupName.trim() });
            await newGroup.save();
            broadcastGroups();
        } catch (err) {
            console.error('Grup oluşturulamadı:', err);
        }
    });

    socket.on('delete_group', async (roomId) => {
        if (groupSettings.admins.includes(socket.username)) {
            try {
                await Group.deleteOne({ roomId: roomId });
                await Message.deleteMany({ roomId: roomId }); 
                broadcastGroups();
                io.to(roomId).emit('group_deleted', 'global'); 
            } catch (err) {
                console.error('Grup silinemedi:', err);
            }
        }
    });

    socket.on('update_avatar', (avatarUrl) => {
        if (socket.username) {
            userProfiles.set(socket.username, avatarUrl);
            broadcastActiveUsers();
        }
    });

    socket.on('change_group_icon', async (newUrl) => {
        if (groupSettings.admins.includes(socket.username)) {
            groupSettings.icon = newUrl;
            await Settings.updateOne({ type: 'global' }, { icon: newUrl });
            io.emit('group_settings', groupSettings);
        }
    });

    socket.on('claim_admin', async (pin) => {
        if (pin === "1992" && socket.username) {
            if (!groupSettings.admins.includes(socket.username)) {
                groupSettings.admins.push(socket.username);
                await Settings.updateOne({ type: 'global' }, { admins: groupSettings.admins });
                io.emit('group_settings', groupSettings);
            }
        }
    });

    socket.on('make_admin', async (targetUser) => {
        if (groupSettings.admins.includes(socket.username) && !groupSettings.admins.includes(targetUser)) {
            groupSettings.admins.push(targetUser);
            await Settings.updateOne({ type: 'global' }, { admins: groupSettings.admins });
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
                    io.to(msg.roomId).emit('pinned_updated', msg);
                }
            } catch (err) {
                console.error('Sabitleme hatası:', err);
            }
        }
    });

    // 🗑️ MESAJ SİLME (Sadece Yöneticiler)
    socket.on('delete_message', async (msgId) => {
        if (groupSettings.admins.includes(socket.username)) {
            try {
                const msg = await Message.findById(msgId);
                if (msg) {
                    const targetRoom = msg.roomId;
                    await Message.deleteOne({ _id: msgId });
                    io.to(targetRoom).emit('message_deleted', msgId);
                }
            } catch (err) {
                console.error('Mesaj silinemedi:', err);
            }
        }
    });

    socket.on('chat message', async (data) => {
        try {
            const cleanUser = data.user ? data.user.trim() : '';
            const userAvatar = userProfiles.get(cleanUser) || '';
            const targetRoom = data.roomId || socket.currentRoom || 'global';

            const newMessage = new Message({
                user: cleanUser,
                text: data.text,
                avatar: userAvatar,
                replyTo: data.replyTo || null,
                audioBase64: data.audioBase64 || null,
                isBattle: data.isBattle || false,
                roomId: targetRoom, 
                pinned: false
            });
            await newMessage.save();

            io.to(targetRoom).emit('chat message', newMessage);
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
        const fourDaysAgo = new Date(Date.now() - (4 * 24 * 60 * 60 * 1000));
        const result = await Message.deleteMany({ timestamp: { $lt: fourDaysAgo }, pinned: false });
        if (result.deletedCount > 0) {
            console.log(`Otomatik Temizlik: ${result.deletedCount} adet 4 günlük eski mesaj silindi! 🧹`);
        }
    } catch (err) {
        console.error('Otomatik temizleme hatası:', err);
    }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ayakta! Port: ${PORT}`);
});
