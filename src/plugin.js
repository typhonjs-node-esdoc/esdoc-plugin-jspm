/**
 * esdoc-plugin-jspm -- Provides support for JSPM packages adding them to ESDoc based on path substitution allowing
 * end to end documentation when using SystemJS / JSPM. This plugin automatically parses the top level `package.json`
 * file for a `jspm.dependencies` entry and resolves any packages that contain a valid `esdoc.json` file.
 *
 * Please refer to this repo that is using this plugin to generate documentation:
 * https://github.com/typhonjs/backbone-parse-es6-demo
 *
 * This is the esdoc.json configuration file for the above repo:
 * {
 *    "title": "backbone-parse-es6-demo",
 *    "source": "src",
 *    "destination": "docs",
 *    "plugins": [ { "name": "esdoc-plugin-jspm" } ]
 * }
 *
 * To explicitly limit the top level packages to be parsed include an `option` hash with a `packages` entry which is
 * an array listing the packages or aliased packages to link:
 * {
 *    "title": "backbone-parse-es6",
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
 * Each JSPM managed package must also have a valid esdoc.json file at it's root that at minimum has a `source` entry
 * so that these sources may be included.
 *
 * Since ESDoc only works with one source root this plugin rewrites in `onHandleConfig` the source root to the parent
 * directory to `.` and builds an `includes` array that includes the original "source" value in addition to normalized
 * paths to the linked JSPM packages. Therefore be aware that you can not use "includes" in your esdoc.json
 * configuration.
 *
 * The root path to operate in is found in `findRootPath`. An optional top level entry, `jspmRootPath` to `esdoc.json`
 * may define the root path; often this is added programmatically. If `jspmRootPath` is not defined __dirName is
 * parsed to find the project root path.
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

// Stores option.packages converted into an object hash or the values from `jspm.dependencies` from `package.json`.
var jspmPackageMap;

// Stores all RegExp for JSPM packages to run against ES6 import statements.
var codeReplace = [];

// Stores all from -> to strings to replace to run against ES6 import statements.
var importReplace = [];

// Stores all RegExp for JSPM packages to run against generated HTML replacing non-normalized paths.
var htmlReplace = [];

// Stores all from -> to strings to replace for JSPM packages in generated search script data.
var searchReplace = [];

// Stores sanitized option map.
var option;

// Stores option that if true silences logging output.
var silent;

// ESDoc plugin callbacks -------------------------------------------------------------------------------------------

/**
 * Stores the option data from the plugin configuration and provides empty defaults as necessary.
 *
 * @param {object}   ev - Event from ESDoc containing data field.
 */
exports.onStart = function(ev)
{
   option = ev.data.option || {};
   option.packages = option.packages || [];
   option.parseDependencies = option.parseDependencies || true;
   silent = option.silent || false;

   // Convert option.packages array to object literal w/ no mapped path.
   if (option.packages.length > 0)
   {
      jspmPackageMap = {};
      for (var cntr = 0; cntr < option.packages.length; cntr++)
      {
         jspmPackageMap[option.packages[cntr]] = null;
      }
   }
};

