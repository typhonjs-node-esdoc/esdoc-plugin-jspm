/**
 * esdoc-plugin-jspm -- Provides support for JSPM packages adding them to ESDoc based on path substitution allowing
 * end to end documentation when using SystemJS / JSPM.
 *
 * Please refer to this repo that is using this plugin to generate documentation:
 * https://github.com/typhonjs/backbone-parse-es6
 *
 * This is the esdoc.json configuration file for the above repo:
 * {
 *    "title": "Backbone-Parse-ES6",
 *    "source": "src",
 *    "destination": "docs",
 *    "plugins":
 *    [
 *       {
 *          "name": "esdoc-plugin-jspm",
 *          "option":
 *          {
 *             "packages": ["backbone-es6"]
 *          }
 *       }
 *    ]
 * }
 *
 * Note that you must supply an `option` entry with `packages` array that indicates which JSPM managed modules to
 * link with the main source indicated by the `source` entry.
 *
 * Each JSPM managed package must also have a valid esdoc.json file at it's root that at minimum has a `source` entry
 * so that these sources may be included.
 *
 * Since ESDoc only works with one source root this plugin rewrites in `onHandleConfig` the source root to the parent
 * directory to `.` and builds an `includes` array that includes the original "source" value in addition to normalized
 * paths to the linked JSPM packages. Therefore be aware that you can not use "includes" in your esdoc.json
 * configuration.
 *
 * In the `onHandleConfig` method below further construction of all resources necessary in code, import, and search
 * processing are constructed.
 */

var fs =    require('fs');
var jspm =  require('jspm');
var path =  require('path');
var url =   require('url');

var packagePath = './package.json';

var docDestination;
var docGitIgnore;
var docSearchScript;

// Stores all RegExp for JSPM packages to run against ES6 import statements.
var codeReplace = [];

// Stores all from -> to strings to replace to run against ES6 import statements.
var importReplace = [];

// Stores all RegExp for JSPM packages to run against generated HTML replacing non-normalized paths.
var htmlReplace = [];

// Stores all from -> to strings to replace for JSPM packages in generated search script data.
var searchReplace = [];

var option;

exports.onStart = function(ev)
{
   option = ev.data.option || {};
   option.packages = option.packages || [];
};

/**
 * Prepares additional config parameters for ESDoc. An all inclusive source root of "." is supplied, so an
 * "includes" array is constructed with all source roots for the local project and all associated jspm packages.
 *
 * Also all RegExp instances are created and stored for later usage.
 *
 * @param {object}   ev - Event from ESDoc containing data field
 */
