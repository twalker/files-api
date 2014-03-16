var path = require('path')
  , express = require('express')
  , mockfilesapi = require('./lib/files-api');

var app = module.exports = express();

app
  .use(express.logger('dev'))
  .use(app.router);

// send /api/files requests to mock files api
app.use('/api/files', mockfilesapi({
  baseDir: path.join(__dirname, '/test/fixtures/'),
  baseUrl: '/uploads/'
}));

app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));

var server = app.listen(3000, function(){
  console.log('server listening on port "%s" with "%s" env settings.', server.address().port, app.get('env'));
});
