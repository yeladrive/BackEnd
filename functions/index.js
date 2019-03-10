const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');

admin.initializeApp();
const app = express();
const db = admin.firestore()

app.get('/home', (req, res) => {
  const hw = {message: 'Hello World, it worked'};
  res.send(hw)
});

app.get('/users/:userId', (req, res) => {
  var id = req.params.userId;
  var docRef = db.collection('users').doc(id);
  docRef.get().then(doc => {
    if (doc.exists) {
      const data = doc.data()
      return res.send(doc.data());
    } else {
        return console.log('No such document!');
    }
  })
  .catch(error => {
      return console.log('Error getting document:', error);
  });
});

exports.app = functions.https.onRequest(app);

exports.onUserUpdate = functions.firestore.document('users/{userId}').onUpdate(change =>{
  const after = change.after.data();
  const payload = {
    data: {
      temp: String(after.temp),
      conditions: after.conditions
    }
  };
  return admin.messaging().send(payload)
  .then(response => {
    return console.log('Successfully sent notification: ', response);
  })
  .catch(error => {
    return console.error('Failed to send notification', error);
  });
})
