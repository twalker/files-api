var fs = require('fs')
  , request = require('request')
  , path = require('path')
  , mime = require('mime')
  , url = require('url')
  , express = require('express')
  , bodyParser = require('body-parser')
  , async = require('async')
  , rimraf = require('rimraf')
  , mv = require('mv')
  , multiparty = require('multiparty');


// config
var baseDir = path.join(__dirname, '/fixtures/');
var baseUrl = '/uploads/';

/* helpers */
var reExt = /\.(\w{3,4})$/;
var notHidden = function notHidden(file){
  return '.' != file[0];
};
var hasExt = function hasExt(file){
  return reExt.test(file);
};

// parse the file or dir name from the url
var parseName = function parseName(resourceUrl){
  var trimmedUrl = resourceUrl.replace(/\/$/, '');
  return trimmedUrl.slice(trimmedUrl.lastIndexOf('/')+1);
};

/*jshint maxparams:6 */
var toModel = function toModel(baseDir, baseUrl, resourceUrl, stats, cb){
  var name = parseName(resourceUrl);
  var fullPath = path.join(baseDir, resourceUrl);
  //console.log('toModel', arguments)
  var model = {
    id: resourceUrl,
    name: name,
    url: url.resolve(baseUrl, resourceUrl.replace(/^\//, '')),
    type: stats.isDirectory() ? 'dir' : mime.lookup(name),
    size: stats.isDirectory() ? null : stats.size,
    mtime: stats.mtime
  };
  // provide file count for size when a directory
  if(stats.isDirectory()){
    fs.readdir(fullPath, function(err, files){
      if(err) return cb(err);
      model.count = files.filter(notHidden).filter(hasExt).length;
      cb(null, model)
    });
  } else {
    cb(null, model);
  }
};

var modelSort = function modelSort(a, b) {
  // sibling files sort by modified date asc
  if(a.type !== 'dir' && b.type !== 'dir'){
    return b.mtime - a.mtime;
  }
  // sibling dirs sort by name
  if(a.type === 'dir' && b.type === 'dir'){
    return a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase());
  }
  // dir before file
  if(a.type !== 'dir' && b.type === 'dir') return 1;
  if(a.type === 'dir' && b.type !== 'dir') return -1;

  return 0;
};


/* actions */
// upload files in a form post to :path
var upload = function upload(req, res, next){

  var form = new multiparty.Form();
  form.on('file', function(name, file){
    //console.log(name, file);
    var filename = file.originalFilename;
    var newPath = path.join(baseDir, req.url, filename);
    mv(file.path, newPath, function(err){
      if(err) return next(err);
      fs.stat(newPath, function(err, stats){
        if(err) return next(err);
        // Return a model for adding to the collection
        toModel(baseDir, baseUrl, req.url + filename, stats, function(err, model){
          res.json(model);
        });
      });

    });

  });
  form.parse(req);
};

// create a directory at :path
var createDir = function createDir(req, res, next){
  var resourceUrl = decodeURIComponent(req.url);
  var fullPath = path.join(baseDir, resourceUrl);
  fs.mkdir(fullPath, function(err){
    if(err) return next(err);
    fs.stat(fullPath, function(err, stats){
      if(err) return next(err);
      toModel(baseDir, baseUrl, resourceUrl, stats, function(err, model){
        if(err) return next(err);
        //console.log('createDir sending', model)
        res.send(model);
      });
    })
  });

};

// show file json for :path
var show = function show(req, res, next){
  var resourceUrl = req.url
    , fullPath = path.join(baseDir, decodeURIComponent(req.url));

  fs.stat(fullPath, function(err, stats){
    if(err) return next(err);
    toModel(baseDir, baseUrl, resourceUrl, stats, function(err, model){
      res.send(model);
    });
  });
};

// list all files as json in :path
var list = function list(req, res, next){
  var resourceUrl = req.url
    , fullPath = path.join(baseDir, decodeURIComponent(req.url));

  fs.readdir(fullPath, function(err, listing){
    if (err) return next(err);

    var names = listing.filter(notHidden);

    async.map(names,
      function(name, cb){
        fs.stat(path.join(fullPath, name), function(err, stats){
          if(err) return cb(err);
          var childUrl = resourceUrl + name;
          if(stats.isDirectory()) childUrl += '/';
          toModel(baseDir, baseUrl, childUrl, stats, cb);
        });
      },

      function(err, results){
        if(err) return next(err);

        res.send(results.sort(modelSort));
      }
    );
  });
};

// destroys file/dir in :path
var destroy = function destroy(req, res, next){
  var fullPath = path.join(baseDir, decodeURIComponent(req.url));

  fs.exists(fullPath, function(exists){
    if(!exists) res.json(404, {error: fullPath + ' not found.'});

    fs.stat(fullPath, function(err, stats){
      if(err) return next(err);

      if(stats.isFile()){
        fs.unlink(fullPath, function(err){
          if(err) return next(err);
          res.status(204).end();
        });
      } else if(stats.isDirectory()){
        rimraf(fullPath, function(err){
          if(err) return next(err);
          res.status(204).end();
        });
      } else {
        res.status(415).json({error: 'Unsupported file type.'});
      }

    });
  });
};

// moves a file/dir from :path to json.path
var move = function move(req, res, next){
  var resourceUrl = decodeURIComponent(req.url);
  var fullPath = path.join(baseDir, resourceUrl);
  var name = parseName(resourceUrl);
  var destPath = req.body.destination + name;
  if(!hasExt(name)) destPath += '/';
  // TOREVISIT: odd that destDir has filename
  var destDir = path.join(baseDir, req.body.destination, name);
  mv(fullPath, destDir, function(err){
    if(err) return next(err);
    fs.stat(path.join(baseDir, destPath), function(err, stats){
      if(err) return next(err);
      toModel(baseDir, baseUrl, destPath, stats, function(err, model){
        if(err) return next(err);
        res.send(model);
      });

    });

  });
};

// updates the name of a file/dir in :path to json.name
var rename = function rename(req, res, next){
  var resourceUrl = decodeURIComponent(req.url);
  var fullPath = path.join(baseDir, resourceUrl);
  var prevName = parseName(resourceUrl);
  var newName = req.body.name;
  var destPath = resourceUrl.replace(prevName, newName);

  mv(fullPath, path.join(baseDir, destPath), function(err){
    if(err) return next(err);
    fs.stat(path.join(baseDir, destPath), function(err, stats){
      if(err) return next(err);
      toModel(baseDir, baseUrl, destPath, stats, function(err, model){
        if(err) return next(err);
        res.send(model);
      });
    });
  });
};

// copies a file from json.source to :path
var copyFile = function copyFile(req, res, next){
  var resourceUrl = decodeURIComponent(req.url);
  var srcPath = path.join(baseDir, req.body.source);
  var copyPath = path.join(baseDir, resourceUrl);
  var rs = fs.createReadStream(srcPath);
  rs.on('error', next);
  var ws = fs.createWriteStream(copyPath);
  ws.on('error', next);
  ws.on('close', function(){
    fs.stat(copyPath, function(err, stats){
      if(err) return next(err);
      toModel(baseDir, baseUrl, resourceUrl, stats, function(err, model){
        if(err) return next(err);
        res.send(model);
      });
    });
  });
  rs.pipe(ws);
};

// copies a file from body.url (aviary) to :path.
var copyRemoteFile = function copyRemoteFile(req, res, next){
  // POST actions will have body.name for filename,
  // while PUT operations get the filename from the resourceUrl (:path)
  var resourceUrl = decodeURIComponent(req.url);
  if(req.body.name) resourceUrl += req.body.name;

  var fullPath = path.join(baseDir, resourceUrl);

  var ws = fs.createWriteStream(fullPath);
  ws.on('error', next);
  ws.on('close', function(){
    fs.stat(fullPath, function(err, stats){
      if(err) return next(err);
      toModel(baseDir, baseUrl, resourceUrl, stats, function(err, model){
        if(err) return next(err);
        res.send(model);
      });
    });
  });

  request(req.body.url).pipe(ws);
};

// updates an existing text/* file with json.text
var updateTextFile = function updateTextFile(req, res, next){
  var resourceUrl = decodeURIComponent(req.url);
  var fullPath = path.join(baseDir, resourceUrl);
  fs.writeFile(fullPath, req.body.text, function(err){
    if(err) return next(err);
    fs.stat(fullPath, function(err, stats){
      if(err) return next(err);
      toModel(baseDir, baseUrl, resourceUrl, stats, function(err, model){
        if(err) return next(err);
        res.send(model);
      });
    });
  });
};


module.exports = function(options){
  var files = express.Router();
  // base path settings
  if(options.baseDir) baseDir = options.baseDir;
  if(options.baseUrl) baseUrl = options.baseUrl

  files.get('/*', function(req, res, next){
    // if trailing slash, then it's a dir
    if(/\/$/.test(req.url)){
      list(req, res, next);
    } else {
      show(req, res, next);
    }
  });

  files.post('/*', bodyParser.json(), function(req, res, next){

    if(req.is('multipart/form-data')){
      // file upload
      upload(req, res, next);
    } else if(req.is('json')){
      if(req.body.url){
        // copy file from remote (aviary)
        copyRemoteFile(req, res, next);
      } else if(/\/$/.test(req.url)){
        // create dir
        createDir(req, res, next)
      } else if(req.body.source) {
        // copy file
        copyFile(req, res, next)
      }
    }

  });

  files.delete('/*', function(req, res, next){
    destroy(req, res, next);
  });

  files.put('/*', bodyParser.json(), function(req, res, next){
    if(req.body.destination){
      move(req, res, next);
    } else if(req.body.name){
      rename(req, res, next);
    } else if(req.body.url){
      copyRemoteFile(req, res, next);
    } else if(req.body.text){
      updateTextFile(req, res, next);
    }
  });

  return files;
}
