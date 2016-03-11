/**
 * esdoc-plugin-jspm -- Provides support for JSPM packages adding them to ESDoc based on path substitution allowing
 * end to end documentation when using SystemJS / JSPM. This plugin automatically parses the top level `package.json`
 * file for a `jspm.dependencies` entry and resolves any packages that contain a valid `.esdocrc` or `esdoc.json` file.
 *
 * Please refer to this repo that is using this plugin to generate documentation:
 * https://github.com/typhonjs/backbone-parse-es6-demo
 *
 * This is the .esdocrc configuration file for the above repo:
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
 * Each JSPM managed package must also have a valid `.esdocrc` or `esdoc.json` file at it's root that at minimum has a
 * `source` entry so that these sources may be included.
 *
 * Since ESDoc only works with one source root this plugin rewrites in `onHandleConfig` the source root to the parent
 * directory to `.` and builds an `includes` array that includes the original "source" value in addition to normalized
 * paths to the linked JSPM packages. Therefore be aware that you can not use "includes" in your esdoc configuration
 * file.
 *
 * An optional top level entry, `jspmRootPath` to the esdoc configuration file may define the JSPM root path; often this
 * is added programmatically IE `typhonjs-core-gulptasks` for instance. If `jspmRootPath` is not defined
 * `JSPMParser.getRootPath()` locates the root execution path. The root path is where the JSPM `package.json` is
 * located.
 *
 * In the `onHandleConfig` method below further construction of all resources necessary in code, import, and search
 * processing are constructed.
 */

import fs         from 'fs';
import path       from 'path';

import JSPMParser from 'typhonjs-config-jspm-parse';

import jspm       from 'jspm';   // Note: this could be dangerous for NPM < 3.0.

let packagePath = './package.json';

let docGitIgnore;
let docSearchScript;

// Stores option.packages converted into an object hash or the values from `jspm.dependencies` from `package.json`.
let jspmPackageMap;

// Stores all RegExp for JSPM packages to run against ES6 import statements.
const codeReplace = [];

// Stores all from -> to strings to replace to run against ES6 import statements.
const importReplace = [];

// Stores all RegExp for JSPM packages to run against generated HTML replacing non-normalized paths.
const htmlReplace = [];

// Stores all from -> to strings to replace for JSPM packages in generated search script data.
const searchReplace = [];

// Stores sanitized option map.
let option;

// Stores option that if true silences logging output.
let silent;

// ESDoc plugin callbacks -------------------------------------------------------------------------------------------

/**
 * Stores the option data from the plugin configuration and provides empty defaults as necessary.
 *
 * @param {object}   ev - Event from ESDoc containing data field.
 */
export function onStart(ev)
{
   option = ev.data.option || {};
   option.packages = option.packages || [];
   option.parseDependencies = option.parseDependencies || true;
   silent = option.silent || false;

   // Convert option.packages array to object literal w/ no mapped path.
   if (option.packages.length > 0)
   {
      jspmPackageMap = {};
      for (let cntr = 0; cntr < option.packages.length; cntr++)
      {
         jspmPackageMap[option.packages[cntr]] = null;
      }
   }
}

/**
 * Prepares additional config parameters for ESDoc. An all inclusive source root of "." is supplied, so an
 * "includes" array is constructed with all source roots for the local project and all associated jspm packages.
 *
 * Also all RegExp instances are created and stored for later usage.
 *
 * @param {object}   ev - Event from ESDoc containing data field.
 */
