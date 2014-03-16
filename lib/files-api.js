var fs = require('fs')
  , path = require('path')
  , mime = require('mime')
  , url = require('url')
  , express = require('express')
  , async = require('async')
  , rimraf = require('rimraf')
  , mv = require('mv')
  , multiparty = require('multiparty');

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
  if(a.type ==- 'dir' && b.type === 'dir'){
    return a.name.toLocaleLowerCase().localeCompare(b.name.toLocaleLowerCase());
  }
  // dir before file
  if(a.type !== 'dir' && b.type === 'dir') return 1;
  if(a.type === 'dir' && b.type !== 'dir') return -1;

  return 0;
};


/* actions */
// upload files in a form post to :path
var upload = function upload(req, res, next, baseDir, baseUrl){

  var form = new multiparty.Form();
  form.on('file', function(name, file){
    //console.log(name, file);
    var filename = file.originalFilename;
    var newPath = path.join(baseDir, req.url, filename);
    mv(file.path, newPath, function(err){
      if(err) return next(err);
      //if(err) res.send(500, {error: err.message})
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
var createDir = function createDir(req, res, next, baseDir, baseUrl){
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
var show = function show(req, res, next, baseDir, baseUrl){
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
var list = function list(req, res, next, baseDir, baseUrl){
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
var destroy = function destroy(req, res, next, baseDir, baseUrl){
  var fullPath = path.join(baseDir, decodeURIComponent(req.url));

  fs.exists(fullPath, function(exists){
    if(!exists) res.json(404, {error: fullPath + ' not found.'});

    fs.stat(fullPath, function(err, stats){
      if(err) return next(err);

      if(stats.isFile()){
        fs.unlink(fullPath, function(err){
          if(err) return next(err);
          res.send(204);
        });
      } else if(stats.isDirectory()){
        rimraf(fullPath, function(err){
          if(err) return next(err);
          res.send(204);
        });
      } else {
        res.json(415, {error: 'Unsupported file type.'});
      }

    });
  });
};

// moves a file/dir from :path to json.path
var move = function move(req, res, next, baseDir, baseUrl){
  var resourceUrl = decodeURIComponent(req.url);
  var fullPath = path.join(baseDir, resourceUrl);
  var name = parseName(resourceUrl);
  var destPath = req.body.path + name;
  if(!hasExt(name)) destPath += '/';
  // TOREVISIT: odd that destDir has filename
  var destDir = path.join(baseDir, req.body.path, name);
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
var rename = function rename(req, res, next, baseDir, baseUrl){
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

// copies a file from json.path to :path
var copyFile = function copyFile(req, res, next, baseDir, baseUrl){
  var resourceUrl = decodeURIComponent(req.url);
  var srcPath = path.join(baseDir, req.body.path);
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

module.exports = function(options){
  var app = express();

  app.get('/*', function(req, res, next){
    // if trailing slash, then it's a dir
    if(/\/$/.test(req.url)){
      list(req, res, next, options.baseDir, options.baseUrl);
    } else {
      show(req, res, next, options.baseDir, options.baseUrl);
    }
  });

  app.post('/*',  express.json(), function(req, res, next){

    if(req.is('multipart/form-data')){
      // file upload
      upload(req, res, next, options.baseDir, options.baseUrl);
    } else if(req.is('json')){
      if(/\/$/.test(req.url)){
        // create dir
        createDir(req, res, next, options.baseDir, options.baseUrl)
      } else {
        // copy file
        copyFile(req, res, next, options.baseDir, options.baseUrl)
      }
    }

  });

  app.delete('/*', function(req, res, next){
    destroy(req, res, next, options.baseDir, options.baseUrl);
  });

  app.put('/*', express.json(), function(req, res, next){
    if(req.body.path){
      move(req, res, next, options.baseDir, options.baseUrl);
    } else if(req.body.name){
      rename(req, res, next, options.baseDir, options.baseUrl);
    }

  });

  return app;
}
