const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    user: { type: String, required: true },
    text: { type: String, default: '' }, // Sesli mesaj atıldığında text boş kalabileceği için required kaldırıldı
    avatar: { type: String, default: '' },
    pinned: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now },
    
    // 🏎️ YENİ EKLENEN SİSTEM ALANLARI
    roomId: { type: String, default: 'global' }, // Kanal, DM veya Grup kimliği
    replyTo: { type: Object, default: null },     // Yanıtlanan mesaj verisi
    audioBase64: { type: String, default: null }, // Sesli mesaj verisi
    isBattle: { type: Boolean, default: false }   // Initial D yarış teklifi bayrağı
});

module.exports = mongoose.model('Message', messageSchema);
