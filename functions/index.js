const functions = require('firebase-functions');
const admin = require('firebase-admin');


const { MAP_API_KEY } = require('./config.json');
//const geofire = require('./GeoFire.js');

var GeoFirestore = require('geofirestore').GeoFirestore;

const googleMapsClient = require('@google/maps').createClient({
  key: MAP_API_KEY,
  Promise: Promise
})

const express = require('express');
admin.initializeApp();
const app = express();
const db = admin.firestore()

const geofirestore = new GeoFirestore(db);
const geodrives= geofirestore.collection('drives');





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

exports.onUserCreate = functions.auth.user().onCreate(event => {
  console.log(event);
	const user = event.data;
  console.log(user);
	var userObject = {
		displayName : user.displayName,
		email : user.email,
	};
	db.ref('users/' + user.uid).set(userObject);
});


// exports.onRideCreate = functions.firestore.document('rides/{rideId}').onCreate(snap =>{
//   var ride = snap.data();
//   return db.collection('users').doc(ride.rider_id).get()
//     .then(user => {
//       var user_name = user.data().name;
//       var payload = {
//           notification:{
//             title : "Last minute ride",
//             body : user_name + " needs a last minute ride"
//           }
//         };
//         console.log(user);
//         console.log(user.data());
//         console.log(user_name);
//         console.log(payload);
//         return admin.messaging().sendToTopic("rides", payload)
//       })
//       .then(response => {
//         return console.log('Successfully sent notification: ', response);
//         })
//       .catch(error => {
//         return console.error('Failed to send notification', error);
//       });
//     });

exports.onRideCreate = functions.firestore.document('rides/{rideId}').onCreate( (data, context) =>{
  var ride_info = data.data();
  var ride_id = context.params.rideId;
  // console.log(ride_id);
  const rideRef = db.collection('rides').doc(ride_id);
  const driveRef = db.collection('drives');

  var pick_loc = ride_info.pickup_location;
  var drop_loc = ride_info.dropoff_location;
  // console.log(pick_loc);
  // console.log(drop_loc);

  return googleMapsClient.geocode({address: pick_loc})
    .asPromise()
    .then((response) => {
      pick_loc = response.json.results[0].geometry.location;

      var geopoint = new admin.firestore.GeoPoint(pick_loc.lat, pick_loc.lng)
      rideRef.set({  l: geopoint }, { merge: true });
      //console.log('collection drives', geodrives);

      const query = geodrives.near({center : geopoint, radius :20});
      //console.log('query', query);

      return query.get()
      })
      .then( (value) => {
        var results = value.forEach( doc => {
          console.log(doc.data());
        });
        return null;
      })

      //return geofire(driveRef, pick_loc, 35);
      //var geopoint = new admin.firestore.GeoPoint(latitude, longitude);
      //return rideRef.set({  pickup_geopoint: geopoint }, { merge: true });
    .catch((error) => {
      return console.error('Failed to get location :', error);
    });
});
