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


const Geohash = require('latlon-geohash');





app.get('/home', (req, res) => {
  const hw = {message: 'Hello World, it worked'};
  res.send(hw)
});

app.get('/rides/:rideId', (req, res) => {
  var id = req.params.rideId;
  var rideRef = db.collection('rides').doc(id);
  rideRef.get().then(doc => {
    if (doc.exists) {
      const data = doc.data();
      return res.send(doc.data());
    } else {
      return console.log('No such document!');
    }
  })
  .catch(error => {
      return console.log('Error getting document:', error);
  });
});

app.get('/pickup_for_ride/:rideId', (req, res) => {
  var id = req.params.rideId;
  var rideRef = db.collection('pickup_for_ride').doc(id);
  rideRef.get().then(doc => {
    if (doc.exists) {
      const data = doc.data();
      return res.send(doc.data());
    } else {
      return console.log('No such document!');
    }
  })
  .catch(error => {
      return console.log('Error getting document:', error);
  });
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

// NOTIFICaTION
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

  db.collection('rides').doc(ride_id).set({  timestamp: admin.firestore.Timestamp.now() }, { merge: true });
  // console.log(ride_id);
  // const rideRef = db.collection('rides').doc(ride_id);
  // const driveRef = db.collection('drives');

  //INFO from ride document
  var pick_loc = ride_info.pickup_location;
  var drop_loc = ride_info.dropoff_location;
  var seats_needed = ride_info.seats_needed;
  var pickup_time = ride_info.pickup_time;
  var dropoff_time = ride_info.dropoff_time;

  //Variable needed for the pick_functions
  var lat_pick;
  var lng_pick;
  var geopoint_pick;
  var geohash_pick;

  //Variables needed for the drop_functions
  var lat_drop;
  var lng_drop;
  var geopoint_drop;
  var geohash_drop;

  // console.log(pick_loc);
  // console.log(drop_loc);

  //get geocode of pick_loc
  return googleMapsClient.geocode({address: pick_loc})
    .asPromise()
    //extract info for pickup_for_ride document
    .then((response) => {
      console.log("pickup_loc successfully retrieved");
      pick_loc = response.json.results[0].geometry.location;
      lat_pick = pick_loc.lat;
      lng_pick = pick_loc.lng;
      geohash_pick = Geohash.encode(lat_pick, lng_pick)
      geopoint_pick = new admin.firestore.GeoPoint(lat_pick, lng_pick)

      //get geocode for drop_loc
      return googleMapsClient.geocode({address: drop_loc})
        .asPromise()
      })
      //extract info for dropoff_for_ride document
      .then((response) => {
        console.log("dropoff_loc successfully retrieved");
        drop_loc = response.json.results[0].geometry.location;
        lat_drop = drop_loc.lat;
        lng_drop = drop_loc.lng;
        geohash_drop = Geohash.encode(lat_drop, lng_drop)
        geopoint_drop = new admin.firestore.GeoPoint(lat_drop, lng_drop)

        //create a pickup_for_ride document
        return db.collection("pickup_for_ride").add({
          d: {
            ride_id : ride_id,
            seats_needed : seats_needed,
            pickup_time : new admin.firestore.Timestamp(pickup_time._seconds, pickup_time._nanoseconds),
            time_created : admin.firestore.Timestamp.now()
          },
          l: geopoint_pick,
          g: geohash_pick
        })
      })
      //create a dropoff_for_ride document
      .then((docRef) => {
        console.log("pickup_document successfully written:", docRef.id);
        return db.collection("dropoff_for_ride").add({
          d: {
            ride_id : ride_id,
            seats_needed : seats_needed,
            pickup_time : new admin.firestore.Timestamp(dropoff_time._seconds, dropoff_time._nanoseconds),
            time_created : admin.firestore.Timestamp.now()
          },
          l: geopoint_drop,
          g: geohash_drop
        })
      })
      .then((docRef) => {
        return console.log("dropoff_document successfully written:", docRef.id);
      })
      .catch((error) => {
        return console.error("On create Ride functions failed: ", error);
      });
});