export function onHandleConfig(ev)
{
   if (ev.data.config.package)
   {
      packagePath = ev.data.config.package;
   }

   // Get package.json as ESDoc will prepend the name of the module found in the package.json
   let rootPackageName = undefined;

   try
   {
      const packageJSON = fs.readFileSync(packagePath, 'utf-8');
      const packageObj = JSON.parse(packageJSON);

      rootPackageName = packageObj.name;

      // If auto-parsing JSPM dependencies is enabled then analyze `package.json` for a `jspm.dependencies` entry.
      if (option.parseDependencies)
      {
         jspmPackageMap = JSPMParser.getPackageJSPMDependencies(packageObj, jspmPackageMap, silent,
          'esdoc-plugin-jspm');
      }
   }
   catch (err)
   {
      throw new Error(`Could not locate 'package.json' in package path '${packagePath}'.`);
   }

   // Store destination for sources, gitignore and create the path to <doc destination>/script/search_index.js
   const docDestination = ev.data.config.destination;
   docGitIgnore = `${docDestination}${path.sep}.gitignore`;
   docSearchScript = `${docDestination}${path.sep}script${path.sep}search_index.js`;

   // The source root is rewritten, so save the current value.
   let localSrcRoot = ev.data.config.source;

   ev.data.config.source = '.';

   const rootPath = ev.data.config.hasOwnProperty('jspmRootPath') ? ev.data.config.jspmRootPath :
    JSPMParser.getRootPath();

   const localSrcFullPath = rootPath + path.sep + localSrcRoot;

   if (!fs.existsSync(localSrcFullPath))
   {
      if (!silent)
      {
         console.log(`esdoc-plugin-jspm - Error: could not locate local source path: '${localSrcFullPath}'`);
      }
      throw new Error();
   }

   // Remove an leading local directory string
   localSrcRoot = localSrcRoot.replace(new RegExp(`^\.${path.sep === '\\' ? `\\${path.sep}` : path.sep}`), '');

   if (!silent)
   {
      console.log(`esdoc-plugin-jspm - Info: operating in root path: '${rootPath}'`);
      console.log(`esdoc-plugin-jspm - Info: linked local source root: '${localSrcRoot}'`);
   }

   // Set the package path to the local root where config.js is located.
   jspm.setPackagePath(rootPath);

   // Create SystemJS Loader
   const System = new jspm.Loader();

   // ESDoc uses the root directory name if no package.json with a package name exists.
   const rootDir = rootPath.split(path.sep).pop();

   rootPackageName = rootPackageName || rootDir;

   const packageResolver = JSPMParser.getPackageResolver(System);

   // Stores the normalized paths and data from all JSPM lookups.
   const normalizedData = [];
   const topLevelPackages = [];
   const duplicateCheck = {};

   for (const packageName in jspmPackageMap)
   {
      const normalizedPackage = JSPMParser.parseNormalizedPackage(System, packageName, rootPath, silent,
       'esdoc-plugin-jspm', s_PARSE_ESDOC_PACKAGE);

      // Save the normalized data.
      if (normalizedPackage !== null)
      {
         // Verify if a duplicate linked package has a different relative path; post warning if so.
         if (typeof duplicateCheck[normalizedPackage.packageName] === 'string')
         {
            if (duplicateCheck[normalizedPackage.packageName] !== normalizedPackage.relativePath)
            {
               console.log(`esdoc-plugin-jspm - Warning: Duplicate package '${normalizedPackage.packageName}' `
                + `linked to a different relative path '${normalizedPackage.relativePath}'.`);
            }
         }

         normalizedData.push(normalizedPackage);
         topLevelPackages.push(packageName);
         duplicateCheck[normalizedPackage.packageName] = normalizedPackage.relativePath;
      }
   }

   if (option.parseDependencies)
   {
      const childPackages = packageResolver.getUniqueDependencyList(topLevelPackages);

      for (let cntr = 0; cntr < childPackages.length; cntr++)
      {
         const normalizedPackage = JSPMParser.parseNormalizedPackage(System, childPackages[cntr], rootPath, silent,
          'esdoc-plugin-jspm', s_PARSE_ESDOC_PACKAGE);

         // Save the normalized data.
         if (normalizedPackage !== null)
         {
            // Verify if a duplicate linked package has a different relative path; post warning if so.
            if (typeof duplicateCheck[normalizedPackage.packageName] === 'string')
            {
               if (duplicateCheck[normalizedPackage.packageName] !== normalizedPackage.relativePath)
               {
                  console.log(`esdoc-plugin-jspm - Warning: Duplicate package '${normalizedPackage.packageName}' `
                   + `linked to a different relative path '${normalizedPackage.relativePath}'.`);
               }
            }

            normalizedData.push(normalizedPackage);
            duplicateCheck[normalizedPackage.packageName] = normalizedPackage.relativePath;
         }
      }
   }

   const packageData = normalizedData || [];
   let regex;

   // Process include paths -----------------------------------------------------------------------------------------

   // Include the source root of this repos code.
   const includes = [`^${localSrcRoot}`];

   // Add the source roots of all associated jspm packages.
   for (let cntr = 0; cntr < packageData.length; cntr++)
   {
      if (packageData[cntr].relativePath)
      {
         includes.push(`^${packageData[cntr].relativePath}`);
      }
   }

   ev.data.config.includes = includes;

   // Process code import replacements ------------------------------------------------------------------------------

   // Process all associated JSPM packages.
   for (let cntr = 0; cntr < packageData.length; cntr++)
   {
      regex = new RegExp(`from[\\s]+(\'|")${packageData[cntr].normalizedPath}`, 'g');
      codeReplace.push({ from: regex, to: packageData[cntr].fullPath });
   }

   // Process source code import replacements -----------------------------------------------------------------------

   // Create import replacements.
   const wrongImportBase = `${rootPackageName}${path.sep}${rootDir}${path.sep}`;

   let wrongImport = `${wrongImportBase}${localSrcRoot}`;
   let actualImport = `${rootPackageName}${path.sep}${localSrcRoot}`;

   importReplace.push({ from: wrongImport, to: actualImport });

   // Process all associated JSPM packages.
   for (let cntr = 0; cntr < packageData.length; cntr++)
   {
      wrongImport = wrongImportBase + packageData[cntr].relativePath;
      actualImport = packageData[cntr].normalizedPath;

      importReplace.push({ from: wrongImport, to: actualImport });
   }

   // Process HTML replacements -------------------------------------------------------------------------------------

   // Process all associated JSPM packages.
   for (let cntr = 0; cntr < packageData.length; cntr++)
   {
      const actualPackageName = packageData[cntr].isAlias ? `(${packageData[cntr].actualPackageName}):<br>` : '';

      regex = new RegExp(`>${rootDir}${path.sep}${packageData[cntr].relativePath}`, 'g');
      htmlReplace.push({ from: regex, to: `>${actualPackageName}${packageData[cntr].normalizedPath}` });

      regex = new RegExp(`>${packageData[cntr].relativePath}`, 'g');
      htmlReplace.push({ from: regex, to: `>${actualPackageName}${packageData[cntr].normalizedPath}` });
   }

   // Process search index replacements -----------------------------------------------------------------------------

   // Process all associated JSPM packages.
   for (let cntr = 0; cntr < packageData.length; cntr++)
   {
      const fromValue = rootDir + path.sep + packageData[cntr].relativePath;
      searchReplace.push({ from: fromValue, to: packageData[cntr].normalizedPath });
   }
}

