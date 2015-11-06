![esdoc-plugin-jspm](http://i.imgur.com/1TsbnX2.png)

[![NPM](https://img.shields.io/npm/v/esdoc-plugin-jspm.svg?label=npm)](https://www.npmjs.com/package/esdoc-plugin-jspm)
[![Code Style](https://img.shields.io/badge/code%20style-allman-yellowgreen.svg?style=flat)](https://en.wikipedia.org/wiki/Indent_style#Allman_style)
[![License](https://img.shields.io/badge/license-MIT-yellowgreen.svg?style=flat)](https://github.com/typhonjs/esdoc-plugin-jspm/blob/master/LICENSE)

[![Build Status](https://travis-ci.org/typhonjs/esdoc-plugin-jspm.svg?branch=master)](https://travis-ci.org/typhonjs/esdoc-plugin-jspm)
[![Build Status](https://img.shields.io/codecov/c/github/codecov/example-python.svg)](https://codecov.io/github/typhonjs/esdoc-plugin-jspm)
[![Dependency Status](https://www.versioneye.com/user/projects/562b368236d0ab0019001056/badge.svg?style=flat)](https://www.versioneye.com/user/projects/562b368236d0ab0019001056)

A plugin for [ESDoc](https://esdoc.org) that enables end to end Javascript ES6 documentation linking [JSPM](http://jspm.io) / [SystemJS](https://github.com/systemjs/systemjs) managed packages in addition to a local source root. This allows creating comprehensive documentation that includes JS managed by JSPM / SystemJS. 

Installation steps:
- Install `esdoc` or `gulp-esdoc` in `devDependencies` in `package.json`.
- Install `esdoc-plugin-jspm` in `devDependencies` in `package.json`.
- Create an `esdoc.json` configuration file adding the plugin.
- Add `option` -> `packages` data listing the JSPM packages to link.
- Add an `esdoc.json` configuration file in all JSPM managed packages to link.
- Run ESdoc then profit!

For more information view the [ESDoc tutorial](https://esdoc.org/tutorial.html) and [ESDoc Config](https://esdoc.org/config.html) documentation.

As an alternate and the preferred all inclusive installation process please see [typhonjs-core-gulptasks](https://www.npmjs.com/package/typhonjs-core-gulptasks) for an NPM package which contains several pre-defined Gulp tasks for working with JSPM / SystemJS, ESLint and ESDoc generation with `esdoc-plugin-jspm` support.

Please see the [backbone-parse-es6](https://github.com/typhonjs/backbone-parse-es6) repo for an example using `esdoc-plugin-jspm` via `typhon-core-gulptasks`. 

If installing and working directly with `esdoc-plugin-jspm` the following is an example integration for `package.json`:
```
{
  ...

  "devDependencies": {
    "esdoc-plugin-jspm": "^0.2.0",
    "jspm": "^0.16.14",
    "gulp": "^3.9.0",
    "gulp-esdoc": "^0.1.0",
  },
  
  "jspm": {
    "main": "src/ModuleRuntime.js",
    "dependencies": {
      "backbone-es6": "github:typhonjs/backbone-es6@master"
    },
     "devDependencies": {
      ....
    }
  }
}
```

And the [esdoc.json](https://github.com/typhonjs/backbone-parse-es6/blob/master/esdoc.json) configuration file:

```
{
   "title": "<title>",
   "source": "src",
   "destination": "docs",
   "plugins":
   [
      {
         "name": "esdoc-plugin-jspm",
         "option":
         {
            "packages": ["backbone-es6"]
         }
      }
   ]
}
```

For the example above the local source root is `src` and the ESDoc documentation is output to `docs`. The linked JSPM package is `backbone-es6`. 

A `.gitignore` will be added to the `docs` directory that ignores all unnecessary files for checking into a repository. 

You may use any version of ESDoc, but as an example here is a simple Gulp task which invokes gulp-esdoc:

```
/**
 * Create docs from ./src using ESDoc. The docs are located in ./docs
 */
gulp.task('docs', function()
{
   var path = require('path');

   var esdocConfig = require('.' +path.sep +'esdoc.json');

   // Launch ESDoc
   return gulp.src(esdocConfig.source).pipe(esdoc(esdocConfig));
});
```

For a complete demo with instructions on how to use `backbone-parse-es6` (Backbone + Parse 1.6+) with SystemJS / JSPM see the [backbone-parse-es6-demo](https://github.com/typhonjs/backbone-parse-es6-demo) repo. Backbone, Parse, JSPM / SystemJS (setup, use, building), Gulp, ESLint and ESDoc is covered. 

It should be noted that `esdoc-plugin-jspm` uses the `includes` ESDoc configuration parameter and will overwrite any `includes` top level entry stored in `esdoc.json`.  

Currently the [ESDoc Hosting Service](https://doc.esdoc.org/) isn't JSPM / SystemJS aware, so docs will have to be generated locally and hosted independently.

Check out the docs for [backbone-parse-es6](http://js.typhonrt.org/docs/backbone-parse-es6/) and notice that when viewing [ParseCollection](http://js.typhonrt.org/docs/backbone-parse-es6/class/backbone-parse-es6/src/ParseCollection.js~ParseCollection.html) that it properly contains links to the inheriting class from a JSPM package ([backbone-es6](https://github.com/typhonjs/backbone-es6)) and also contains an `Inherited Summary` section for Collection & Event which is in the inheritance structure. 

Without using `esdoc-plugin-jspm` the output only contains the local source. See the version of [ParseCollection](https://doc.esdoc.org/github.com/typhonjs/backbone-parse-es6/class/src/ParseCollection.js~ParseCollection.html) on the ESDoc hosting service for a comparison.

To suggest a feature or report a bug: https://github.com/typhonjs/esdoc-plugin-jspm/issues

Many thanks to the ESDoc community for creating a valuable documentation tool. 

esdoc-plugin-jspm (c) 2015-present Michael Leahy, TyphonRT Inc.

esdoc-plugin-jspm may be freely distributed under the MIT license.
