var restify = require('restify');
var sql = require('mssql');
var jwt = require("jwt-simple");
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
            ps.execute({ email: req.body.email }, function (err, r) {
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
                    ps.execute({ email: req.body.email, password: req.body.password }, function (err, r) {
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
                    res.setHeader("WWW-Authenticate", 'rest realm="' + server.url + '/access_token"');
                    res.send(401, { type: "InvalidEmailPassword", message: "Specified e-mail / password combination is not valid. " });
                }
            });
        });
    });
    next();
}

server.use(restify.acceptParser(server.acceptable));
server.use(restify.jsonp());
server.use(restify.bodyParser({ mapParams: false }));
server.post('/accounts', createAccount);
server.get('/access_token', getAccessToken);

server.listen(8080, function () {
    console.log('%s listening at %s', server.name, server.url);
});