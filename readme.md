files-api
=========

RESTful json server for managing file resources.

---------------------

### Routes

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
    moves (or renames) a dir/file based on json value, returns file/dir json


### JSON models

    // File
    // path to file/dir is relative to organization's directory.
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

- cleanup pyramids of doom
- un-calcify tests, they're too brittle
