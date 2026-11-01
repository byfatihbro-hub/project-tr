const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    type: { type: String, default: 'global' },
    icon: { type: String, default: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=500' },
    admins: { type: [String], default: ['Fatih', 'fatih','FAtih'] }
});

module.exports = mongoose.model('Settings', settingsSchema);
