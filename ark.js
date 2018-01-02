"use strict";
var events = require('events');
var assert = require('assert');
var path = require('path'),
    resolvePath = path.resolve;
var fs = require('fs');
var existsSync = require('fs').existsSync || require('path').existsSync;
var EventEmitter = events.EventEmitter;

module.exports = create;
create.create = create;
create.Ark = Ark;


/*
  Static Functions
  ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 */

/**
 * Create an app
 * @param  {Array|Object}   packlist   initial plugins or config
 * @param  {Function} callback
 * @return {Ark}
 */
function create( packlist, callback, preSetup ) {
    let config = {}
    // if packlist is an object switch this for config var
    if (!Array.isArray(packlist)) {
        config = packlist
        // load the packlist from config packages Array
        packlist = config.packages
    }
    let app = new Ark( config );
    typeof preSetup === 'function' && preSetup(app, imports);
    app.setup( packlist , callback );
    return app;
}

/*
    SHARED VARS
 */
const imports = {};
const cache = {};
const waiting = {};
let _idleList = '';
let _timer
let _idleDelay = 2000
const isDebug = typeof process.env.DEBUG === 'string' ? process.env.DEBUG.search('ark:*') !== -1 : false

/*
  UTILS
  ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 */

function isDirectory( dir ) {
    try {
        var stats = fs.lstatSync( dir );
        // Is it a directory?
        return stats.isDirectory();
    }
    catch (e) {
        return false;
    }
}

function log () {
  let args = Array.prototype.slice.call(arguments).slice()
  let package_name = args.shift()
  var d = new Date()
  isDebug && console.log.apply(console, [d.toLocaleString(), '[node-ark] <', package_name, '> '].concat(args))
}

function stillWaitingList () {
  let idlePackages = Object.keys(waiting)
  let serializeIdleList = idlePackages.join('')
  if (_idleList !== serializeIdleList && idlePackages.length) {
    _idleList = serializeIdleList
    console.log('=====================================================')
    idlePackages.length && log('CORE', 'idle packages: ', idlePackages)
    console.log('=====================================================')
  }
}

_timer = setInterval(stillWaitingList, _idleDelay)


/*
  The Ark
  ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 */

/**
 * Ark Class
 * Handle plugins, install it, resolve plugins dependencies...
 *
 * Config:
 * 	{
 * 		paths: paths that ark will search for packages
 * 	}
 *
 * @param {Object} config
 */
function Ark( config ) {
    config = config || {}
    this.paths = config.paths || [];
    // first search for plugins in BASE_PATH or running proccess directory
    this.paths.unshift(process.env.BASE_PATH || process.cwd())
}
Ark.prototype = Object.create( EventEmitter.prototype, {constructor: {value:Ark} } );


Ark.prototype.resolvePluginPath = function( relative_path ) {
  let package_path
  try {
      package_path = resolvePath.apply(null, this.paths.concat(relative_path))
      if ( ! isDirectory( package_path ) ) {
          // Check if the plugin is a node_modules package
          // i.e.:  path_name => 'config'
          //        node_modules/config
          var package_file = require.resolve(relative_path)
          package_path = path.dirname(package_file)
      }
  } catch(e) {
      throw new Error('Package `' + relative_path + '` not found', e)
  }
  return package_path
}

/**
 * Resolve all dependencies from current plugin
 * @param  {object}   metadata From package.json file
 * @param  {Function} callback
 */
Ark.prototype.resolvePackageDependencies = async function ( metadata, path_name ) {
  const app = this
  if ( metadata.hasOwnProperty("plugin") && metadata.plugin.hasOwnProperty("requires") ) {
      assert( Array.isArray( metadata.plugin.requires ), "{plugin: {requires: []}} must to be an Array" );

      var dependenciesList = metadata.plugin.requires.slice();

      log(path_name, 'DEPS - metadata deps: ', dependenciesList.length)

      // when there is no any dependency, go ahead
      if ( ! dependenciesList.length ) {
          return true
      }

      for (let i=0; i < metadata.plugin.requires.length; i++) {
        let dependencyPathName = metadata.plugin.requires[i]
        log(path_name, 'loading DEP: ', dependencyPathName)
        await app.loadPlugin( dependencyPathName )
      }
  }
  return true
};

