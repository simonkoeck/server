/////////////////////////////////////////////////////////////////
//                          IMPORT                            //
/////////////////////////////////////////////////////////////////

const io = require('socket.io')(5556);
const bodyparser = require("body-parser");
var mysql = require('mysql');
require('dotenv').config()
const express = require('express')
const app = express();
app.use(bodyparser.json());
app.use(express.static('website'));

/////////////////////////////////////////////////////////////////
//                          VARIABLES                          //
////////////////////////////////////////////////////////////////


var id; // Var to access socket id
var db; // Var for db
var logs = true; // Enable/Disable logs

const latestIOS = "1.0.0";
const latestAndroid = "1.0.0";

/////////////////////////////////////////////////////////////////
//                          SOCKETS                            //
/////////////////////////////////////////////////////////////////

var con = mysql.createConnection({ // assign con + create
  host: process.env.db_host, //Get hostname of .env
  user: process.env.db_user, //Get user of .env
  password: process.env.db_password, //Get password of .env
  database: process.env.db_database, // Get database of .env
  // insecureAuth : true
});

con.connect(function (err) { // On database connect
  if (err) throw err; // Throw error
});

io.on('connect', socket => { //On any socket connection

  id = socket.id; // Save socket.id as id

  socket.on('reqCode', (data) => { // On code request
    requestCode(socket); //  Call request function
  });

  socket.on('online', (data) => { // On (PC) connect
    connect(data); // Call connect function
  });

  socket.on('offline', (data) => { // On (PC) disconnect (Called on window close)
    disconnect(data); //Call disconnect function
  });

  socket.on('delete', (data) => { // On (PC) disconnect (Called on window close)
    deleteCode(data); //Call disconnect function
    
  });
});

/////////////////////////////////////////////////////////////////
//                          EXPRESS                            //
/////////////////////////////////////////////////////////////////

//Version Get's

app.get('/api/version/:version', function (req, res) { // On req
  getVersion(req.params.version, res);
});

// Bugs

app.post('/api/bug', function (req, res) { // On req
  saveBug(req, res); // Call create function
});

//Others

app.get('/api/req', function (req, res) { // On req
  createId(res); // Call create function
});

app.get('/api/check/:code', function (req, res) { //On check (Get) request
  checkCode(req.params.code, res); // Call check function
})

app.post('/api/cmd', function (req, res) { //On command
  cmd(req.body.code, req.body.id, req.body.device, req.body.cmd, res); // Call cmd function
});

app.listen(6000) //Listen port (nginx PORT FORWARD here)

/////////////////////////////////////////////////////////////////
//                         FUNCTION                            //
/////////////////////////////////////////////////////////////////

function print(text) { // Just print
  if (logs) {
    console.log(text) // Log input
  }
}

function generateCode(length) { //generate Codes
  var result = ''; // Final string
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; //Character Pool
  for (var i = 0; i < length; i++) {//For length
    result += characters.charAt(Math.floor(Math.random() * characters.length)); //Get Random character of pool
  }
  return result; //Return code
}

/////////////////////////////////////////////////////////////////
//                       SOCKET FUNCTIONS                      //
/////////////////////////////////////////////////////////////////

function connect(data) { //On socket(PC) connection
  print(data + " connected!"); //Print status

  con.query("SELECT * FROM users WHERE code = ?", data, function (err, row) { //Search database for code
    if (row[0] != undefined) { //Code is availiable
      con.query("UPDATE users SET status = ? WHERE code = ?", [1, data]); //Update status
      print("Updatet " + data + "!") //Print status
    } else { //Code is undefined (DB Reset, ...)
      con.query('INSERT INTO users(code, status) VALUES (?, ?)', [data, 1]); //Safe code
      print("Inserted " + data + "!") //Print status
    }
  });
}

function disconnect(data) { //On socket (PC) disconnected
  print(data + " disconnected!"); //Print status

  con.query("SELECT * FROM users WHERE code = ?", data, function (err, row) { //Search database for row
    if (row != undefined) { //Code is availible
      con.query("UPDATE users SET status = ? WHERE code = ?", [0, data]); //Safe code
    }
  });
}

function deleteCode(data) { //On socket (PC) disconnected
  print(data + " deleted!"); //Print status

  con.query("SELECT * FROM users WHERE code = ?", data, function (err, row) { //Search database for row
    if (row != undefined) { //Code is availible
      con.query("DELETE FROM users WHERE code = ?", [data]); //Safe code
    }
  });
}


async function requestCode(socket) { //Request for unique(!) code.

  var gotCode = false; // Reseting condition

  while (gotCode == false) { // While not found
    var newCode = generateCode(5);  //Creating new (NOT unique) code.
    await new Promise(resolve => con.query("SELECT * FROM users WHERE code = ?", newCode, function (err, row) { // Async await for database
      if (row[0] == undefined) { // Found unused code
        con.query('INSERT INTO users(code, status) VALUES (?, ?)', [newCode, 1]); //Safe code
        socket.emit("getCode", newCode); //Send to Pc
        print(newCode + " is unique. Success!")  //Print status
        gotCode = true; // Setting condition (Stop Loop)
      } else { // Already used
        print(newCode + " is already in use!") // Print status
        resolve() // Restart loop
      }
    }));
  }
}


/////////////////////////////////////////////////////////////////
//                    EXPRESS FUNCTIONS                        //
/////////////////////////////////////////////////////////////////

function saveBug(req, res) { //Creating a ID (To block users)!
  con.query('INSERT INTO bugs(bug) VALUES (?)', [req.body.bug]);
  res.status(200);
}


function createId(res) { //Creating a ID (To block users)!
  var newCode = generateCode(16) // Generating (NOT unique / But Long) Code.
  res.status(200).json({ "id": newCode }); //Send the new Code as json
}

function getVersion(version, res) {

  if (version == "android") {
    res.status(200).json({ "version": latestAndroid, "success": true })
  } else if (version == "ios") {
    res.status(200).json({ "version": latestIOS, "success": true })
  } else {
    res.status(200).json({ "error": "Unknowen parameter " + version, "success": false })
  }
}

function checkCode(code, res) { //Got code to check

  con.query("SELECT * FROM users WHERE code = ?", code, function (err, row) { //Search db for code
    if (row[0] != undefined) { //Code is used
      if (row[0].status == 1) { // Is online
        res.status(200).json({ success: true }) //Status code + success
        print(code + " is O.k!"); //Print status
      } else {  // Is offline
        res.status(200).json({ success: false, error: "Offline" }) //Status code + error
        print(code + " is currently Offline!"); //Print status
      }
    } else { //Unknowen code
      res.status(200).json({ success: false, error: "Unknowen code!" }) //Status code + error
      print(code + " is unknowen!"); //Print status
    }
  });
}

function cmd(code, _id, _device, _cmd, res) { //Got Command

  print(_id + " (" + _device + ")" + " sent " + _cmd + " to " + code); //Print
  io.sockets.emit(code, { cmd: _cmd, id: _id, device: _device }); // Send command to Channel (code)
  res.status(200).json({ success: true }); // Status code + success

}
