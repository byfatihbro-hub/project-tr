const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('Project TR hattına bağlandılar! 🚗');

    socket.on('chat message', (data) => {
        io.emit('chat message', data);
    });

    socket.on('disconnect', () => {
        console.log('Biri hattan düştü.');
    });
});

server.listen(3000, () => {
    console.log('Sunucu ayakta! http://localhost:3000');
});
