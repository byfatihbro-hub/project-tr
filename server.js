const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Public klasörünü dışarıya açıyoruz
app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('Project TR hattına bağlandılar 🚗');

    socket.on('chat message', (data) => {
        io.emit('chat message', data);
    });

    socket.on('disconnect', () => {
        console.log('Biri hattan düştü.');
    });
});

// Render'ın vereceği portu dinle, yoksa yerelde 3000 kullan
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ayakta! Port: ${PORT}`);
});
