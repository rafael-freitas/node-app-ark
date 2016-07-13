"use strict";
var events = require('events');
var assert = require('assert');
var path = require('path'),
    resolve = path.resolve;
var fs = require('fs');
var existsSync = require('fs').existsSync || require('path').existsSync;

var EventEmitter = events.EventEmitter;

exports.create = create;
exports.Ark = Ark;


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


/*
  Static Functions
  ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 */

/**
 * Create an app
 * @param  {Array}   config   initial plugins
 * @param  {Function} callback
 * @return {Ark}
 */
function create( config, callback ) {
    var app = new Ark( config );
    app.setup( config , callback );
    return app;
}

/*
    SHARED VARS
 */
var imports = {};
var cache = {};


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
 * 		basePath: root directory to your application
 * 	}
 *
 * @param {Object} config
 */
function Ark( config ) {
    config = config || {};
    this.basePath = config.basePath || process.env.BASE_PATH || process.cwd();
}
Ark.prototype = Object.create( EventEmitter.prototype, {constructor: {value:Ark} } );

/**
 * Load plugins from path
 * @param  {string}   path_name Relative path to plugin directory
 * @param  {Function} callback  When done will be called
 */
Ark.prototype.loadPlugin = function( path_name, callback ) {
    var app = this;
    var metadata = {};

    var package_path = resolve( this.basePath, path_name );

    assert.equal( typeof( path_name ), "string", "path_name needs to be string" );
    // assert( isDirectory( package_path ), "The path not exists or not accessible: " + package_path );

    try {
        if ( ! isDirectory( package_path ) ) {
            var package_file = require.resolve( path_name );
            package_path = path.dirname( package_file );
        }
    } catch(e) {
        console.error(path_name, "is not found");
        process.exit(e.code);
    }

    /*
        Check if plugin is already loaded
     */
    if ( cache.hasOwnProperty( package_path ) ) {
        callback( path_name );
        return true;
    }

    /*
        Read package.json
     */
     if ( existsSync( resolve( package_path, "./package.json") ) ) {
         cache[package_path] = false;
         metadata = require( resolve( package_path, "./package.json") );
     }


    /*
        Load plugin dependencies
        {
            plugin: {
                requires: ["plugin/requiredPackage"]
            }
        }
     */
     this.resolvePackageDependencies( metadata, () => {
         /*
             require index.js file from plugin directory
          */
         var plugin_setup_fn = require( package_path );

         plugin_setup_fn.call( app, imports, () => {
            //  console.log("done() was called");
             cache[package_path] = true;
             app.emit( "plugin:loaded", package_path );
             callback( path_name );
         });
     });



};


/**
 * Resolve all dependencies from current plugin
 * @param  {object}   metadata From package.json file
 * @param  {Function} callback
 */
Ark.prototype.resolvePackageDependencies = function( metadata, callback ) {
    if ( metadata.hasOwnProperty("plugin") && metadata.plugin.hasOwnProperty("requires") ) {
        assert( Array.isArray( metadata.plugin.requires ), "{plugin: {requires: []}} must to be an Array" );

        var requires_copy = metadata.plugin.requires.slice();

        // when does not have any dependency go out
        if ( ! requires_copy.length ) {
            return callback();
        }

        var check_finish_load_plugins = ( loaded_plugin_path ) => {
            // remove each loaded plugin from requires copy and when all them were loadeds call the callback
            requires_copy.splice( requires_copy.indexOf( loaded_plugin_path ), 1 );

            if ( ! requires_copy.length ) {
                callback()
            }
        };

        for (let key of metadata.plugin.requires) {
            this.loadPlugin( key, check_finish_load_plugins );
        }
    }
    else {
        callback()
    }
};


Ark.prototype.setup = function( config, callback ) {
    assert.notStrictEqual( config, undefined, "config is undefined its required" );
    assert( Array.isArray( config ), "config is not an Array" );
    assert( config.length > 0, "you need at least one plugin to start your app" );

    var config_copy = config.slice();

    // when does not have any dependency go out
    if ( ! config_copy.length ) {
        return callback(imports);
    }

    var check_finish_load_plugins = ( loaded_plugin_path ) => {
        // remove each loaded plugin from config copy and when all them were loadeds call the callback
        config_copy.splice( config.indexOf( loaded_plugin_path ), 1 );

        if ( config_copy.length == 0 ) {
            callback && callback(imports)
        }
    }

    for (let key of config) {
        this.loadPlugin( key , check_finish_load_plugins );
    }

};