/**
 * Prepares additional config parameters for ESDoc. An all inclusive source root of "." is supplied, so an
 * "includes" array is constructed with all source roots for the local project and all associated jspm packages.
 *
 * Also all RegExp instances are created and stored for later usage.
 *
 * @param {object}   ev - Event from ESDoc containing data field.
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

      // If auto-parsing JSPM dependencies is enabled then analyze `package.json` for a `jspm.dependencies` entry.
      if (option.parseDependencies)
      {
         jspmPackageMap = parsePackageJsonJSPMDependencies(packageObj, jspmPackageMap);
      }
   }
   catch(err)
   {
      throw new Error("Could not locate `package.json` in package path '" + packagePath + "'.");
   }

   // Store destination for sources, gitignore and create the path to <doc destination>/script/search_index.js
   docDestination = ev.data.config.destination;
   docGitIgnore = docDestination + path.sep + '.gitignore';
   docSearchScript = docDestination + path.sep + 'script' + path.sep + 'search_index.js';

   // The source root is rewritten, so save the current value.
   var localSrcRoot = ev.data.config.source;

   ev.data.config.source = '.';

   var rootPath = findRootPath(ev.data.config);

   var localSrcFullPath = rootPath + path.sep + localSrcRoot;

   if (!fs.existsSync(localSrcFullPath))
   {
      if (!silent)
      {
         console.log("esdoc-plugin-jspm - Error: could not locate local source path: '" + localSrcFullPath + "'");
      }
      throw new Error();
   }

   // Remove an leading local directory string
   localSrcRoot = localSrcRoot.replace(new RegExp('^\.' + (path.sep === '\\' ? '\\' + path.sep : path.sep)), '');

   if (!silent)
   {
      console.log("esdoc-plugin-jspm - Info: operating in root path: '" + rootPath + "'");
      console.log("esdoc-plugin-jspm - Info: linked local source root: '" + localSrcRoot + "'");
   }

   // Set the package path to the local root where config.js is located.
   jspm.setPackagePath(rootPath);

   // Create SystemJS Loader
   var System = new jspm.Loader();

   // ESDoc uses the root directory name if no package.json with a package name exists.
   var rootDir = rootPath.split(path.sep).pop();

   rootPackageName = rootPackageName || rootDir;

   // Stores the normalized paths and data from all JSPM lookups.
   var normalizedData = [];

   var topLevelPackages = [];

   for (var packageName in jspmPackageMap)
   {
      var normalizedPackage = parseNormalizedPackage(System, rootPath, packageName);

      // Save the normalized data.
      if (normalizedPackage !== null)
      {
         normalizedData.push(normalizedPackage);
         topLevelPackages.push(jspmPackageMap[packageName]);
      }
   }

   if (option.parseDependencies)
   {
      var childPackages = parseTopLevelDependencies(rootPath, topLevelPackages);

      for (var cntr = 0; cntr < childPackages.length; cntr++)
      {
         normalizedPackage = parseNormalizedPackage(System, rootPath, childPackages[cntr]);

         // Save the normalized data.
         if (normalizedPackage !== null)
         {
            normalizedData.push(normalizedPackage);
         }
      }
   }

   var packageData = normalizedData || [];
   var regex;

   // Process include paths -----------------------------------------------------------------------------------------

   // Include the source root of this repos code.
   var includes = ['^' + localSrcRoot];

   // Add the source roots of all associated jspm packages.
   for (cntr = 0; cntr < packageData.length; cntr++)
   {
      if (packageData[cntr].jspmPath)
      {
         includes.push('^' + packageData[cntr].jspmPath);
      }
   }

   ev.data.config.includes = includes;

   // Process code import replacements ------------------------------------------------------------------------------

   // Process all associated JSPM packages.
   for (cntr = 0; cntr < packageData.length; cntr++)
   {
      regex = new RegExp('from[\\s]+(\'|")' + packageData[cntr].normalizedPath, 'g');
      codeReplace.push({ from: regex, to: packageData[cntr].jspmFullPath });
   }

   // Process source code import replacements -----------------------------------------------------------------------

   // Create import replacements.
   var wrongImportBase = rootPackageName + path.sep + rootDir + path.sep;

   var wrongImport = wrongImportBase + localSrcRoot;
   var actualImport = rootPackageName + path.sep + localSrcRoot;

   importReplace.push({ from: wrongImport, to: actualImport });

   // Process all associated JSPM packages.
   for (cntr = 0; cntr < packageData.length; cntr++)
   {
      wrongImport = wrongImportBase + packageData[cntr].jspmPath;
      actualImport = packageData[cntr].normalizedPath;

      importReplace.push({ from: wrongImport, to: actualImport });
   }

   // Process HTML replacements -------------------------------------------------------------------------------------

   // Process all associated JSPM packages.
   for (cntr = 0; cntr < packageData.length; cntr++)
   {
      var actualPackageName = packageData[cntr].isAlias ? '(' + packageData[cntr].actualPackageName + '):<br>' : '';

      regex = new RegExp('>' + rootDir + path.sep + packageData[cntr].jspmPath, 'g');
      htmlReplace.push({ from: regex, to: '>' + actualPackageName + packageData[cntr].normalizedPath });

      regex = new RegExp('>' + packageData[cntr].jspmPath, 'g');
      htmlReplace.push({ from: regex, to: '>' + actualPackageName + packageData[cntr].normalizedPath });
   }

   // Process search index replacements -----------------------------------------------------------------------------

   // Process all associated JSPM packages.
   for (cntr = 0; cntr < packageData.length; cntr++)
   {
      var fromValue = rootDir + path.sep + packageData[cntr].jspmPath;
      searchReplace.push({ from: fromValue, to: packageData[cntr].normalizedPath });
   }
};

/**
 * For all imports in all source files replace any normalized JSPM package paths with the actual full path to the source
 * file in 'jspm_packages'.
 *
 * @param {object}   ev - Event from ESDoc containing data field.
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
            return 'from ' + p1 + codeReplace.to;
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

// Utility functions ------------------------------------------------------------------------------------------------

/**
 * Finds the rootPath to operate in from esdoc.config or defers to __dirname and parses it to find the rootPath.
 *
 * @param {object}   config - ESDoc config.
 * @returns {*}
 */
