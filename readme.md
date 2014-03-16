files-api
=========

RESTful json server for managing file resources.

### Usage

Can be mounted by an existing Express app.
    
    var express = require('express')
      , mockfilesapi = require('./lib/files-api')
      , app = express();

    app.use('/api/files', mockfilesapi({
      // base directory to files to manage
      baseDir: path.join(__dirname, '/test/fixtures/'),
      // base URL to where the files are publicly available.
      // Decoupled from the api, can be fully qualified url.
      baseUrl: '/uploads/'
    }));

---------------------

### Routes

    GET    /:path   
    if dir
        returns a collection of file/dir models
    if file
        returns a file model
    
    DELETE /:path
    deletes a file or dir

    POST   /:path
    if form post
      uploads file(s) to existing dir at :path, returns file json
    if dir json
      creates a new dir at :path, returns dir json
    if file json
      copies existing file in json.path to :path

    PUT    /:path
    if json.path
       moves a dir/file from :path to json.path, returns file/dir json
    if json.name
        renames a dir/file to json.name, returns file/dir json

### JSON models of file/dir

    // File
    // path to file/dir is relative to a 'home' directory.
    id: "/foo/bar/mycat.jpg"
    name: 'mycat.jpg'
    // url to serve the actual file
    url: "/uploads/foo/bar/mycat.jpg"
    // mime type, or 'dir'
    type: 'image/jpeg'
    // file size in bytes
    size: 1458268
    // number of files in directory
    count: null
    // last modified stamp
    mtime: '2013-08-03T20:33:11.833Z'
    // Image dimensions are populated by client on image load
    dimensions: '100 x 10'


    // Dir 
    // ends in trailing slash to denote it's a directory
    id: "/foo/bar/" 
    name: 'bar'
    url: "/uploads/foo/bar/"
    type: 'dir'
    size: null
    count: 12 
    mtime: '2013-08-03T20:33:11.833Z'


-------------------------

## TODO

- cleanup pyramids of doom using async or Q
- un-calcify tests, they're too brittle
- consider converting to restify or koa
