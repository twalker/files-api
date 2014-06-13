files-api
=========

RESTful json server for managing file resources.

### Usage

Exports a router that can be mounted by an Express app.
    
    var express = require('express')
      , files = require('./lib/files-api')
      , app = express();

    app.use('/api/files',files({
      // base directory of files to manage
      baseDir: path.join(__dirname, '/public/uploads/'),
      // base URL to where the files are publicly available.
      // Decoupled from the api, and can be absolute.
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
      uploads file(s) to existing dir at :path
    if dir :path
      creates a new dir at :path
    if file :path
      copies existing file specified in json.source to :path
    if json.url
      creates a new file by copying file from json.url to :path with json.name for filename

    PUT    /:path
    if json.destination
      moves a dir/file from :path to json.destination
    if json.name
      renames a dir/file to json.name
    if json.url
      updates a file by copying from json.url to :path
    if json.text
      updates a text/* file with contents in json.text

All actions, except DELETE, return file/dir json.

### JSON models of file/dir

    // File
    // path to file/dir is relative to `baseDir` option.
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

- refactor actions to be less specific to my needs
- cleanup pyramids of doom using async or Q
- un-calcify tests, they're too brittle
- handle errors better
- consider converting to restify or koa