function findRootPath(config)
{
   // If the ESDoc config has a jspmRootPath entry then return it immediately after verification.
   if (config.hasOwnProperty('jspmRootPath'))
   {
      // Verify that a JSPM config.js file exists in target root path.
      if (!fs.existsSync(config.jspmRootPath + path.sep + 'config.js'))
      {
         if (!silent)
         {
            console.log("esdoc-plugin-jspm - Error: could not locate JSPM / SystemJS 'config.js'.");
         }
         throw new Error();
      }

      return config.jspmRootPath;
   }

   // __dirname is the `node_modules/esdoc-plugin-jspm/src` directory or in Travis CI `src/`
   var rootPath = __dirname;

   // The root path / parent below node_modules must be found.
   var splitDirPath = rootPath.split(path.sep);

   var esdocPluginDir, nodeModuleDir, pluginSrcDir;

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
         if (!fs.existsSync(rootPath + path.sep + 'config.js'))
         {
            if (!silent)
            {
               console.log("esdoc-plugin-jspm - Error: could not locate JSPM / SystemJS 'config.js'.");
            }
            throw new Error();
         }
      }
      else
      {
         if (!silent)
         {
            console.log('esdoc-plugin-jspm - Error: could not locate root package path.');
         }
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
         if (!fs.existsSync(rootPath + path.sep + 'config.js'))
         {
            if (!silent)
            {
               console.log("esdoc-plugin-jspm - Error: could not locate JSPM / SystemJS 'config.js'.");
            }
            throw new Error();
         }
      }
      else
      {
         if (!silent)
         {
            console.log('esdoc-plugin-jspm - Error: could not locate root package path.');
         }
         throw new Error();
      }
   }

   return rootPath;
}

/**
 * Loads the top level JSPM `config.js` configuration file.
 *
 * @param {string}   rootPath - Path to root of project.
 * @returns {object} parsed JSON.
 */
function parseJSPMConfig(rootPath)
{
   var vm = require('vm');

   // The location of the JSPM `config.js` configuration file.
   var jspmConfigPath = rootPath + path.sep + 'config.js';

   if (!fs.existsSync(jspmConfigPath))
   {
      console.error('Could not locate JSPM `config.js` at: ' + jspmConfigPath);
      throw new Error();
   }

   var buffer = fs.readFileSync(jspmConfigPath, 'utf8');

   var configObj;

   // Strip enclosing `System.config` wrapper.
   var match = (/System\.config\(([\s\S]*)\);/).exec(buffer);

   if (match !== null && match[1])
   {
      // Load buffer as object.
      configObj = vm.runInThisContext('object = ' + match[1]);
   }

   if (configObj === null || typeof configObj === 'undefined')
   {
      configObj = {};
   }

   return configObj;
}

/**
 * Parses the packageObj / top level package.json for the JSPM entry to index JSPM dependencies. If an existing
 * `jspmPackageMap` object hash exists then only the keys in that hash are resolved against `jspm.dependencies` entry
 * in `package.json`.
 *
 * @param {object}   packageObj     - package.json object
 * @param {object}   jspmPackageMap - optional predefined jspmPackageMap to limit dependency resolution.
 * @returns {*}
 */
function parsePackageJsonJSPMDependencies(packageObj, jspmPackageMap)
{
   // Return early if there is no `jspm` entry in `package.json`.
   if (typeof packageObj.jspm !== 'object')
   {
      if (!silent)
      {
         console.log('esdoc-plugin-jspm - Warning: could not locate `jspm.dependencies` entry in `package.json`.');
      }
      return jspmPackageMap || {};
   }

   // Return early if there is no `jspm.dependencies` entry in `package.json`.
   if (typeof packageObj.jspm.dependencies !== 'object')
   {
      if (!silent)
      {
         console.log('esdoc-plugin-jspm - Warning: could not locate `jspm.dependencies` entry in `package.json`.');
      }
      return jspmPackageMap || {};
   }

   // If an existing jspmPackageMap hash is passed in then only resolve dependencies entries in the hash.
   if (typeof jspmPackageMap === 'object')
   {
      for (var key in jspmPackageMap)
      {
         if (typeof packageObj.jspm.dependencies[key] !== 'undefined')
         {
            jspmPackageMap[key] = packageObj.jspm.dependencies[key];
         }
         else if (!silent)
         {
            console.log("esdoc-plugin-jspm - Warning: could not locate package '" + key
             + "' in `jspm.dependencies` entry in `package.json`.");
         }
      }
      return jspmPackageMap;
   }
   else
   {
      return packageObj.jspm.dependencies;
   }
}

/**
 * Attempts to normalize and parse a packageName returning `null` if it is an invalid package or an object hash
 * containing the parsed package details.
 *
 * @param {object}   System      - SystemJS Loader instance
 * @param {string}   rootPath    - Path to root of project.
 * @param {string}   packageName - Package name to normalize & parse.
 * @returns {*}
 */
