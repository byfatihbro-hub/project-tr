const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    user: { type: String, required: true },
    text: { type: String, required: true },
    avatar: { type: String, default: '' },
    pinned: { type: Boolean, default: false }, // Sabitleme özelliği için eklendi
    timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', messageSchema);
