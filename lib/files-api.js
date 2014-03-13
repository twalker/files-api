var fs = require('fs')
  , path = require('path')
  , mime = require('mime')
  , url = require('url')
  , express = require('express')
  , async = require('async')
  , rimraf = require('rimraf')
  , mv = require('mv')
  , getSlug = require('speakingurl').createSlug({custom: {'_': '-'}})
  , multiparty = require('multiparty');

/* helpers */
var reExt = /\.(\w{3,4})$/;
var notHidden = function notHidden(file){
  return '.' != file[0];
};
var hasExt = function hasExt(file){
  return reExt.test(file);
};

// makes filenames url safe.
// e.g. slugify('My SuperFile.JpG') => 'my-superfile.jpg'
var slugify = function slugify(name){
  var ext
    , clean = name;
  var matches = reExt.exec(name);
  if(matches){
    // remember file extension.
    ext = matches[0];
    clean = clean.replace(ext, '');
    return getSlug(clean.replace(ext, '')) + ext.toLowerCase();
  } else {
    return getSlug(clean);
  }
};

/*jshint maxparams:6 */
var toModel = function toModel(name, baseDir, baseUrl, resourceUrl, stats, cb){
  var id = url.resolve(resourceUrl, stats.isDirectory() ? name + '/' : name);
  var fullPath = path.join(baseDir, resourceUrl);
  var model = {
    id: id,
    name: name,
    url: url.resolve(baseUrl, id.replace(/^\//, '')),
    type: stats.isDirectory() ? 'dir' : mime.lookup(name),
    size: stats.isDirectory() ? null : stats.size,
    mtime: stats.mtime
  };
  // provide file count for size when a directory
  if(stats.isDirectory()){
    fs.readdir(path.join(fullPath, name), function(err, files){
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
var upload = function upload(req, res, next, baseDir, baseUrl){

  var form = new multiparty.Form();
  form.on('file', function(name, file){
    //console.log(name, file);
    var cleanName = slugify(file.originalFilename);
    //console.log('cleaning', file.originalFilename, cleanName, getSlug(file.originalFilename))
    var newPath = path.join(baseDir, req.url, cleanName);
    mv(file.path, newPath, function(err){
      if(err) return next(err);
      //if(err) res.send(500, {error: err.message})
      fs.stat(newPath, function(err, stats){
        if(err) return next(err);
        // Return a model for adding to the collection
        toModel(cleanName, baseDir, baseUrl, req.url, stats, function(err, model){
          res.json(model);
        });
      });

    });

  });
  form.parse(req);
};

var createDir = function createDir(req, res, next, baseDir, baseUrl){
  var resourceUrl = decodeURIComponent(req.url);
  // trim trailing / to get name as last url part
  var trimmedUrl = resourceUrl.replace(/\/$/, '');
  var name = trimmedUrl.slice(trimmedUrl.lastIndexOf('/')+1);
  var cleanName = slugify(name);
  resourceUrl = trimmedUrl.replace(name, cleanName);

  var fullPath = path.join(baseDir, resourceUrl);
  fs.mkdir(fullPath, function(err){
    if(err) return next(err);
    fs.stat(fullPath, function(err, stats){
      if(err) return next(err);
      toModel(cleanName, baseDir, baseUrl, resourceUrl.replace(cleanName, ''), stats, function(err, model){
        if(err) return next(err);
        //console.log('createDir sending', model)
        res.send(model);
      });

    })
  });

};

var show = function show(req, res, next, baseDir, baseUrl){
  var resourceUrl = req.url
    , fullPath = path.join(baseDir, decodeURIComponent(req.url))
    , name = req.url.slice(req.url.lastIndexOf('/')+1);

  fs.stat(fullPath, function(err, stats){
    if(err) return next(err);
    toModel(name, baseDir, baseUrl, resourceUrl, stats, function(err, model){
      res.send(model);
    });
  });
};

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
          toModel(name, baseDir, baseUrl, resourceUrl, stats, cb);
        });
      },

      function(err, results){
        if(err) return next(err);

        res.send(results.sort(modelSort));
      }
    );
  });
};

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

var rename = function rename(req, res, next, baseDir, baseUrl){
  var resourceUrl = decodeURIComponent(req.url);
  var trimmedUrl = resourceUrl.replace(/\/$/, '');
  var name = trimmedUrl.slice(trimmedUrl.lastIndexOf('/')+1);
  var cleanName = slugify(name);
  resourceUrl = trimmedUrl.replace(name, cleanName);

  var newPath = path.join(baseDir, resourceUrl);

  mv(path.join(baseDir, req.body.id), newPath, function(err){
    if(err) return next(err);
    fs.stat(newPath, function(err, stats){
      if(err) return next(err);
      toModel(cleanName, baseDir, baseUrl, resourceUrl.replace(cleanName, ''), stats, function(err, model){
        if(err) return next(err);
        res.send(model);
      });

    });

  });
};

var copyFile = function copyFile(req, res, next, baseDir, baseUrl){
  var resourceUrl = decodeURIComponent(req.url);
  var name = resourceUrl.slice(req.url.lastIndexOf('/')+1);

  var srcPath = path.join(baseDir, req.body.id);
  var copyPath = path.join(baseDir, resourceUrl);
  var rs = fs.createReadStream(srcPath);
  rs.on('error', next);
  var ws = fs.createWriteStream(copyPath);
  ws.on('error', next);
  ws.on('close', function(){
    fs.stat(copyPath, function(err, stats){
      if(err) return next(err);
      toModel(name, baseDir, baseUrl, resourceUrl.replace(name, ''), stats, function(err, model){
        if(err) return next(err);
        res.send(model);
      });
    });
  });
  rs.pipe(ws);
};



/*
  GET    /:path
  if dir
      returns a collection of files/dir
  if file
      returns a file model

  DELETE /:path
  deletes a file or dir

  POST   /:path
  if form post
    uploads file(s) to existing dir, returns file json
  if dir json
    creates a new dir, returns dir json
  if file json
    copies existing file in body.id to :path

  PUT    /:path
  renames a dir/file based on json value, returns file/dir json
*/
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
    rename(req, res, next, options.baseDir, options.baseUrl);
  });

  return app;
}