exports.onHandleConfig = function(ev)
{
   if (ev.data.config.package)
   {
      packagePath = ev.data.config.package;
   }

   // Get package.json as ESDoc will prepend the name of the module found in the package.json
   var rootPackageName = undefined;

   try
   {
      var packageJSON = fs.readFileSync(packagePath).toString();
      var packageObj = JSON.parse(packageJSON);
      rootPackageName = packageObj.name;
   }
   catch(err)
   {
      // ignore
   }

   // Store destination for sources, gitignore and create the path to <doc destination>/script/search_index.js
   docDestination = ev.data.config.destination;
   docGitIgnore = docDestination + path.sep +'.gitignore';
   docSearchScript = docDestination + path.sep +'script' +path.sep +'search_index.js';

   // The source root is rewritten, so save the current value.
   var localSrcRoot = ev.data.config.source;

   ev.data.config.source = '.';

   // __dirname is the node_modules/esdoc-plugin-jspm directory
   var rootPath = __dirname;

   // The root path / parent below node_modules must be found.
   var splitDirPath = rootPath.split(path.sep);

   var pluginSrcDir, esdocPluginDir, nodeModuleDir;

   // If running on Travis CI the plugin.js is invoked directly, so the directory structure is different.
   // than running from the installed node_modules location.
   if (process.env.TRAVIS)
   {
      // Pop the top two directories
      pluginSrcDir = splitDirPath.pop();

      // Set the actual root path if everything looks correct
      if (pluginSrcDir === 'src')
      {
         rootPath = splitDirPath.join(path.sep);

         // Verify that a JSPM config.js file exists in target root directory
         if (!fs.existsSync(rootPath +path.sep +'config.js'))
         {
            console.log("esdoc-plugin-jspm - Error: could not locate JSPM / SystemJS 'config.js'.");
            throw new Error();
         }
      }
      else
      {
         console.log('esdoc-plugin-jspm - Error: could not locate root package path.');
         throw new Error();
      }
   }
   else
   {
      // Pop the top three directories
      pluginSrcDir = splitDirPath.pop();
      esdocPluginDir = splitDirPath.pop();
      nodeModuleDir = splitDirPath.pop();

      // Set the actual root path if everything looks correct
      if (pluginSrcDir === 'src' && esdocPluginDir === 'esdoc-plugin-jspm' && nodeModuleDir === 'node_modules')
      {
         rootPath = splitDirPath.join(path.sep);

         // Verify that a JSPM config.js file exists in target root directory
         if (!fs.existsSync(rootPath +path.sep +'config.js'))
         {
            console.log("esdoc-plugin-jspm - Error: could not locate JSPM / SystemJS 'config.js'.");
            throw new Error();
         }
      }
      else
      {
         console.log('esdoc-plugin-jspm - Error: could not locate root package path.');
         throw new Error();
      }
   }


   var localSrcFullPath = rootPath +path.sep +localSrcRoot;

   if (!fs.existsSync(localSrcFullPath))
   {
      console.log("esdoc-plugin-jspm - Error: could not locate local source path: '" +localSrcFullPath +"'");
      throw new Error();
   }

   // Remove an leading local directory string
   localSrcRoot = localSrcRoot.replace(new RegExp('^\.' +(path.sep === '\\' ? '\\' +path.sep : path.sep)), '');

   console.log("esdoc-plugin-jspm - Info: operating in root path: '" +rootPath +"'");
   console.log("esdoc-plugin-jspm - Info: linked local source root: '" +localSrcRoot +"'");

   // Set the package path to the local root where config.js is located.
   jspm.setPackagePath(rootPath);

   // Create SystemJS Loader
   var System = new jspm.Loader();

   // ESDoc uses the root directory name if no package.json with a package name exists.
   var rootDir = splitDirPath.pop();

   rootPackageName = rootPackageName || rootDir;

   // Stores the normalized paths and data from all JSPM lookups.
   var normalizedData = [];

   if (option.packages.length <= 0)
   {
      console.log(
       "esdoc-plugin-jspm - Warning: no JSPM packages specified or missing 'option' -> 'packages' data.");
   }

   for (var cntr = 0; cntr < option.packages.length; cntr++)
   {
      // The package name found in option -> packages.
      var packageName = option.packages[cntr];

      // The normalized file URL from SystemJS Loader.
      var normalized = System.normalizeSync(packageName);

      // Only process valid JSPM packages
      if (normalized.indexOf('jspm_packages') >= 0)
      {
         // Parse the file URL.
         var parsedPath = path.parse(url.parse(normalized).pathname);

         // Full path to the JSPM package
         var fullPath = parsedPath.dir +path.sep +parsedPath.name;

         // Relative path from the rootPath to the JSPM package.
         var relativePath = path.relative(rootPath, parsedPath.dir) +path.sep +parsedPath.name;

         try
         {
            // Lookup JSPM package esdoc.json to pull out the source location.
            var packageESDocConfig = require(fullPath +path.sep +'esdoc.json');

            // Verify that the JSPM package esdoc.json has a source entry.
            if (typeof packageESDocConfig.source !== 'string')
            {
               throw new Error("'esdoc.json' does not have a valid 'source' entry");
            }

            // Remove an leading local directory string
            var jspmSrcRoot = packageESDocConfig.source;
            jspmSrcRoot = jspmSrcRoot.replace(new RegExp('^\.' +(path.sep === '\\' ? '\\' +path.sep : path.sep)), '');

            // Add to the JSPM package relative path the location of the sources defined in it's esdoc.json config.
            relativePath += path.sep + jspmSrcRoot;

            // Add to the JSPM package full path the location of the sources defined in it's esdoc.json config.
            fullPath += path.sep + jspmSrcRoot;

            // Verify that the full path to the JSPM package source exists.
            if (!fs.existsSync(fullPath))
            {
               throw new Error("full path generated '" +fullPath +"' does not exist");
            }

            // Save the normalized data.
            normalizedData.push(
            {
               packageName: packageName,
               jspmFullPath: fullPath,
               jspmPath: relativePath,
               normalizedPath: packageName +path.sep +packageESDocConfig.source,
               source: packageESDocConfig.source
            });

            console.log("esdoc-plugin-jspm - Info: linked JSPM package '" +packageName +"' to: " +relativePath);
         }
         catch(err)
         {
            console.log("esdoc-plugin-jspm - " +err +" for JSPM package '" +packageName +"'");
         }
      }
      else
      {
         console.log("esdoc-plugin-jspm - Warning: skipping '" +packageName
          +"' as it does not appear to be a JSPM package.");
      }
   }

   var packageData = normalizedData || [];
   var regex;

   // Process include paths -----------------------------------------------------------------------------------------

   // Include the source root of this repos code.
   var includes = ['^' +localSrcRoot];

   // Add the source roots of all associated jspm packages.
   for (cntr = 0; cntr < packageData.length; cntr++)
   {
      if (packageData[cntr].jspmPath)
      {
         includes.push('^' +packageData[cntr].jspmPath);
      }
   }

   ev.data.config.includes = includes;

   // Process code import replacements ------------------------------------------------------------------------------

   // Process all associated JSPM packages.
   for (cntr = 0; cntr < packageData.length; cntr++)
   {
      regex = new RegExp('from[\\s]+(\'|")' +packageData[cntr].normalizedPath, 'g');
      codeReplace.push({ from: regex, to: packageData[cntr].jspmFullPath });
   }

   // Process source code import replacements -----------------------------------------------------------------------

   // Create import replacements.
   var wrongImportBase = rootPackageName +path.sep +rootDir +path.sep;

   var wrongImport = wrongImportBase +localSrcRoot;
   var actualImport = rootPackageName +path.sep +localSrcRoot;

   importReplace.push({ from: wrongImport, to: actualImport });

   // Process all associated JSPM packages.
   for (cntr = 0; cntr < packageData.length; cntr++)
   {
      wrongImport = wrongImportBase +packageData[cntr].jspmPath;
      actualImport = packageData[cntr].normalizedPath;

      importReplace.push({ from: wrongImport, to: actualImport });
   }

   // Process HTML replacements -------------------------------------------------------------------------------------

   // Process all associated JSPM packages.
   for (cntr = 0; cntr < packageData.length; cntr++)
   {
      regex = new RegExp('>' +rootDir +path.sep +packageData[cntr].jspmPath, 'g');
      htmlReplace.push({ from: regex, to: '>' +packageData[cntr].normalizedPath });

      regex = new RegExp('>' +packageData[cntr].jspmPath, 'g');
      htmlReplace.push({ from: regex, to: '>' +packageData[cntr].normalizedPath });
   }

   // Process search index replacements -----------------------------------------------------------------------------

   // Process all associated JSPM packages.
   for (cntr = 0; cntr < packageData.length; cntr++)
   {
      var fromValue = rootDir +path.sep +packageData[cntr].jspmPath;
      searchReplace.push({ from: fromValue, to: packageData[cntr].normalizedPath });
   }
};

