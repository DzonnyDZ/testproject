var restify = require('restify');
var sql = require('node-sqlserver-unofficial');
var cstr = "Driver={SQL Server Native Client 11.0};Server=(LocalDB)\\v11.0;AttachDbFilename=D:\\Users\\Honza\\Documents\\Práce\\STRV\\project\\testproject\\TestProject\\database.mdf;Integrated Security=True;Connect Timeout=30";

function createAccount(req, res, next) {
    sql.open(cstr, function (err, conn) {
        if (err) {
            res.statusCode = 500;
            return;
        }
        conn.query("SELECT COUNT(*) AS count FROM dbo.[User] WHERE Email = ?;", [req.body.email], function (error, result) {
            if (error) {
                res.statusCode = 500;
                return;
            }
            if (result.rows[0][0] > 0) {
                res.statusCode = 400;
                res.send({type: "EmailExists", message: "Specified e-mail address is already registered."});     
            } else {
                conn.query("INSERT INTO dbo.[User] (Email, [Password]) VALUES (?, HASHBYTES('MD5', ?));", [req.body.email, req.body.password], function (error, result) {
                    if (error) {
                        res.statusCode = 500;
                        return;
                    }
                    res.statusCode = 201;
                });
            }
        });           
    });

    next();
}

var server = restify.createServer();
server.use(restify.acceptParser(server.acceptable));
server.use(restify.jsonp());
server.use(restify.bodyParser({ mapParams: false }));
server.post('/accounts', createAccount);

server.listen(8080, function () {
    console.log('%s listening at %s', server.name, server.url);
});