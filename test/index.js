var filesapi = require('../lib/files-api')
  , express = require('express')
  , fs = require('fs')
  , path = require('path')
  , request = require('supertest')
  , assert = require('assert');

var app = express();
app.use(app.router);
app.use(express.logger('dev'));
app.use('/api/files', filesapi({
  baseDir: path.join(__dirname, '/fixtures/'),
  baseUrl: '/uploads/'
}));

function hasProps(obj, props){
  if(!Array.isArray(props)) props = [props];
  return props.every(obj.hasOwnProperty, obj);
}

describe('GET /api/files/:path', function(){
  it('should return JSON for a directory listing', function(done){
    request(app)
      .get('/api/files/')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .end(function(err, res){
        if(err) return done(err);
        assert(Array.isArray(res.body));
        assert(res.body.length > 1);
        done()
      });
  });

  it('should return JSON model for a file', function(done){
    request(app)
      .get('/api/files/plaid-kitty.jpg')
      .set('Accept', 'application/json')
      .expect('Content-Type', /json/)
      .expect(200)
      .end(function(err, res){
        if(err) return done(err);
        var model = res.body;

        assert(hasProps(model, ['id', 'name', 'url', 'type', 'size', 'mtime']))
        //console.log(model)
        assert.equal(model.id, '/plaid-kitty.jpg');
        assert.equal(model.name, 'plaid-kitty.jpg');
        assert.equal(model.type, 'image/jpeg');
        assert.equal(model.url, '/uploads/plaid-kitty.jpg');
        assert(model.size > 1);
        assert(new Date(model.mtime).getTime() > 1);
        done()
      });
  });

});

describe('POST /api/files/:path', function(){

  it('should upload file(s) to existing dir when req is form post', function(done){

    request(app)
      .post('/api/files/foo/')
      .attach('big-easy', 'test/fixtures/big-easy-lofton.jpg')
      .expect(200)
      .end(function(err, res){
        if(err) return done(err);
        assert.equal(res.body.name, 'big-easy-lofton.jpg');
        assert.equal(res.body.url, '/uploads/foo/big-easy-lofton.jpg');
        fs.exists('test/fixtures/foo/big-easy-lofton.jpg', function(exists){
          if(exists){
            fs.unlink('test/fixtures/foo/big-easy-lofton.jpg', done);
          } else {
            done(new Error('File does not exist'))
          }
        });
      });
  });

  it('should create a new dir when :path is a dir (trailing slash)', function(done){
    request(app)
      .post('/api/files/kitties/')
      .send({})
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .expect(200)
      .end(function(err, res){
        if(err) return done(err);
        assert.equal(res.body.name, 'kitties');
        assert.equal(res.body.url, '/uploads/kitties/');
        fs.exists('test/fixtures/kitties', function(exists){
          assert(exists);
          if(exists){
            fs.rmdir('test/fixtures/kitties', done);
          } else {
            done(new Error('new dir does not exist'))
          }
        });
      });
  });

  it('should copy existing file in json.path to :path', function(done){

    request(app)
      .post('/api/files/foo/plaid-kitty.jpg')
      .send({ path: '/plaid-kitty.jpg' })
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .expect(200)
      .end(function(err, res){
        if(err) return done(err);
        assert.equal(res.body.name, 'plaid-kitty.jpg');
        assert.equal(res.body.url, '/uploads/foo/plaid-kitty.jpg');
        fs.exists('test/fixtures/foo/plaid-kitty.jpg', function(exists){
          if(exists){
            fs.unlink('test/fixtures/foo/plaid-kitty.jpg', done);
          } else {
            done(new Error('Copied file does not exist'))
          }
        });
      });
  });

  it('should copy a remote file from json.url to :path with json.name as filename', function(done){
    request(app)
      .post('/api/files/')
      .send({url: 'http://commons.wikimedia.org/wiki/File:Male_Moose.jpg', name: 'moose.jpg' })
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .expect(200)
      .end(function(err, res){
        if(err) return done(err);
        assert.equal(res.body.name, 'moose.jpg');
        assert.equal(res.body.url, '/uploads/moose.jpg');
        fs.exists('test/fixtures/moose.jpg', function(exists){
          if(exists){
            fs.unlink('test/fixtures/moose.jpg', done);
          } else {
            done(new Error('Remote copied file does not exist'))
          }
        });
      });
  });
});