/**
 * For all imports in all source files replace any normalized JSPM package paths with the actual full path to the source
 * file in 'jspm_packages'.
 *
 * @param ev
 */
exports.onHandleCode = function(ev)
{
   for (var cntr = 0; cntr < codeReplace.length; cntr++)
   {
      (function(codeReplace)
      {
         // Must construct the replacement as either `'` or `"` can be used to surround the import statement.
         // `p1` is the quote format captured by the regex.
         ev.data.code = ev.data.code.replace(codeReplace.from, function(match, p1)
         {
            return 'from ' +p1 +codeReplace.to;
         });
      })(codeReplace[cntr]);
   }
};

/**
 * Since the source root is "." / the base root of the repo ESDoc currently creates the wrong import path, so they
 * need to be corrected. ESDoc fabricates "<package name>/<base root>" when we want just "<package name>/" for the local
 * project code. For the JSPM packages the import statement is "<package name>/<base root>/<JSPM path>" where
 * the desired path is the just the normalized JSPM path to the associated package.
 *
 * @param {object}   ev - Event from ESDoc containing data field
 */
exports.onHandleTag = function(ev)
{
   // Perform import replacement.
   for (var cntr = 0; cntr < ev.data.tag.length; cntr++)
   {
      var tag = ev.data.tag[cntr];

      if (tag.importPath)
      {
         for (var cntr2 = 0; cntr2 < importReplace.length; cntr2++)
         {
            tag.importPath = tag.importPath.replace(importReplace[cntr2].from, importReplace[cntr2].to);
         }
      }
   }
};

/**
 * The generated HTML also includes the full JSPM path, so various RegExp substitutions are run to transform the
 * full paths to the normalized JSPM package paths.
 *
 * @param {object}   ev - Event from ESDoc containing data field
 */
exports.onHandleHTML = function(ev)
{
   for (var cntr = 0; cntr < htmlReplace.length; cntr++)
   {
      ev.data.html = ev.data.html.replace(htmlReplace[cntr].from, htmlReplace[cntr].to);
   }
};

/**
 * The search data file must have JSPM package paths replaced with normalized versions.
 */
exports.onComplete = function()
{
   var buffer = fs.readFileSync(docSearchScript, 'utf8');

   // Remove the leading Javascript assignment so we are left with a JSON file.
   buffer = buffer.replace('window.esdocSearchIndex = ', '');

   var json = JSON.parse(buffer);

   // Replace all long JSPM paths with normalized paths.
   for (var cntr = 0; cntr < json.length; cntr++)
   {
      // Index 2 is the name of the entry.
      var entry = json[cntr];
      if (entry.length >= 2)
      {
         for (var cntr2 = 0; cntr2 < searchReplace.length; cntr2++)
         {
            entry[2] = entry[2].replace(searchReplace[cntr2].from, searchReplace[cntr2].to);
         }
      }
   }

   // Rewrite the search_index.js file
   buffer = 'window.esdocSearchIndex = ' + JSON.stringify(json, null, 2);

   fs.writeFileSync(docSearchScript, buffer);

   // Create a `.gitignore` file that prevents checking in unnecessary ESDoc files like the AST and other generated
   // assets that are not necessary for viewing the docs. Also unprotects any jspm_packages directive from a
   // parent .gitignore as generated docs from JSPM packages will output to child directories with `jspm_packages`.
   var gitIgnore = "!jspm_packages\nast\ncoverage.json\ndump.json\npackage.json";
   fs.writeFileSync(docGitIgnore, gitIgnore);
};