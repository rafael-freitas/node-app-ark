"use strict";

var events = require('events');
var assert = require('assert');
var path = require('path'),
    resolve = path.resolve;
var fs = require('fs');
var existsSync = require('fs').existsSync || require('path').existsSync;

var EventEmitter = events.EventEmitter;

exports.create = create;
exports.AppArk = AppArk;


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
 * @return {AppArk}
 */
function create( config, callback ) {
    var app = new AppArk( config );
    app.setup( config , callback );
    return app;
}

/*
    SHARED VARS
 */
var base_path;
var imports = {};
var cache = {};


/*
  The Ark
  ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
 */

/**
 * AppArk Class
 * Handle plugins, install it, resolve plugins dependencies...
 */
function AppArk( config ) {
    base_path = process.env.ARK_BASE_PATH;

}
AppArk.prototype = Object.create( EventEmitter.prototype, {constructor: {value:AppArk} } );

/**
 * Load plugins from path
 * @param  {string}   path_name Relative path to plugin directory
 * @param  {Function} callback  When done will be called
 */
AppArk.prototype.loadPlugin = function( path_name, callback ) {
    assert.equal( typeof( path_name ), "string", "path_name needs to be string" );
    assert( isDirectory( resolve( base_path, path_name ) ), "The path not exists or not accessible" );

    var app = this;
    var metadata = {};
    var package_path = resolve( base_path, path_name );

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
AppArk.prototype.resolvePackageDependencies = function( metadata, callback ) {
    if ( metadata.hasOwnProperty("plugin") && metadata.plugin.hasOwnProperty("requires") ) {
        assert( Array.isArray( metadata.plugin.requires ), "{plugin: {requires: []}} must to be an Array" );

        var requires_copy = metadata.plugin.requires.slice();

        var check_finish_load_plugins = ( loaded_plugin_path ) => {
            // remove each loaded plugin from requires copy and when all them were loadeds call the callback
            requires_copy.splice( requires_copy.indexOf( loaded_plugin_path ), 1 );

            if ( requires_copy.length == 0 ) {
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


AppArk.prototype.setup = function( config, callback ) {
    assert.notStrictEqual( config, undefined, "config is undefined its required" );
    assert( Array.isArray( config ), "config is not an Array" );
    assert( config.length > 0, "you need at least one plugin to start your app" );

    var config_copy = config.slice();

    var check_finish_load_plugins = ( loaded_plugin_path ) => {
        // remove each loaded plugin from config copy and when all them were loadeds call the callback
        config_copy.splice( config.indexOf( loaded_plugin_path ), 1 );

        if ( config_copy.length == 0 ) {
            callback && callback()
        }
    }

    for (let key of config) {
        this.loadPlugin( key , check_finish_load_plugins );
    }

};
