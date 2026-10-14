const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const Message = require('./models/Message');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// MongoDB Atlas Bağlantısı (Yeni fatih kullanıcısı ile güncellendi)
mongoose.connect('mongodb+srv://fatih:fatih123@cluster0.shfpkht.mongodb.net/project-tr?retryWrites=true&w=majority')
    .then(() => console.log('MongoDB Atlas bağlantısı başarılı! 🟢'))
    .catch(err => console.error('MongoDB bağlantı hatası:', err));

app.use(express.static('public'));

io.on('connection', async (socket) => {
    console.log('Project TR hattına bağlandılar! 🚗');

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
        console.log('Biri hattan düştü.');
    });
});

server.listen(3000, () => {
    console.log('Sunucu ayakta! http://localhost:3000');
});