/**
 * For all imports in all source files replace any normalized JSPM package paths with the actual full path to the source
 * file in 'jspm_packages'.
 *
 * @param {object}   ev - Event from ESDoc containing data field.
 */
export function onHandleCode(ev)
{
   for (let cntr = 0; cntr < codeReplace.length; cntr++)
   {
      (function(codeReplace)
      {
         // Must construct the replacement as either `'` or `"` can be used to surround the import statement.
         // `p1` is the quote format captured by the regex.
         ev.data.code = ev.data.code.replace(codeReplace.from, (match, p1) =>
         {
            return `from ${p1}${codeReplace.to}`;
         });
      })(codeReplace[cntr]);
   }
}

/**
 * Since the source root is "." / the base root of the repo ESDoc currently creates the wrong import path, so they
 * need to be corrected. ESDoc fabricates "<package name>/<base root>" when we want just "<package name>/" for the local
 * project code. For the JSPM packages the import statement is "<package name>/<base root>/<JSPM path>" where
 * the desired path is the just the normalized JSPM path to the associated package.
 *
 * @param {object}   ev - Event from ESDoc containing data field
 */
export function onHandleTag(ev)
{
   // Perform import replacement.
   for (let cntr = 0; cntr < ev.data.tag.length; cntr++)
   {
      const tag = ev.data.tag[cntr];

      if (tag.importPath)
      {
         for (let cntr2 = 0; cntr2 < importReplace.length; cntr2++)
         {
            tag.importPath = tag.importPath.replace(importReplace[cntr2].from, importReplace[cntr2].to);
         }
      }
   }
}

/**
 * The generated HTML also includes the full JSPM path, so various RegExp substitutions are run to transform the
 * full paths to the normalized JSPM package paths.
 *
 * @param {object}   ev - Event from ESDoc containing data field
 */
export function onHandleHTML(ev)
{
   for (let cntr = 0; cntr < htmlReplace.length; cntr++)
   {
      ev.data.html = ev.data.html.replace(htmlReplace[cntr].from, htmlReplace[cntr].to);
   }
}