describe('DELETE /api/files/:path', function(){
  if(!fs.existsSync('test/fixtures/doomed/')) fs.mkdirSync('test/fixtures/doomed/');
  if(!fs.existsSync('test/fixtures/doomed/doomed.txt')) fs.writeFileSync('test/fixtures/doomed/doomed.txt', 'doooooomed');

  it('should delete a file', function(done){
    request(app)
      .del('/api/files/doomed/doomed.txt')
      .expect(204, done);
  });

  it('should delete a dir', function(done){
    request(app)
      .del('/api/files/doomed/')
      .expect(204, done);
  });

});

describe('PUT /api/files/:path', function(){

  it('should rename a file', function(done){
    request(app)
      .put('/api/files/plaid-kitty.jpg')
      .send({ name: 'plaid-kitty-renamed.jpg'})
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .expect(200)
      .end(function(err, res){
        if(err) return done(err);
        assert.equal(res.body.name, 'plaid-kitty-renamed.jpg');
        assert.equal(res.body.id, '/plaid-kitty-renamed.jpg');
        fs.exists('test/fixtures/plaid-kitty-renamed.jpg', function(exists){
          assert(exists);
          if(exists){
            // un-rename
            fs.rename('test/fixtures/plaid-kitty-renamed.jpg', 'test/fixtures/plaid-kitty.jpg', done);
          } else {
            done(new Error('Renamed file does not exist'))
          }
        });
      });
  });

  it('should rename a dir', function(done){
    request(app)
      .put('/api/files/foo/bar/')
      .send({ name: 'bar-renamed' })
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .expect(200)
      .end(function(err, res){
        if(err) return done(err);

        assert.equal(res.body.name, 'bar-renamed');
        fs.exists('test/fixtures/foo/bar-renamed/', function(exists){
          assert(exists);
          if(exists){
            // un-rename
            fs.rename('test/fixtures/foo/bar-renamed/', 'test/fixtures/foo/bar/', done);
          } else {
            done(new Error('Renamed dir does not exist'))
          }
        });
      });
  });

  it('should move a file', function(done){
    request(app)
      .put('/api/files/plaid-kitty.jpg')
      .send({ path: '/foo/'})
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .expect(200)
      .end(function(err, res){
        if(err) return done(err);
        assert.equal(res.body.name, 'plaid-kitty.jpg');
        assert.equal(res.body.id, '/foo/plaid-kitty.jpg');
        fs.exists('test/fixtures/foo/plaid-kitty.jpg', function(exists){
          assert(exists);
          if(exists){
            // un-rename
            fs.rename('test/fixtures/foo/plaid-kitty.jpg', 'test/fixtures/plaid-kitty.jpg', done);
          } else {
            done(new Error('Moved file does not exist'))
          }
        });
      });
  });

  it('should move a dir', function(done){
    request(app)
      .put('/api/files/foo/bar/')
      .send({ path: '/' })
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .expect(200)
      .end(function(err, res){
        if(err) return done(err);
        assert.equal(res.body.id, '/bar/');
        assert.equal(res.body.name, 'bar');
        fs.exists('test/fixtures/bar/', function(exists){
          assert(exists);
          if(exists){
            // un-rename
            fs.rename('test/fixtures/bar/', 'test/fixtures/foo/bar/', done);
          } else {
            done(new Error('Moved dir does not exist'))
          }
        });
      });
  });

  it('should overwrite an existing file resource in :path with the remote file in json.url', function(done){
    request(app)
      .put('/api/files/2b-clobbered.jpg')
      .send({url: 'http://commons.wikimedia.org/wiki/File:Male_Moose.jpg'})
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .expect(200)
      .end(function(err, res){
        if(err) return done(err);
        assert.equal(res.body.name, '2b-clobbered.jpg');
        assert.equal(res.body.url, '/uploads/2b-clobbered.jpg');

        fs.stat('test/fixtures/2b-clobbered.jpg', function(err, stats){
          // if larger file size, then it must've been copied from remote location
          assert(stats.size > 1024);
          fs.unlink('test/fixtures/2b-clobbered.jpg', function(err){
            fs.writeFile('test/fixtures/2b-clobbered.jpg', 'doomed image body', done);
          });

        });
      });
  });

  it('should overwrite an existing text/* file resource with content in json.text', function(done){
    request(app)
      .put('/api/files/foo/bar/touched.txt')
      .send({text: 'Now Updated'})
      .set('Accept', 'application/json')
      .set('Content-Type', 'application/json')
      .expect(200)
      .end(function(err, res){
        if(err) return done(err);
        assert.equal(res.body.name, 'touched.txt');
        fs.readFile('test/fixtures/foo/bar/touched.txt', function(err, data){
          if(err) return done(err)
          assert.equal(data, 'Now Updated');
          fs.writeFile('test/fixtures/foo/bar/touched.txt', 'touched', {flags: 'w'}, done);
        });
      });
  });

});

