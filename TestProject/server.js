var restify = require('restify');
var sql = require('mssql');
var jwt = require("jwt-simple");
var firebase = require("firebase");
var passport = require("passport");
var Bearer = require("passport-http-bearer");
var azure = require('azure-storage');
var guid = require("guid");
var fs = require("fs");

var firebaseRef = new firebase("https://radiant-heat-2598.firebaseio.com/");
var blobSvc = azure.createBlobService("chorchojstorage", "+jvJAd+vYk/fPP7ivBZ3k2RpInTv//ANBrXOTFSt262kNrSK6dkBZ9Gj5UZUPO74ccmn//W3A0CyMSef9ToV6A==");

var config = {
    server: "localhost",
    database: "STRV_test",
    user: "xxx",
    password: "xxx"
};
var secret = "wfdecerutejhsdgffg8754*/*/*:-)";

var server = restify.createServer();

function createAccount(req, res, next) {
    res.contentType = "json";
    var email = req.body.email;
    var password = req.body.password;
    if (!email || !password) {
        res.send(400, { type: "IncompleteData", message: "Email or password missing." });
    } else {
        var conn = new sql.Connection(config, function (err) {
            if (err) {
                res.send(500, null);
                return;
            }
            var ps = new sql.PreparedStatement(conn);
            ps.input("email", sql.NVarChar(100));
            ps.prepare("SELECT COUNT(*) AS count FROM dbo.[User] WHERE Email = @email;", function (err) {
                if (err) {
                    res.send(500, null);
                    return;
                }
                ps.execute({ email: email }, function (err, r) {
                    if (err) {
                        res.send(500, null);
                        return;
                    }
                    if (r[0].count > 0) res.send(400, { type: "EmailExists", message: "Specified e-mail address is already registered." });
                    ps.unprepare();
                    ps = new sql.PreparedStatement(conn);
                    ps.input("email", sql.NVarChar(100));
                    ps.input("password", sql.NVarChar(100));
                    ps.prepare("INSERT INTO dbo.[User] (Email, [Password]) VALUES (@email, HASHBYTES('MD5', @password));", function (err) {
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
        ps.prepare("SELECT COUNT(*) AS count FROM dbo.[User] WHERE Email = @email AND password = HASHBYTES('MD5', @password);", function (err) {
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
                    res.send(200, { access_token: jwt.encode(email, secret) });
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
    if (!firstName || !lastName || !phone) {
        res.send(400, { type: "IncompleteData", message: "First name, last name or phone number missing." });
    } else {
        var id = guid.create();
        firebaseRef.set({ guid: id.toString(), firstName: firstName, lastName: lastName, phone: phone }, function (err) {
            if (err) {
                res.send(500, null);
            } else {
                res.send(201, { id: id.toString() });
            }
        });
    }
    next();
}

function uploadPhoto(req, res, next) {
    res.contentType = "json";
    var contactId = req.query.contactId;
    if (!contactId) {
        res.send(400, { type: "IncompleteData", message: "Contact id missing." });
    } else {
        var files = new Array();
        for (var i in req.files)
            files.push(req.files[i]);
        if (files.length < 1) {
            res.send(400, { type: "IncompleteData", message: "File not uploaded." });
        } else if (files.lenght > 1) {
            res.send(400, { type: "InvalidData", message: "Too many files" });
            for (var i = 0; i < files.length ; i++) { 
                fs.unlink(files[i].path);
            }
        } else {
            blobSvc.createContainerIfNotExists('container', { publicAccessLevel: "blob" }, function (error, result, response) {
                if (error) {
                    res.send(500, null);
                } else {
                    blobSvc.createBlockBlobFromLocalFile("container", contactId, files[0].path, function (error, result, response) {
                        fs.unlink(files[0].path);
                        if (error)
                            res.send(500, null);
                        else
                            res.send(201, null);
                    });
                }
            });
        }
    }
    next();
}

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