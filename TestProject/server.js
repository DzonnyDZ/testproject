//Requires
var restify = require('restify');
var sql = require('mssql');
var jwt = require("jwt-simple");
var firebase = require("firebase");
var passport = require("passport");
var Bearer = require("passport-http-bearer");
var azure = require('azure-storage');
var guid = require("guid");
var fs = require("fs");

//Setup
var firebaseRef = new firebase("https://radiant-heat-2598.firebaseio.com/"); //Path to firebase
var blobSvc = azure.createBlobService("chorchojstorage", "+jvJAd+vYk/fPP7ivBZ3k2RpInTv//ANBrXOTFSt262kNrSK6dkBZ9Gj5UZUPO74ccmn//W3A0CyMSef9ToV6A=="); //Connection to Azure BLOB storage
var server = restify.createServer();

var config = { //MS SQL server setup
    server: "localhost", //Replace with server name (mssql npm package does not support named instances :-( )
    database: "STRV_test", //Replace with database name
    user: "xxx", //Replace with actual user name (this is not censored, I really use xxx :-) )
    password: "xxx" //Replace with actual password (this is not censored, I really use xxx :-) )
    //Integrated security is not supported by mssql npm package :-(
};
var secret = "wfdecerutejhsdgffg8754*/*/*:-)"; //Used to generate access tokens

//Handlers
function createAccount(req, res, next) {
    res.contentType = "json";
    var email = req.body.email;
    var password = req.body.password;
    //Validation
    if (!email || !password) {
        res.send(400, { type: "IncompleteData", message: "Email or password missing." });
    } else {
        var conn = new sql.Connection(config, function (err) { //Connect to SQL server
            if (err) {
                res.send(500, null);
                return;
            }
            var ps = new sql.PreparedStatement(conn);
            ps.input("email", sql.NVarChar(100));
            ps.prepare("SELECT COUNT(*) AS count FROM dbo.[User] WHERE Email = @email;", function (err) { //Verify if account already exists
                if (err) {
                    res.send(500, null);
                    return;
                }
                ps.execute({ email: email }, function (err, r) {
                    if (err) {
                        res.send(500, null);
                        return;
                    }
                    if (r[0].count > 0) res.send(400, { type: "EmailExists", message: "Specified e-mail address is already registered." }); //Do not create duplicate accounts
                    ps.unprepare();
                    ps = new sql.PreparedStatement(conn);
                    ps.input("email", sql.NVarChar(100));
                    ps.input("password", sql.NVarChar(100));
                    ps.prepare("INSERT INTO dbo.[User] (Email, [Password]) VALUES (@email, HASHBYTES('MD5', @password));", function (err) { //Create the account
                        if (err) {
                            res.send(500, null);
                            return;
                        }
                        ps.execute({ email: email, password: password }, function (err, r) {
                            if (err) {
                                res.send(500, null);
                                return;
                            }
                            ps.unprepare();
                            res.send(201);
                        });
                    });
                });
            });
        });
    }
    
    next();
}

function getAccessToken(req, res, next) {
    res.contentType = "json";
    var email = req.query.email;
    var password = req.query.password;
    var conn = new sql.Connection(config, function (err) {
        if (err) {
            res.send(500, null);
            return;
        }
        var ps = new sql.PreparedStatement(conn);
        ps.input("email", sql.NVarChar(100));
        ps.input("password", sql.NVarChar(100));
        ps.prepare("SELECT COUNT(*) AS count FROM dbo.[User] WHERE Email = @email AND password = HASHBYTES('MD5', @password);", function (err) { //Verify in DB
            if (err) {
                res.send(500, null);
                return;
            }
            ps.execute({ email: email, password: password }, function (err, r) {
                if (err) {
                    res.send(500, null);
                    return;
                }
                if (r[0].count == 1) {
                    res.send(200, { access_token: jwt.encode(email, secret) }); //Generate access token
                } else {
                    res.setHeader("WWW-Authenticate", 'Bearer realm="Users"');
                    res.send(401, { type: "InvalidEmailPassword", message: "Specified e-mail / password combination is not valid." });
                }
            });
        });
    });
    next();
}

function createContact(req, res, next) {
    res.contentType = "json";
    var firstName = req.body.firstName;
    var lastName = req.body.lastName;
    var phone = req.body.phone;
    if (!firstName || !lastName || !phone) { //Validation
        res.send(400, { type: "IncompleteData", message: "First name, last name or phone number missing." });
    } else {
        var pushed = firebaseRef.push({ firstName: firstName, lastName: lastName, phone: phone }, function (err, a1, a2) { //Save to FireBase (push() generates unique ID)
            if (err) {
                res.send(500, null);
            } else {
                res.send(201, { id: pushed.name() }); //Return unique ID to client - it may be useful for him
            }
        });
    }
    next();
}

//Helper function to delete uploaded files
function _removeFiles(files) {
    for (var i = 0; i < files.length ; i++) {
        fs.unlink(files[i].path);
    }
}

function uploadPhoto(req, res, next) {
    res.contentType = "json";
    var contactId = req.query.contactId;
    //Gather all files uploaded (well, we expect only one, but clients can be creative)
    var files = new Array();
    for (var i in req.files)
        files.push(req.files[i]);
    if (!contactId) { //Validation
        res.send(400, { type: "IncompleteData", message: "Contact id missing." });
        _removeFiles(files);
    } else {
        if (files.length < 1) { //No file
            res.send(400, { type: "IncompleteData", message: "File not uploaded." });
        } else if (files.lenght > 1) { //More zhan one files
            res.send(400, { type: "InvalidData", message: "Too many files" });
            _removeFiles(files);
        } else {
            firebaseRef.child(contactId).on("value", function (snapshot) { //Verify that contact exists in FireBase
                if (snapshot.exists()) {
                    blobSvc.createContainerIfNotExists('container', { publicAccessLevel: "blob" }, function (error, result, response) { //Ensure Azure BLOB storage container (name "container")
                        if (error) {
                            res.send(500, null);
                        } else {
                            blobSvc.createBlockBlobFromLocalFile("container", contactId, files[0].path, function (error, result, response) { //Save the image to Azure BLOB storage
                                _removeFiles(files);
                                if (error)
                                    res.send(500, null);
                                else
                                    res.send(201, null);
                            });
                        }
                    });
                } else {
                    _removeFiles(files);
                    res.send(404, { type: "NonexistentContact", message: "Contact id '" + contactId + "' does not exist" });
                }
            });
        }
    }
    next();
}

//Web app config
passport.use(new Bearer(
    function (token, done) {
        var email;
        try {
            email = jwt.decode(token, secret, false);
        } catch (ex) {
            return done(null, false);
        }
        return done(null, { email: email }, { scope: "all" });
    }
));

server.use(restify.acceptParser(server.acceptable));
server.use(restify.jsonp());
server.use(restify.bodyParser({ mapParams: false }));
server.post('/accounts', createAccount);
server.get('/access_token', getAccessToken);
server.post("/contacts", passport.authenticate("bearer", { session: false }), createContact);
server.post("/photos", passport.authenticate("bearer", { session: false }), uploadPhoto);

server.listen(8080, function () {
    console.log('%s listening at %s', server.name, server.url);
});