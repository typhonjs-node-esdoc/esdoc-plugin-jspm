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

'use strict';

import fs            from 'fs-extra';
import path          from 'path';

import JSPMParser    from 'typhonjs-config-jspm-parse';

import packageParser from './packageParser.js';

let docGitIgnore;
let docSearchScript;

// Stores all RegExp for JSPM packages to run against generated AST.
const astReplace = [];

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
   option.silent = option.silent || false;
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
      if (!option.silent)
      {
         console.log(`esdoc-plugin-jspm - Error: could not locate local source path: '${localSrcFullPath}'`);
      }
      throw new Error();
   }

   // Remove an leading local directory string
   localSrcRoot = localSrcRoot.replace(new RegExp(`^\.${path.sep === '\\' ? `\\${path.sep}` : path.sep}`), '');

   if (!option.silent)
   {
      console.log(`esdoc-plugin-jspm - Info: operating in root path: '${rootPath}'`);
      console.log(`esdoc-plugin-jspm - Info: linked local source root: '${localSrcRoot}'`);
   }

   // ESDoc uses the root directory name if no package.json with a package name exists.
   const rootDir = rootPath.split(path.sep).pop();

   const { allPackageData, allPackageDataESDoc, rootPackageName } = packageParser(ev.data.config, option);

   let regex;

   // Process ast replacements --------------------------------------------------------------------------------------

   // Process all associated JSPM packages.
   for (let cntr = 0; cntr < allPackageData.length; cntr++)
   {
      regex = new RegExp(`^${allPackageData[cntr].packageName}${path.sep}`, 'g');
      astReplace.push({ from: regex, to: `${allPackageData[cntr].relativePath}${path.sep}` });

      if (allPackageData[cntr].hasMainEntry)
      {
         regex = new RegExp(`^${allPackageData[cntr].packageName}$`, 'g');
         astReplace.push({ from: regex, to: `${allPackageData[cntr].relativePathMain}` });
      }
   }

   // Process include paths -----------------------------------------------------------------------------------------

   // Include the source root of this repos code.
   const includes = [`^${localSrcRoot}`];

   // Add the source roots of all associated jspm packages.
   for (let cntr = 0; cntr < allPackageDataESDoc.length; cntr++)
   {
      if (allPackageDataESDoc[cntr].relativePath)
      {
         includes.push(`^${allPackageDataESDoc[cntr].relativePath}`);
      }
   }

   ev.data.config.includes = includes;

   // Process code import replacements ------------------------------------------------------------------------------

   // Process all associated JSPM packages.
   for (let cntr = 0; cntr < allPackageDataESDoc.length; cntr++)
   {
      regex = new RegExp(`from[\\s]+(\'|")${allPackageDataESDoc[cntr].normalizedPath}`, 'g');
      codeReplace.push({ from: regex, to: allPackageDataESDoc[cntr].fullPath });
   }

   // Process source code import replacements -----------------------------------------------------------------------

   // Create import replacements.
   const wrongImportBase = `${rootPackageName}${path.sep}${rootDir}${path.sep}`;

   let wrongImport = `${wrongImportBase}${localSrcRoot}`;
   let actualImport = `${rootPackageName}${path.sep}${localSrcRoot}`;

   importReplace.push({ from: wrongImport, to: actualImport });

   // Process all associated JSPM packages.
   for (let cntr = 0; cntr < allPackageDataESDoc.length; cntr++)
   {
      wrongImport = wrongImportBase + allPackageDataESDoc[cntr].relativePath;
      actualImport = allPackageDataESDoc[cntr].normalizedPath;

      importReplace.push({ from: wrongImport, to: actualImport });
   }

   // Process HTML replacements -------------------------------------------------------------------------------------

   // Process all associated JSPM packages.
   for (let cntr = 0; cntr < allPackageDataESDoc.length; cntr++)
   {
      const actualPackageName = allPackageDataESDoc[cntr].isAlias ?
       `(${allPackageDataESDoc[cntr].actualPackageName}):<br>` : '';

      regex = new RegExp(`>${rootDir}${path.sep}${allPackageDataESDoc[cntr].relativePath}`, 'g');
      htmlReplace.push({ from: regex, to: `>${actualPackageName}${allPackageDataESDoc[cntr].normalizedPath}` });

      regex = new RegExp(`>${allPackageDataESDoc[cntr].relativePath}`, 'g');
      htmlReplace.push({ from: regex, to: `>${actualPackageName}${allPackageDataESDoc[cntr].normalizedPath}` });
   }

   // Process search index replacements -----------------------------------------------------------------------------

   // Process all associated JSPM packages.
   for (let cntr = 0; cntr < allPackageDataESDoc.length; cntr++)
   {
      const fromValue = rootDir + path.sep + allPackageDataESDoc[cntr].relativePath;
      searchReplace.push({ from: fromValue, to: allPackageDataESDoc[cntr].normalizedPath });
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