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
    console.log("drop_info", drop_info);
    var drop_id = context.params.dropId;
    var geodrop = geofirestore.collection('dropoff_for_drive');
    var geopick =  geofirestore.collection('pickup_for_drive');
    var rideRef = db.collection('dropoff_for_ride');
    var driveRef = db.collection('dropoff_for_drive');

    var nearby_drop_drive_list = new Array();
    var nearby_pick_drive_list = new Array();
    var nearby_drives = new Array();
    var drives = new Array();
    var queries = new Array();

    //list of querysnapshot that match drop location
    var geopoint = new admin.firestore.GeoPoint(drop_info.l._latitude, drop_info.l._longitude);
    var query = geodrop.near({center: geopoint, radius: 20});
    var snapDrop = await query.get();
    console.log("snapDrop", snapDrop);
    snapDrop.forEach(drop => {
      nearby_drop_drive_list.push(drop.data());
    })
    //list of dropoff_for_drive documents that match drop location
    console.log("nearby_drop_drive_list:",nearby_drop_drive_list);

    //get the corresponding pickup document of the drop document created
    var rideId = drop_info.d.ride_id;
    console.log("ride Id", rideId);
    var pickupSnap = await db.collection('pickup_for_ride').where("d.ride_id","==", rideId).get();
    console.log("pickupsnap", pickupSnap);
    var pickupDoc;
    pickupSnap.forEach(doc => {
    pickupDoc = doc.data();
    })
    console.log("pickupDoc", pickupDoc);

    //list of querynsapshot that match pick location
    geopoint = new admin.firestore.GeoPoint(pickupDoc.l._latitude, pickupDoc.l._longitude);
    query = geopick.near({center: geopoint, radius: 20});
    var snapPick = await query.get();
    console.log("snapPick", snapPick);
    snapPick.forEach(pick => {
      nearby_pick_drive_list.push(pick.data());
    })
    //list of pickup_for_drive documents that match pickup location
    console.log("nearby_pick_drive_list:",nearby_pick_drive_list);

    //create the list of drives that match both drop and pick
    for (let drop of nearby_drop_drive_list){
      for (let pick of nearby_pick_drive_list){
        if (drop.drive_id === pick.drive_id){
          nearby_drives.push(drop.drive_id);
        }
      }
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
      var drive = {drive_id: snapDrive[i].id, drive_data : snapDrive[i].data()};
      console.log("drive",i,drive);
        drives.push(drive);
      }
    var snapRide = await db.collection('rides').doc(drop_info.d.ride_id).get();
    var ride = {ride_id : rideId, ride_data: snapRide.data()};

    if (drives.length > 0){
      var match = { ride : ride, drive : drives};
      console.log("match:", match);
      return db.collection("match").add(match);
    } else {
      return console.log("no match found");
    }


  } catch (e) {
    return console.log("ca marche pas:", e);
  }

});

