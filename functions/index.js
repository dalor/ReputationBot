const functions = require('firebase-functions');

const ReputationBot = require('./ReputationBot');

exports.reputbot = functions.https.onRequest(ReputationBot);