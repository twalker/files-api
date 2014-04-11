var path = require('path')
  , express = require('express');

var app = module.exports = express();

app.use(require('morgan')('dev'));

// send /api/files requests to mock files api
app.use('/api/files', require('./lib/files-api')({
  baseDir: path.join(__dirname, '/test/fixtures/'),
  baseUrl: '/uploads/'
}));

app.use(require('errorhandler')({ dumpExceptions: true, showStack: true }));

var server = app.listen(3000, function(){
  console.log('server listening on port "%s" with "%s" env settings.', server.address().port, app.get('env'));
});