exports.onDriveCreate = functions.firestore.document('drives/{driveId}').onCreate( (data, context) =>{
  var drive_info = data.data();
  var drive_id = context.params.driveId;

  db.collection('drives').doc(drive_id).set({  timestamp: admin.firestore.Timestamp.now() }, { merge: true });

  //INFO from ride document
  var pick_loc = drive_info.pickup_location;
  var drop_loc = drive_info.dropoff_location;
  var seats_available = drive_info.seats_available;
  var pickup_time = drive_info.pickup_time;
  var dropoff_time = drive_info.dropoff_time;

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
        return db.collection("pickup_for_drive").add({
          d: {
            drive_id : drive_id,
            seats_available : seats_available,
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
        return db.collection("dropoff_for_drive").add({
          d: {
            drive_id : drive_id,
            seats_available : seats_available,
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
        return console.error("On create Drive functions failed: ", error);
      });
});

exports.onDriveDropOffCreate = functions.firestore.document('dropoff_for_drive/{dropId}').onCreate( async (data, context) => {
  try {
    var drop_info = data.data();
    console.log("drop_info", drop_info);
    var drop_id = context.params.dropId;
    var geodrop = geofirestore.collection('dropoff_for_ride');
    var geopick = geofirestore.collection('pickup_for_ride');
    const rideRef = db.collection('dropoff_for_ride');

    var nearby_drop_ride_list = new Array();
    var nearby_pick_ride_list = new Array();
    var nearby_rides = new Array();
    var rides = new Array();
    var drive = new Array();
    var queries = new Array();

    //list of querysnapshot that match drop location
    var geopoint = new admin.firestore.GeoPoint(drop_info.l._latitude, drop_info.l._longitude);
    var query = geodrop.near({center: geopoint, radius: 20});
    var snapDrop = await query.get();
    console.log("snapDrop", snapDrop);
    snapDrop.forEach(drop => {
      nearby_drop_ride_list.push(drop.data());
    })
    //list of dropoff_for_drive documents that match drop location
    console.log("nearby_drop_ride_list:",nearby_drop_ride_list);

    //get the corresponding pickup document of the drop document created
    var driveId = drop_info.d.drive_id;
    console.log("drive Id", driveId);
    var pickupSnap = await db.collection('pickup_for_drive').where("d.drive_id", "==", driveId).get();
    console.log("pickupSnap", pickupSnap);
    var pickupDoc;
    pickupSnap.forEach(doc => {
    pickupDoc = doc.data();
    })
    console.log("pickupDoc", pickupDoc);

    //list of querysnapshot that match pick location
    geopoint = new admin.firestore.GeoPoint(pickupDoc.l._latitude, pickupDoc.l._longitude);
    query = geopick.near({center: geopoint, radius: 20});
    var snapPick = await query.get();
    console.log("snapPick", snapPick);
    snapPick.forEach(pick => {
      nearby_pick_ride_list.push(pick.data());
    })
    //list of pickup_for_drive documents that match pickup location
    console.log("nearby_pick_drive_list:",nearby_pick_ride_list);

    //create the list of drives that match both drop and pick
    for (let drop of nearby_drop_ride_list){
      for (let pick of nearby_pick_ride_list){
        if (drop.ride_id === pick.ride_id){
          nearby_rides.push(drop.ride_id);
        }
      }
    }

    //list drive documents id that match drop and pick
    console.log("nearby_rides IDs:", nearby_rides);
    queries = [];
    for(i=0; i < nearby_rides.length; i++){
      queries.push(db.collection('rides').doc(nearby_rides[i]));
    }

    var snapRide = await Promise.all(queries.map(query => query.get()));
    console.log("snapRide", snapRide);

    for (i=0; i < snapRide.length; i++){
      var ride = { ride_id: snapRide[i].id, ride_data: snapRide[i].data()};
      console.log("ride",i,ride);
        rides.push(ride);
      }
    var snapDrive = await db.collection('drives').doc(drop_info.d.drive_id).get();
    drive.push({ drive_id: driveId, drive_data: snapDrive.data()});

    console.log("drive", drive);
    console.log("rides", rides);

    if (rides.length > 0){
      var results = [];
      for (let ride of rides){
        results.push(db.collection('match').where("ride.ride_id", "==", ride.ride_id).get());
      }
      var snapMatch = await Promise.all(results);

      console.log("snapMatch", snapMatch);

      var updates =[];
      var creates =[];

      for (let snap of snapMatch) {
        console.log("snapMatch empty ?", snap.empty);
        if (snap.empty === false){
          var matchedRide = snap.docs;
          console.log("matchedRide", matchedRide);
          console.log("match to update", matchedRide[0]);
          updates.push(db.collection('match').doc(matchedRide[0].id).update({
            drive: admin.firestore.FieldValue.arrayUnion(drive[0])
          }));
          console.log("update");
        } else {
          var match = { drive: drive, ride: ride};
          console.log("match to create:", match);
          console.log("create");
          creates.push(db.collection("match").add(match));
        }
      }

       var matchUpdated = await Promise.all(updates);
       var matchCreated = await Promise.all(creates);

       return("match updated", matchUpdated, "\n match created", matchCreated);
      // console.log("snapMatch empty ?", snapMatch[0].empty);
      // console.log("snapMatch size ?", snapMatch[0].size);
      // console.log("snapMatch docs:", snapMatch.docs);



    } else {
      return console.log("no match found");
    }

  } catch (e) {
    return console.log("ca marche pas:", e);
  }

});
