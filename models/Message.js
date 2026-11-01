const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    user: { type: String, required: true },
    text: { type: String, default: '' },
    avatar: { type: String, default: '' },
    pinned: { type: Boolean, default: false },
    roomId: { type: String, default: 'global' }, // Kanal, DM veya Grup kimliği
    replyTo: { type: Object, default: null },     // Yanıtlanan mesaj
    audioBase64: { type: String, default: null }, // Sesli mesaj verisi
    isBattle: { type: Boolean, default: false },  // Yarış teklifi bayrağı
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);