function parseNormalizedPackage(System, rootPath, packageName)
{
   var result = null;

   // The normalized file URL from SystemJS Loader.
   var normalized = System.normalizeSync(packageName);

   // Any package name with an @ in the name is a dependent package like 'github:typhonjs/backbone-es6@master'.
   var isDependency = packageName.indexOf('@') >= 0;

   // Only process valid JSPM packages
   if (normalized.indexOf('jspm_packages') >= 0)
   {
      // Parse the file URL.
      var parsedPath = path.parse(url.parse(normalized).pathname);

      // Full path to the JSPM package
      var fullPath = parsedPath.dir + path.sep + parsedPath.name;

      // Relative path from the rootPath to the JSPM package.
      var relativePath = path.relative(rootPath, parsedPath.dir) + path.sep + parsedPath.name;

      try
      {
         var actualPackageName = parsedPath.name.split('@').shift();

         // Lookup JSPM package esdoc.json to pull out the source location.
         var packageESDocConfig = require(fullPath + path.sep + 'esdoc.json');

         // Verify that the JSPM package esdoc.json has a source entry.
         if (typeof packageESDocConfig.source !== 'string')
         {
            throw new Error("'esdoc.json' does not have a valid 'source' entry");
         }

         // Remove an leading local directory string
         var jspmSrcRoot = packageESDocConfig.source;
         jspmSrcRoot = jspmSrcRoot.replace(new RegExp('^\.' + (path.sep === '\\' ? '\\' + path.sep : path.sep)), '');

         // Add to the JSPM package relative path the location of the sources defined in it's esdoc.json config.
         relativePath += path.sep + jspmSrcRoot;

         // Add to the JSPM package full path the location of the sources defined in it's esdoc.json config.
         fullPath += path.sep + jspmSrcRoot;

         // Verify that the full path to the JSPM package source exists.
         if (!fs.existsSync(fullPath))
         {
            throw new Error("full path generated '" + fullPath + "' does not exist");
         }

         result =
         {
            packageName: isDependency ? actualPackageName : packageName,
            actualPackageName: actualPackageName,
            isDependency: isDependency,
            jspmFullPath: fullPath,
            jspmPath: relativePath,
            source: packageESDocConfig.source
         };

         result.isAlias = result.packageName !== actualPackageName;
         result.normalizedPath = result.packageName + path.sep + packageESDocConfig.source;

         if (!silent)
         {
            console.log("esdoc-plugin-jspm - Info: linked " + (result.isAlias ? "aliased" : "")
             + (result.isDependency ? "dependent" : "") + " JSPM package '" + result.packageName + "' to: "
              + relativePath);
         }
      }
      catch(err)
      {
         // Only emit errors if not auto-parsing JSPM `package.json` dependencies.
         if (!option.parseDependencies && !silent)
         {
            console.log("esdoc-plugin-jspm - " + err + " for JSPM package '" + packageName + "'");
         }
      }
   }
   else
   {
      if (!silent)
      {
         console.log("esdoc-plugin-jspm - Warning: skipping '" + packageName
          + "' as it does not appear to be a JSPM package.");
      }
   }

   return result;
}

/**
 * Resolves any potential package dependencies for the given list of top level packages against the root JSPM
 * `config.js` configuration file.
 *
 * @param {string}            rootPath - Path to root of project.
 * @param {Array<string>}     topLevelPackages - Array of top level package names.
 * @returns {Array<string>}
 */
function parseTopLevelDependencies(rootPath, topLevelPackages)
{
   // Load the root `config.js` and convert to a JSON object.
   var jspmConfig = parseJSPMConfig(rootPath);

   // Stores seen packages to eliminate duplicates.
   var seenPackages = {};

   // Child dependency package names.
   var childPackages = [];

   // Process top level packages.
   for (var cntr = 0; cntr < topLevelPackages.length; cntr++)
   {
      // Object hash of top level dependency.
      var packageDependency = jspmConfig.map[topLevelPackages[cntr]];

      // For each child dependency add the package name to `childPackages` if it has not been seen yet.
      for (var packageName in packageDependency)
      {
         if (typeof seenPackages[packageDependency[packageName]] === 'undefined')
         {
            childPackages.push(packageDependency[packageName]);
         }

         seenPackages[packageDependency[packageName]] = 1;
      }
   }

   // Traverse `childPackages` adding additional children dependencies if they have not been seen yet.
   for (cntr = 0; cntr < childPackages.length; cntr++)
   {
      packageDependency = jspmConfig.map[childPackages[cntr]];

      for (packageName in packageDependency)
      {
         if (typeof seenPackages[packageDependency[packageName]] === 'undefined')
         {
            childPackages.push(packageDependency[packageName]);
         }

         seenPackages[packageDependency[packageName]] = 1;
      }
   }

   return childPackages;
}