function execPlugin (app, path_name, package_path, args) {
  return new Promise(resolve => {
    /*
        require index.js file from plugin directory
     */
    const plugin_setup_fn = require( package_path );

    log(path_name, 'RUN SETUP plugin', ': ')
    try {
      plugin_setup_fn.apply( app, [imports, callback].concat(args || []))
    } catch (e) {
      callback()
      log(path_name, 'ERROR')
    } finally {

    }

    function callback() {
      cache[package_path] = plugin_setup_fn;
      delete waiting[package_path]
      app.emit( "plugin:loaded", path_name, package_path );
      log(path_name, 'OK LOADED')
      resolve(path_name)
    }
  })
}

/**
 * Reload plugins from path
 * @param  {string}   path_name Relative path to plugin directory
 * @param  {Function} callback  When done will be called
 */
Ark.prototype.reloadPlugin = async function ( path_name, args ) {

  log(path_name, 'Reload plugin')

  let package_path = this.resolvePluginPath(path_name)

   if (typeof cache[package_path] === 'function') {
     delete cache[package_path]
   }

   delete require.cache[require.resolve(package_path)]
   await this.loadPlugin(path_name, args)
   return path_name
};

/**
 * Load and run plugins from path
 * @param  {string}   path_name Relative path to plugin directory
 * @param  {Function} callback  When done will be called
 * @param  {*} args  Arguments for the plugin
 */
Ark.prototype.runPlugin = async function ( path_name, args ) {
  const app = this
  log(path_name, 'Run plugin')

  args = Array.prototype.slice.call(arguments).slice(1)

  let package_path = this.resolvePluginPath(path_name)

  if (typeof cache[package_path] === 'function') {
    cache[package_path].apply( app, [imports, () => {
        app.emit( "plugin:run", path_name, package_path, args )
    }].concat(args));
  } else {
    // throw 'Cannot run loaded plugin because it is not a function'
    await this.loadPlugin(path_name, args)
  }

   return path_name
};


/**
 * Load plugins from path
 * @param  {string}   path_name Relative path to plugin directory
 * @param  {Function} callback  When done will be called
 */
Ark.prototype.loadPlugin = async function ( path_name, args) {

  log(path_name, 'Loading plugin')

  const app = this;
  let metadata = {};
  let package_path

  assert.equal( typeof( path_name ), "string", "path_name needs to be string" );

  // args = Array.prototype.slice.call(arguments).slice(1)

  package_path = this.resolvePluginPath(path_name)

  /*
      Check if plugin is already loaded
   */
  if ( cache.hasOwnProperty( package_path ) || waiting[package_path] ) {
      // callback( path_name );
      return path_name
  }

  /*
      Read package.json
   */
   if ( existsSync( resolvePath( package_path, "./package.json") ) ) {
       cache[package_path] = false;
       waiting[package_path] = true;
       metadata = require( resolvePath( package_path, "./package.json") );
   }

  /*
      Load plugin dependencies
      {
          plugin: {
              requires: ["plugin/requiredPackage"]
          }
      }
   */
   let depsOk = await this.resolvePackageDependencies( metadata, path_name )

   log(path_name, '... WAITING ...')
   await execPlugin(this, path_name, package_path, args)
   return path_name
};

Ark.prototype.setup = function( config, callback ) {
    const app = this
    assert.notStrictEqual( config, undefined, "config is undefined its required" );
    assert( Array.isArray( config ), "config is not an Array" );
    assert( config.length > 0, "you need at least one plugin to start your app" );

    // when does not have any dependency go out
    if ( ! config.length ) {
        return callback(app, imports);
    }

    async function runInitialPluginList () {
      for (let key of config) {
        let plugin = await app.loadPlugin(key)
      }
      return true
    }
    runInitialPluginList().then((value) => {
      clearInterval(_timer)
      callback && callback(app, imports)
    })
};
