# node-ark
A Node application creator about plugin architecture approach.

# Quick Example

Create your module with `npm`
```bash
mkdir -p plugins/myMainPackager
cd plugins/myMainPackager
npm init
touch index.js
```


Create a plugin `plugins/myMainPackager/index.js`
```js
module.exports = function setup(imports, done) {
    imports.myValueExported = 123;

    done(); // call done when finish it
}
```


Your `main.js` script:
```js
var ark = require('node-ark');

ark.create(["plugins/myMainPackager"], function (imports) {
    console.log("My application is running! All plugins are loaded");
})
```

Here is your `package.json`:
```json
{
  "name": "myMainPackager",
  "version": "0.0.1",
  "description": "My Demo Application",
  "main": "index.js",
}
```


## Dependencies

Edit the `package.json` from plugin that require the dependency.

```json
{
    "name": "myMainPackager",
    "version": "0.0.1",
    "description": "My Demo Application",
    "main": "index.js",

    "plugin": {
      "requires": [
          "plugins/myAnotherPlugin"
      ]
    }
}
```

### Create a new plugin

Create a new `package.json`:
```json
{
    "name": "myAnotherPlugin",
    "version": "0.0.1",
    "description": "My Plugin",
    "main": "myPluginSetup.js"
}
```

Create the target plugin `plugins/myAnotherPlugin/myPluginSetup.js`:

```js
module.exports = function setup(imports, done) {
    imports.shareThisObject = {
        name: "Amazing plugin system",
        run: function () {
            return this.name + " is running"
        }
    };

    done(); // call done when finish it
}
```

Then, from `myMainPackager.js` plugin you can do access the shared object:

```js
module.exports = function setup(imports, done) {
    var sharedObject = imports.shareThisObject;

    console.log("Who is?", sharedObject.name);
    console.log("Do what?", sharedObject.run());

    done(); // call done when finish it
}
```
