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
 * an array listing the packages or aliased packages to link; likewise top level devDependencies can be limited with
 * `devPackages`:
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
 *             "devPackages": ["babel"]
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
 *
 * In the `onHandleTag` method below normalized JSPM package data is associated with all JSPM managed code and is
 * accessible with `tag.packageData`. Also a `relativePath` field is added to each tag for the associated file from
 * the root path.
 *
 * `esdoc-plugin-jspm` exports to `global.$$esdoc-plugin-jspm` an object hash of all related parsed data for JSPM
 * managed source code available via `typhonjs-config-jspm-parse`. The following is a synopsis of the exported data:
 * ```
 * global.$$esdoc_plugin_jspm =
 * {
 *    childPackageMap,        // All child packages parsed from System / config.js
 *    jspmDevPackageMap,      // Top level JSPM packages taken from options and / or package.json jspm.devDependencies.
 *    jspmPackageMap,         // Top level JSPM packages taken from options and / or package.json jspm.dependencies.
 *    normPackageData,        // Normalized package data for all JSPM managed packages.
 *    normPackageDataESDoc,   // Normalized package data for all ESDoc enabled JSPM managed packages.
 *    rootDir,                // Root directory name.
 *    rootPackageName,        // Root package name.
 *    rootPath,               // Root path
 *    topLevelPackages,       // All top level dependencies and dev dependencies.
 *    uniqueDeps,             // Unique package dependencies
 *    uniqueDevDeps,          // Unique package dev dependencies
 *    uniqueDepsAll           // All unique package dependencies
 * };
 * ```
 *
 * By exporting all of the parsed data to `global.$$esdoc-plugin-jspm` this allows any other ESDoc plugins which may
 * utilize JSPM data to access it without also having to separately parse this data in each plugin.
 */

'use strict';

import fs            from 'fs-extra';
import path          from 'path';

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
let options;

// ESDoc plugin callbacks -------------------------------------------------------------------------------------------

/**
 * Stores the option data from the plugin configuration and provides empty defaults as necessary.
 *
 * @param {object}   ev - Event from ESDoc containing data field.
 */
export function onStart(ev)
{
   options = ev.data.option || {};
   options.packages = Array.isArray(options.packages) ? options.packages : [];
   options.devPackages = Array.isArray(options.devPackages) ? options.devPackages : [];
   options.parseDependencies = typeof options.parseDependencies === 'boolean' ? options.parseDependencies : true;
   options.silent = typeof options.silent === 'boolean' ? options.silent : false;
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

   // Parse package data storing results in `global.$$esdoc_plugin_jspm`.
   packageParser(ev.data.config, options);

   // Retrieve required JSPM package and path data.
   const { normPackageData, normPackageDataESDoc, rootDir, rootPackageName, rootPath } = global.$$esdoc_plugin_jspm;

   const localSrcFullPath = rootPath + path.sep + localSrcRoot;

   if (!fs.existsSync(localSrcFullPath))
   {
      if (!options.silent)
      {
         console.log(`esdoc-plugin-jspm - Error: could not locate local source path: '${localSrcFullPath}'`);
      }
      throw new Error();
   }

   // Remove an leading local directory string
   localSrcRoot = localSrcRoot.replace(new RegExp(`^\.${path.sep === '\\' ? `\\${path.sep}` : path.sep}`), '');

   if (!options.silent)
   {
      console.log(`esdoc-plugin-jspm - Info: operating in root path: '${rootPath}'`);
      console.log(`esdoc-plugin-jspm - Info: linked local source root: '${localSrcRoot}'`);
   }

   let regex;

   // Process ast replacements --------------------------------------------------------------------------------------

   // Process all associated JSPM packages.
   for (let cntr = 0; cntr < normPackageData.length; cntr++)
   {
      regex = new RegExp(`^${normPackageData[cntr].packageName}${path.sep}`, 'g');
      astReplace.push({ from: regex, to: `${normPackageData[cntr].relativePath}${path.sep}` });

      if (normPackageData[cntr].hasMainEntry)
      {
         regex = new RegExp(`^${normPackageData[cntr].packageName}$`, 'g');
         astReplace.push({ from: regex, to: `${normPackageData[cntr].relativePathMain}` });
      }
   }

   // Process include paths -----------------------------------------------------------------------------------------

   // Include the source root of this repos code.
   const includes = [`^${localSrcRoot}`];

   // Add the source roots of all associated jspm packages.
   for (let cntr = 0; cntr < normPackageDataESDoc.length; cntr++)
   {
      if (normPackageDataESDoc[cntr].relativePath)
      {
         includes.push(`^${normPackageDataESDoc[cntr].relativePath}`);
      }
   }

   ev.data.config.includes = includes;

   // Process code import replacements ------------------------------------------------------------------------------

   // Process all associated JSPM packages.
   for (let cntr = 0; cntr < normPackageDataESDoc.length; cntr++)
   {
      regex = new RegExp(`from[\\s]+(\'|")${normPackageDataESDoc[cntr].normalizedPath}`, 'g');
      codeReplace.push({ from: regex, to: normPackageDataESDoc[cntr].fullPath });
   }

   // Process source code import replacements -----------------------------------------------------------------------

   // Create import replacements.
   const wrongImportBase = `${rootPackageName}${path.sep}${rootDir}${path.sep}`;

   let wrongImport = `${wrongImportBase}${localSrcRoot}`;
   let actualImport = `${rootPackageName}${path.sep}${localSrcRoot}`;

   importReplace.push({ from: wrongImport, to: actualImport });

   // Process all associated JSPM packages.
   for (let cntr = 0; cntr < normPackageDataESDoc.length; cntr++)
   {
      wrongImport = wrongImportBase + normPackageDataESDoc[cntr].relativePath;
      actualImport = normPackageDataESDoc[cntr].normalizedPath;

      importReplace.push({ from: wrongImport, to: actualImport });
   }

   // Process HTML replacements -------------------------------------------------------------------------------------

   // Process all associated JSPM packages.
   for (let cntr = 0; cntr < normPackageDataESDoc.length; cntr++)
   {
      const actualPackageName = normPackageDataESDoc[cntr].isAlias ?
       `(${normPackageDataESDoc[cntr].actualPackageName}):<br>` : '';

      regex = new RegExp(`>${rootDir}${path.sep}${normPackageDataESDoc[cntr].relativePath}`, 'g');
      htmlReplace.push({ from: regex, to: `>${actualPackageName}${normPackageDataESDoc[cntr].normalizedPath}` });

      regex = new RegExp(`>${normPackageDataESDoc[cntr].relativePath}`, 'g');
      htmlReplace.push({ from: regex, to: `>${actualPackageName}${normPackageDataESDoc[cntr].normalizedPath}` });
   }

   // Process search index replacements -----------------------------------------------------------------------------

   // Process all associated JSPM packages.
   for (let cntr = 0; cntr < normPackageDataESDoc.length; cntr++)
   {
      const fromValue = rootDir + path.sep + normPackageDataESDoc[cntr].relativePath;
      searchReplace.push({ from: fromValue, to: normPackageDataESDoc[cntr].normalizedPath });
   }
}