exports.onRideDropOffCreate = functions.firestore.document('dropoff_for_ride/{dropId}').onCreate( async (data, context) => {
  try {
    var drop_info = data.data();
    var drop_id = context.params.dropId;
    const geodrives = geofirestore.collection('dropoff_for_drive');
    const driveRef = db.collection('dropoff_for_drive');

    var nearby_drop_drive_list = new Array();
    var nearby_drives = new Array();
    var drives = new Array();
    var queries = new Array();

    var geopoint = new admin.firestore.GeoPoint(drop_info.l._latitude, drop_info.l._longitude);
    var query = geodrives.near({center: geopoint, radius: 20});

    //list of querysnapshot that match drop location
    var snapDrop = await query.get();
    console.log("snapDrop", snapDrop);

    snapDrop.forEach(drop => {
      nearby_drop_drive_list.push(drop.data());
    })

    //list of dropoff_for_drive documents that match drop location
    console.log("nearby_drop_drive_list:",nearby_drop_drive_list);

    // list of queries to get the pick documents
    for (i=0; i < nearby_drop_drive_list.length; i++){
          console.log("item", i, nearby_drop_drive_list[i]);
          queries.push(driveRef.where("d.drive_id", "==", nearby_drop_drive_list[i].drive_id));
        }
    console.log("queries:",queries);

    //list of querysnapshot of pickup_for_drive that match pick location among the ones that already matched the drop location
    var snapPick = await Promise.all(queries.map(query => query.get()));

    for (i=0; i < snapPick.length; i++){
      snapPick[i].forEach(doc => {
        nearby_drives.push(doc.data().d.drive_id);
      });
    }

    //list drive documents id that match drop and pick
    console.log("nearby_drives IDs:", nearby_drives);
    queries = [];
    for(i=0; i < nearby_drives.length; i++){
      queries.push(db.collection('drives').doc(nearby_drives[i]));
    }

    var snapDrive = await Promise.all(queries.map(query => query.get()));
    console.log("snapDrive", snapDrive);

    for (i=0; i < snapDrive.length; i++){
      var drive = snapDrive[i].data();
      console.log("drive",i,drive);
        drives.push(drive);
      }
    var snapRide = await db.collection('rides').doc(drop_info.d.ride_id).get();
    var ride = snapRide.data();

    var match = { ride : ride, drives : drives};

    console.log("match:", match);

    return db.collection("match").add(match);

  } catch (e) {
    return console.log("ca marche pas:", e);
  }


});
  // var drop_info = data.data();
  // var drop_id = context.params.dropId;
  // const geodrives = geofirestore.collection('dropoff_for_drive');
  // const driveRef = db.collection('dropoff_for_drive');
  //
  // var nearby_drop_drive_list = new Array();
  // var nearby_drives = new Array();
  //
  // var geopoint = new admin.firestore.GeoPoint(drop_info.l._latitude, drop_info.l._longitude);
  // var query = geodrives.near({center: geopoint, radius: 20});

//   return query.get().then( snap => {
//     snap.forEach( doc => {
//       nearby_drop_drive_list.push(doc.data());
//     });
//     console.log("nearby_drop_drive_list:",nearby_drop_drive_list);
//     return nearby_drop_drive_list;
//   })
//   .then( list =>  {
//     var queries = new Array();
//     for (i=0; i < list.length; i++){
//       console.log("item", i, list[i]);
//       queries.push(driveRef.where("d.drive_id", "==", list[i].drive_id));
//     }
//
//     console.log("queries:", queries);
//
//     return Promise.all(queries.map(query => query.get()))
//     .then( results => {
//       var result = results.docs;
//       console.log("result", result);
//
//       return result.forEach( doc => {
//         console.log("doc:", doc);
//         const data = doc.data();
//         console.log("data drives:", data);
//         nearby_drives.push(data);
//       });
//     })
//     .catch(error => {
//       return console.error(error);
//     });
//   }).then( truc => {
//     console.log("truc:", truc);
//       var drives = new Array();
//       queries = [];
//       for (i=0; i< nearby_drives.length; i++){
//       queries.push(db.collection('drives').doc(nearby_drives[i].d.drive_id));
//       }
//
//     return Promise.all(queries.map(query => query.get()))
//       .then(results => {
//         return results.forEach( result => {
//           drives.push(result.data());
//         });
//       })
//       .catch(error => {
//       return console.error(error);
//       });
//   })
//   .then(truc => {
//     return db.collection('rides').doc(drop_info.d.ride_id).get()
//   })
//   .then(doc => {
//     if (doc.exists) {
//     ride = doc.data();
//     var match = { ride : ride, drives : drives};
//     return console.log("Match", match);
//     } else {
//     return console.log("No such document!");
//       }
//   })
//   .catch( error => {
//     console.error("Failed to match", error);
//   });
// });



      //rideRef.set({  l: geopoint }, { merge: true });
      //console.log('collection drives', geodrives);
      //const query = geodrives.near({center : geopoint, radius :20});
      //console.log('query', query);

//       return query.get()
//       })
//       .then( (value) => {
//         var results = value.forEach( doc => {
//           console.log(doc.data());
//         });
//         return null;
//       })
//
//       //return geofire(driveRef, pick_loc, 35);
//       //var geopoint = new admin.firestore.GeoPoint(latitude, longitude);
//       //return rideRef.set({  pickup_geopoint: geopoint }, { merge: true });
//     .catch((error) => {
//       return console.error('Failed to get location :', error);
//     });
// });
