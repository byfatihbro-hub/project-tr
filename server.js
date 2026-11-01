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

let groupSettings = { icon: '', admins: [] };

// 🟢 VERİTABANI TABANLI AKTİF KULLANICI ŞEMASI (Puanlar ve Koleksiyon eklendi!)
const userSessionSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    avatar: { type: String, default: '' },
    socketId: { type: String, required: true },
    points: { type: Number, default: 100 }, // Başlangıç hediyesi minik puan
    inventory: { type: Array, default: [] }, // Koleksiyona düşen arabalar
    lastSeen: { type: Date, default: Date.now }
});
const UserSession = mongoose.models.UserSession || mongoose.model('UserSession', userSessionSchema);

async function broadcastActiveUsers() {
    try {
        const activeSessions = await UserSession.find({});
        const users = activeSessions.map(u => ({
            username: u.username,
            avatar: u.avatar || '',
            points: u.points || 0
        }));
        io.emit('active_users', users);
    } catch (err) {
        console.error('Aktif kullanıcılar çekilemedi:', err);
    }
}

async function broadcastGroups() {
    const groups = await Group.find().sort({ timestamp: 1 });
    io.emit('update_groups', groups);
}

mongoose.connect('mongodb+srv://fatih:fatih123@cluster0.shfpkht.mongodb.net/project-tr?retryWrites=true&w=majority')
    .then(async () => {
        console.log('MongoDB Atlas bağlantısı başarılı! 🟢');
        
        await UserSession.updateMany({}, { socketId: 'disconnected' });

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
    broadcastActiveUsers();

    socket.join('global');
    socket.currentRoom = 'global';

    socket.on('set-username', async (data, callback) => {
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
        
        try {
            let user = await UserSession.findOne({ username: username });
            if (!user) {
                user = new UserSession({
                    username: username,
                    socketId: socket.id,
                    avatar: avatar || '',
                    points: 150, // Yeni kullanıcılara başlangıç puanı
                    inventory: ['AE86 Trueno (Başlangıç)']
                });
                await user.save();
            } else {
                user.socketId = socket.id;
                if (avatar) user.avatar = avatar;
                await user.save();
            }

            socket.username = username;
            callback({ success: true, points: user.points, inventory: user.inventory });
            broadcastActiveUsers();
        } catch (err) {
            console.error('Kullanıcı kaydedilemedi:', err);
            callback({ success: false, message: "Kayıt hatası!" });
        }
    });

    // 🎁 KUTU AÇMA VE ARAÇ DÜŞÜRME SİSTEMİ
    socket.on('open_box', async (cost, callback) => {
        if (!socket.username) return;
        try {
            let user = await UserSession.findOne({ username: socket.username });
            if (!user || user.points < cost) {
                return callback({ success: false, message: "Yetersiz puan kanka!" });
            }

            user.points -= cost;

            // Çıkabilecek efsane JDM / Koleksiyon arabaları
            const possibleCars = [
                { name: 'Nissan Skyline GT-R R34 V-Spec', rarity: 'Efsanevi 🌟' },
                { name: 'Mazda RX-7 FD3S (Spirit R)', rarity: 'Nadir 🔥' },
                { name: 'Toyota Supra MK4 (2JZ)', rarity: 'Efsanevi 🌟' },
                { name: 'Honda Civic EG6 SiR', rarity: 'Klasik ⚡' },
                { name: 'Mitsubishi Lancer Evolution IX', rarity: 'Nadir 🔥' },
                { name: 'Renault Toros SW (Project TR Special)', rarity: 'Özel Kasa 😎' }
            ];

            const wonCar = possibleCars[Math.floor(Math.random() * possibleCars.length)];
            user.inventory.push(wonCar.name);
            await user.save();

            callback({ 
                success: true, 
                remainingPoints: user.points, 
                wonCar: wonCar 
            });
            broadcastActiveUsers();
        } catch (err) {
            console.error('Kutu açma hatası:', err);
            callback({ success: false, message: "Sunucu hatası!" });
        }
    });

    // 🎮 MİNİ OYUN PUAN KAZANMA
    socket.on('add_points', async (earnedPoints) => {
        if (!socket.username) return;
        try {
            let user = await UserSession.findOne({ username: socket.username });
            if (user) {
                user.points += earnedPoints;
                await user.save();
                broadcastActiveUsers();
            }
        } catch (err) {
            console.error('Puan eklenemedi:', err);
        }
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

    socket.on('update_avatar', async (avatarUrl) => {
        if (socket.username) {
            try {
                await UserSession.updateOne({ username: socket.username }, { avatar: avatarUrl });
                broadcastActiveUsers();
            } catch (err) {
                console.error('Avatar güncellenemedi:', err);
            }
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
            const userSession = await UserSession.findOne({ username: cleanUser });
            const userAvatar = userSession ? userSession.avatar : '';
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

    socket.on('disconnect', async () => {
        if (socket.username) {
            await UserSession.updateOne({ username: socket.username }, { socketId: 'offline' });
            broadcastActiveUsers();
        }
    });
});

setInterval(async () => {
    try {
        const fourDaysAgo = new Date(Date.now() - (4 * 24 * 60 * 60 * 1000));
        const result = await Message.deleteMany({ timestamp: { $lt: fourDaysAgo }, pinned: false });
        if (result.deletedCount > 0) {
            console.log(`Otomatik Temizlik: ${result.deletedCount} adet eski mesaj silindi! 🧹`);
        }
    } catch (err) {
        console.error('Otomatik temizleme hatası:', err);
    }
}, 60 * 60 * 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ayakta! Port: ${PORT}`);
});
