module.exports = function app() {
    //Requires
    var fs = require('fs');
    var sql = require('mssql');
    var jwt = require('jwt-simple');
    var firebase = require('firebase');
    var azure = require('azure-storage');
    
    //Setup
    var firebaseRef = new firebase('https://radiant-heat-2598.firebaseio.com/'); //Path to firebase
    var blobSvc = azure.createBlobService('chorchojstorage', '+jvJAd+vYk/fPP7ivBZ3k2RpInTv//ANBrXOTFSt262kNrSK6dkBZ9Gj5UZUPO74ccmn//W3A0CyMSef9ToV6A=='); //Connection to Azure BLOB storage
    
    var config = {
        //MS SQL server setup
        server: 'vkyqkhf0b2.database.windows.net,1433', //Replace with server name (mssql npm package does not support named instances :-( )
        database: 'strvtest', //Replace with database name
        user: 'xxx', //Replace with actual user name (this is not censored, I really use xxx :-) )
        password: 'aa1_U!§?:-)' //Replace with actual password (this is not censored, I really use xxx :-) )
    //Integrated security is not supported by mssql npm package :-(
    };
    var secret = 'wfdecerutejhsdgffg8754*/*/*:-)'; //Used to generate access tokens
    
    //Handlers
    
    /**
     * Handles POST request to create account
     * Expects that request is JSON object like {email: String, password: String}.
     * On success returns empty response with code 201 (Created).
     * @param {module:restify/Request} req HTTP request
     * @param {module:restify/Response} res HTTP response
     * @param {Function} next Method called to run next handler in chain
    */
    this.createAccount = function createAccount(req, res, next) {
        res.contentType = 'json';
        var email = req.body.email;
        var password = req.body.password;
        //Validation
        if (!email || !password) {
            res.send(400, { type: 'IncompleteData', message: 'Email or password missing.' });
        } if (typeof (email) != 'string' || typeof (password) != 'string') {
            res.send(400, { type: 'InvalidData', message: 'Email or password is not String.' });
        } else {
            var conn = new sql.Connection(config, function (err) { //Connect to SQL server
                if (err) {
                    res.send(500, { type: 'SqlError', message: 'Cannot connect to database' });
                    console.log('Cannot connect to database: %s %s %s', err.name, err.code, err.message);
                    return;
                }
                var ps = new sql.PreparedStatement(conn);
                ps.input('email', sql.NVarChar(100));
                var statement = 'SELECT COUNT(*) AS count FROM dbo.[User] WHERE Email = @email;'
                ps.prepare(statement, function (err) { //Verify if account already exists
                    if (err) {
                        res.send(500, { type: 'SqlError', message: 'Failed to prepare statement' });
                        console.log('Failed to prepare statement "%s": %s %s %s', statement, err.name, err.code, err.message);
                        return;
                    }
                    ps.execute({ email: email }, function (err, r) {
                        if (err) {
                            res.send(500, { type: 'SqlError', message: 'Failed to execute statement' });
                            console.log('Failed to execute statement "%s": %s %s %s', statement, err.name, err.code, err.message);
                            ps.unprepare();
                            return;
                        }
                        if (r[0].count > 0) res.send(400, { type: 'EmailExists', message: 'Specified e-mail address is already registered.' }); //Do not create duplicate accounts
                        ps.unprepare();
                        ps = new sql.PreparedStatement(conn);
                        ps.input('email', sql.NVarChar(100));
                        ps.input('password', sql.NVarChar(100));
                        ps.prepare('INSERT INTO dbo.[User] (Email, [Password]) VALUES (@email, HASHBYTES(\'MD5\', @password));', function (err) { //Create the account
                            if (err) {
                                res.send(500, { type: 'SqlError', message: 'Failed to prepare statement' });
                                console.log('Failed to prepare statement "%s": %s %s %s', statement, err.name, err.code, err.message);
                                return;
                            }
                            ps.execute({ email: email, password: password }, function (err, r) {
                                ps.unprepare();
                                if (err) {
                                    res.send(500, { type: 'SqlError', message: 'Failed to execute statement' });
                                    console.log('Failed to execute statement "%s": %s %s %s', statement, err.name, err.code, err.message);
                                    return;
                                }
                                console.log('User %s successfully registered', email);
                                res.send(201);
                            });
                        });
                    });
                });
            });
        }
        
        next();
    }
    
    /**
     * Handles GET request to login user
     * Expects two query parameters: email & password
     * On success returns JSON object like {access_token: String}
     * @param {module:restify/Request} req HTTP request
     * @param {module:restify/Response} res HTTP response
     * @param {Function} next Method called to run next handler in chain
    */
    this.getAccessToken = function getAccessToken(req, res, next) {
        res.contentType = 'json';
        var email = req.query.email;
        var password = req.query.password;
        var conn = new sql.Connection(config, function (err) {
            if (err) {
                res.send(500, { type: 'SqlError', message: 'Cannot connect to database' });
                console.log('Cannot connect to database: %s %s  %s', err.name, err.code, err.message);
                return;
            }
            var ps = new sql.PreparedStatement(conn);
            ps.input('email', sql.NVarChar(100));
            ps.input('password', sql.NVarChar(100));
            ps.prepare('SELECT COUNT(*) AS count FROM dbo.[User] WHERE Email = @email AND password = HASHBYTES(\'MD5\', @password);', function (err) { //Verify in DB
                if (err) {
                    res.send(500, { type: 'SqlError', message: 'Failed to prepare statement' });
                    console.log('Failed to prepare statement "%s": %s %s %s', statement, err.name, err.code, err.message);
                    return;
                }
                ps.execute({ email: email, password: password }, function (err, r) {
                    if (err) {
                        res.send(500, { type: 'SqlError', message: 'Failed to execute statement' });
                        console.log('Failed to execute statement "%s": %s %s %s', statement, err.name, err.code, err.message);
                        ps.unprepare();
                        return;
                    }
                    if (r[0].count == 1) {
                        res.send(200, { access_token: jwt.encode(email, secret) }); //Generate access token
                        console.log('User %s successfully logged in', email);
                    } else {
                        res.setHeader('WWW-Authenticate', 'Bearer realm=\'Users\'');
                        res.send(401, { type: 'InvalidEmailPassword', message: 'Specified e-mail / password combination is not valid.' });
                        console.log('Login failed for %s', email);
                    }
                    ps.unprepare();
                });
            });
        });
        next();
    }
    
    /**
     * Handles POST request to create contact
     * Expects that request is JSON object like {firstName: String, lastName: String, phone: String}
     * On success returns HTTP response with code 201 (Created) containing JSON object like {contactId: String}
     * where contactId is unique identifier of newly created contact.
     * @param {module:restify/Request} req HTTP request
     * @param {module:restify/Response} res HTTP response
     * @param {Function} next Method called to run next handler in chain
    */
    this.createContact = function createContact(req, res, next) {
        res.contentType = 'json';
        var firstName = req.body.firstName;
        var lastName = req.body.lastName;
        var phone = req.body.phone;
        if (!firstName || !lastName || !phone) { //Validation
            res.send(400, { type: 'IncompleteData', message: 'First name, last name or phone number missing.' });
        } else if (typeof (firstName) != 'string' ||  typeof (lastName) != 'string' || typeof (phone) != 'string') {
            res.send(400, { type: 'InvalidData', message: 'First name, last name or phone number is not String.' });
        } else if (!/^\+?[0-9]+$/m.test(phone)) {
            res.send(400, { type: 'InvalidData', message: 'Invalid phone number.' });
        } else {
            var pushed = firebaseRef.push({ firstName: firstName, lastName: lastName, phone: phone }, function (err, a1, a2) { //Save to FireBase (push() generates unique ID)
                if (err) {
                    res.send(500, { type: 'FireBaseError', message: 'Saving data to FireBase failed' });
                    console.log('Saving data to FireBase failed: %s %s', err.name, err.message);
                } else {
                    res.send(201, { contactId: pushed.key() }); //Return unique ID to client - it may be useful for him
                    console.log('Contact id %s (%s %s) successfully saved to FireBase', pushed.key(), firstName, lastName);
                }
            });
        }
        next();
    }
    
    /**
     * Deletes (unlinks) all files in given array
     * @param {Array}  files  Array of files to be deleted
    */
    var _removeFiles = function _removeFiles(files) {
        for (var i = 0; i < files.length ; i++) {
            var path = files[i].path;
            fs.unlink(path, function (error) {
                if (error)
                    console.log('Warning: Failed to delete temporary file %s: %s %s', path, err.name, err.message);
                else
                    console.log('Temporary file %s successfully deleted', path);
            });
        }
    }
    
    /**
     * Handles POST request to upload photo
     * Expects query parameters contactId - unique identifier of contact to upload photo for (as returned by createContact())
     * Expects request body to contain exactly one file uploaded using multipart/form-data
     * On success returns empty HTTP response with status 201 (Created)
     * @param {module:restify/Request} req HTTP request
     * @param {module:restify/Response} res HTTP response
     * @param {Function} next Method called to run next handler in chain
    */
    this.uploadPhoto = function uploadPhoto(req, res, next) {
        res.contentType = 'json';
        var contactId = req.query.contactId;
        //Gather all files uploaded (well, we expect only one, but clients can be creative)
        var files = new Array();
        for (var i in req.files)
            files.push(req.files[i]);
        if (!contactId) { //Validation
            res.send(400, { type: 'IncompleteData', message: 'Contact id missing.' });
            _removeFiles(files);
        } else {
            if (files.length < 1) { //No file
                res.send(400, { type: 'IncompleteData', message: 'File not uploaded.' });
            } else if (files.lenght > 1) { //More than one files
                res.send(400, { type: 'InvalidData', message: 'Too many files' });
                _removeFiles(files);
            } else {
                firebaseRef.child(contactId).on('value', function (snapshot) { //Verify that contact exists in FireBase
                    if (snapshot.exists()) {
                        blobSvc.createContainerIfNotExists('container', { publicAccessLevel: 'blob' }, function (error, result, response) { //Ensure Azure BLOB storage container (name 'container')
                            if (error) {
                                res.send(500, { type: 'AzureError', message: 'Failed to ensure container' });
                                console.log('Failed to ensure container: %s %s', err.name, err.message);
                            } else {
                                blobSvc.createBlockBlobFromLocalFile('container', contactId, files[0].path, function (error, result, response) { //Save the image to Azure BLOB storage
                                    _removeFiles(files);
                                    if (error) {
                                        res.send(500, { type: 'AzureError', message: 'Failed to upload image' });
                                        console.log('Failed to upload image for contact %s to Azure: %s %s', contactId, err.name, err.message);
                                    } else {
                                        res.send(201, null);
                                        console.log('Image for contact %s successfully uploaded to Azure', contactId);
                                    }
                                });
                            }
                        });
                    } else {
                        _removeFiles(files);
                        res.send(404, { type: 'NonexistentContact', message: 'Contact id \'' + contactId + '\' does not exist' });
                    }
                });
            }
        }
        next();
    }
    
    /**
     * Authenticates request
     * @param {String}  token Authentication token received via @link {getAccessToken}
     * @param {Function} done Callback to call on successful or unsuccessful authentication
     * @returns result of call to done()
    */
    this.authenticate = function authenticate(token, done) {
        var email;
        try {
            email = jwt.decode(token, secret, false);
        } catch (ex) {
            console.log('Failed authentication: %s %s', ex.name, ex.message);
            return done(null, false);
        }
        return done(null, { email: email }, { scope: 'all' });
    };

    /**
     * Hello world
     * @param {module:restify/Request} req HTTP request
     * @param {module:restify/Response} res HTTP response
     * @param {Function} next Method called to run next handler in chain
    */
    this.hello = function hello(req, res, next){
        res.contentType = 'text/plain';
        res.send(200, 'Hello world');
    }
};