/**
 * Forthcoming support for AST modification for 0.7.0 release of `esdoc-plugin-jspm`.
 *
 * For all imports in all source files replace any normalized JSPM package paths with the relative path to the source
 * file in 'jspm_packages'.
 *
 * @param {object}   ev - Event from ESDoc containing data field.
 */
// export function onHandleAST(ev)
// {
//    const relativePath = path.relative(rootPath, ev.data.filePath);
//    const relativeDir = relativePath.slice(0, relativePath.lastIndexOf(path.sep))
//
//    console.log('!! EPJ - onHandleAST - relativeDir: ' + relativeDir +'; relativePath: ' + relativePath);
//
//    ASTUtil.traverse(ev.data.ast, (node, parent) =>
//    {
//       if (node.type === 'ImportDeclaration' && node.source)
//       {
//          if (node.source.value)
//          {
//             console.log('!! EPJ - onHandleAST - node: ' + JSON.stringify(node));
//
//             for (let cntr = 0; cntr < astReplace.length; cntr++)
//             {
//                if (astReplace[cntr].from.test(node.source.value))
//                {
//                   // Get relative path from current source directory to replace path; note that any trailing path
//                   // separator is dropped and must be added to the calculated path.
//                   const replacePath = path.relative(relativeDir, astReplace[cntr].to)
//                    + (astReplace[cntr].to.endsWith(path.sep) ? path.sep : '');
//
//                   console.log('!! EPJ - onHandleAST - found node.source.value: ' + node.source.value + '; replacePath: ' + replacePath);
//
//                   node.source.isModified = true;
//
//                   node.source.originalValue = node.source.value
//
//                   node.source.value = node.source.value.replace(astReplace[cntr].from, replacePath);
//
//                   if (node.source.raw)
//                   {
//                      node.source.raw = `'${node.source.value}'`
//                      node.source.originalRaw = `'${node.source.originalValue}'`
//                   }
//                }
//             }
//
//             // Set isModified to false if not replacement occurred.
//             if (typeof node.source.isModified !== 'boolean') { node.source.isModified = false; }
//          }
//       }
//    });
// }

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
 * Adds to all tags the relative path for each associated file from the root directory in addition to any associated
 * JSPM normalized package data.
 *
 * Since the source root is "." / the base root of the repo ESDoc currently creates the wrong import path, so they
 * need to be corrected. ESDoc fabricates "<package name>/<base root>" when we want just "<package name>/" for the local
 * project code. For the JSPM packages the import statement is "<package name>/<base root>/<JSPM path>" where
 * the desired path is the just the normalized JSPM path to the associated package.
 *
 * @param {object}   ev - Event from ESDoc containing data field
 */
export function onHandleTag(ev)
{
   const { normPackageData } = global.$$esdoc_plugin_jspm;

   // Perform import replacement.
   for (let cntr = 0; cntr < ev.data.tag.length; cntr++)
   {
      const tag = ev.data.tag[cntr];

      // Add relativePath to all tags if it doesn't exist already.
      if (typeof tag.relativePath !== 'string')
      {
         tag.relativePath = tag.longname.split('~')[0].replace(/^.*?[/]/, '');
      }

      // Associate JSPM package data to tag.
      // TODO: This is a potential performance issue with many tags and many packages.
      if (tag.relativePath.startsWith('jspm_packages'))
      {
         tag.packageManager = 'jspm';

         for (let cntr2 = 0; cntr2 < normPackageData.length; cntr2++)
         {
            const packageData = normPackageData[cntr2];
            if (tag.relativePath.startsWith(packageData.relativePath)) { tag.packageData = packageData; break; }
         }
      }

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