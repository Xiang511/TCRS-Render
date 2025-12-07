const mongoose = require('mongoose');

const pathoflegend = new mongoose.Schema({
    tag: { type: String, required: true },
    rank: { type: Number, required: true },
    eloRating: { type: String, required: true },
    season: { type: String, required: true },
});

const Pathoflegend = mongoose.model('Pathoflegend', pathoflegend);
module.exports = Pathoflegend;