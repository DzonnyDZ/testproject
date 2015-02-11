//Requires
var restify = require('restify');
var passport = require('passport');
var Bearer = require('passport-http-bearer');
var app = new (require('./app.js'))();

//Setup
var server = restify.createServer();

//Web app config
passport.use(new Bearer(app.authenticate));

server.use(restify.acceptParser(server.acceptable));
server.use(restify.jsonp());
server.use(restify.bodyParser({ mapParams: false }));

//Routes
server.post('/accounts', app.createAccount);
server.get('/access_token', app.getAccessToken);
server.post('/contacts', passport.authenticate('bearer', { session: false }), app.createContact);
server.post('/photos', passport.authenticate('bearer', { session: false }), app.uploadPhoto);
server.get('/', app.hello);

//Logging
server.listen(80, function () {
    console.log('%s listening at %s', server.name, server.url);
});