/**
 * The search data file must have JSPM package paths replaced with normalized versions.
 */
export function onComplete()
{
   let buffer = fs.readFileSync(docSearchScript, 'utf8');

   // Remove the leading Javascript assignment so we are left with a JSON file.
   buffer = buffer.replace('window.esdocSearchIndex = ', '');

   const json = JSON.parse(buffer);

   // Replace all long JSPM paths with normalized paths.
   for (let cntr = 0; cntr < json.length; cntr++)
   {
      // Index 2 is the name of the entry.
      const entry = json[cntr];
      if (entry.length >= 2)
      {
         for (let cntr2 = 0; cntr2 < searchReplace.length; cntr2++)
         {
            entry[2] = entry[2].replace(searchReplace[cntr2].from, searchReplace[cntr2].to);
         }
      }
   }

   // Rewrite the search_index.js file
   buffer = `window.esdocSearchIndex = ${JSON.stringify(json, null, 2)}`;

   fs.writeFileSync(docSearchScript, buffer);

   // Create a `.gitignore` file that prevents checking in unnecessary ESDoc files like the AST and other generated
   // assets that are not necessary for viewing the docs. Also unprotects any jspm_packages directive from a
   // parent .gitignore as generated docs from JSPM packages will output to child directories with `jspm_packages`.
   const gitIgnore = '!jspm_packages\nast\ncoverage.json\ndump.json\npackage.json';
   fs.writeFileSync(docGitIgnore, gitIgnore);
}

// Utility functions ------------------------------------------------------------------------------------------------

/**
 * Defines the supported file names for ESDoc configuration file names.
 * @type {string[]}
 */
const s_ESDOC_CONFIG_NAMES = ['.esdocrc', 'esdoc.json'];

/**
 * Provides an additional parser for ESDoc JSPM packages when using `JSPMParser.normalizePackage`.
 *
 * @param {object}   result   - Existing JSPMParser parsed package results.
 * @param {boolean}  silent   - Optional boolean to suppress log output.
 * @param {string}   logTitle - Optional string to title log output.
 * @returns {*}
 */
const s_PARSE_ESDOC_PACKAGE = (result, silent, logTitle) =>
{
   let packageESDocConfig;
   let esdocFilename;

   // Lookup JSPM package ESDoc config file to pull out the source location.
   for (let cntr = 0; cntr < s_ESDOC_CONFIG_NAMES.length; cntr++)
   {
      esdocFilename = s_ESDOC_CONFIG_NAMES[cntr];
      try
      {
         packageESDocConfig = require(`${result.fullPath}${path.sep}${esdocFilename}`);
         break;
      }
      catch (err) { /* ... */ }
   }

   // Verify that the JSPM package esdoc configuration file has loaded otherwise return null to skip this package.
   if (typeof packageESDocConfig !== 'object')
   {
      return null;
   }

   // Verify that the JSPM package esdoc configuration file has a source entry.
   if (typeof packageESDocConfig.source !== 'string')
   {
      throw new Error(`'${esdocFilename}' does not have a valid 'source' entry`);
   }

   // Remove an leading local directory string
   let esdocSrcRoot = packageESDocConfig.source;

   esdocSrcRoot = esdocSrcRoot.replace(new RegExp(`^\.${path.sep === '\\' ? `\\${path.sep}` : path.sep}`), '');

   // Add to the JSPM package relative path the location of the sources defined in its esdoc.json config.
   result.relativePath += path.sep + esdocSrcRoot;

   // Add to the JSPM package full path the location of the sources defined in its esdoc.json config.
   result.fullPath += path.sep + esdocSrcRoot;

   // Provides the normalized JSPM package name + ESDoc source root.
   result.normalizedPath = result.packageName + path.sep + packageESDocConfig.source;

   // Verify that the full path to the JSPM package source exists.
   if (!fs.existsSync(result.fullPath))
   {
      throw new Error(`full path generated '${result.fullPath}' does not exist`);
   }

   if (!silent)
   {
      console.log(`${logTitle} - Info: linked ${result.isAlias ? "aliased " : ""}`
       + `${result.isDependency ? "dependent " : ""}JSPM package '${result.packageName}' to: ${result.relativePath}`);
   }

   return result;
};