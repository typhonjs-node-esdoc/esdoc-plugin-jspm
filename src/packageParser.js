'use strict';

import fs         from 'fs-extra';
import path       from 'path';

import JSPMParser from 'typhonjs-config-jspm-parse';

import jspm       from 'jspm';   // Note: this could be dangerous for NPM < 3.0.

let packagePath = './package.json';

/**
 * Parses the JSPM / SystemJS runtime for package information returning a version with all package data, all packages
 * with valid ESDoc config files and the root package name from `package.json` or the actual root directory name.
 *
 * @param {object}   config - ESDoc configuration.
 * @param {object}   options - Optional parameters from plugin instance.
 *
 * @returns {{normPackageData: Array, normPackageDataESDoc: Array, rootPackageName: (*|T)}}
 */
export default function packageParser(config, options)
{
   const rootPath = config.hasOwnProperty('jspmRootPath') ? config.jspmRootPath :
    JSPMParser.getRootPath();

   // Set the package path to the local root where config.js is located.
   jspm.setPackagePath(rootPath);

   // Stores options.packages converted into an object hash or the values from `jspm.dependencies` from `package.json`.
   let jspmPackageMap;

   // Stores options.devPackages converted into an object hash or the values from `jspm.devDependencies` from
   // `package.json`.
   let jspmDevPackageMap;

   // Get package.json as ESDoc will prepend the name of the module found in the package.json
   let rootPackageName;

   // Convert options.packages array to object literal w/ no mapped path.
   if (options.packages.length > 0)
   {
      jspmPackageMap = {};
      for (let cntr = 0; cntr < options.packages.length; cntr++)
      {
         jspmPackageMap[options.packages[cntr]] = null;
      }
   }

   // Convert options.packages array to object literal w/ no mapped path.
   if (options.devPackages.length > 0)
   {
      jspmDevPackageMap = {};
      for (let cntr = 0; cntr < options.devPackages.length; cntr++)
      {
         jspmDevPackageMap[options.devPackages[cntr]] = null;
      }
   }

   // If the ESDoc configuration file has a package path specified then use it.
   if (config.package) { packagePath = config.package; }

   try
   {
      const packageJSON = fs.readFileSync(packagePath, 'utf-8');
      const packageObj = JSON.parse(packageJSON);

      rootPackageName = packageObj.name;

      // If auto-parsing JSPM dependencies is enabled then analyze `package.json` for a `jspm.dependencies` entry.
      if (options.parseDependencies)
      {
         jspmPackageMap = JSPMParser.getPackageJSPMDependencies(packageObj, jspmPackageMap, options.silent,
          'esdoc-plugin-jspm');

         jspmDevPackageMap = JSPMParser.getPackageJSPMDevDependencies(packageObj, jspmDevPackageMap, options.silent,
          'esdoc-plugin-jspm');
      }
   }
   catch (err)
   {
      throw new Error(`Could not locate 'package.json' in package path '${packagePath}'.`);
   }

   // Filter package maps so that they only include NPM / GitHub packages.
   jspmPackageMap = s_FILTER_PACKAGE_MAP(jspmPackageMap);
   jspmDevPackageMap = s_FILTER_PACKAGE_MAP(jspmDevPackageMap);

   // ESDoc uses the root directory name if no package.json with a package name exists.
   const rootPathSplit = rootPath.split(path.sep);

   let rootDirName = rootPathSplit.pop();

   // If rootPath ends with the path separator pop one more level down.
   if (rootDirName === '') { rootDirName = rootPathSplit.pop(); }

   rootPackageName = rootPackageName || rootDirName;

   // Create SystemJS Loader
   const System = new jspm.Loader();

   const packageResolver = JSPMParser.getPackageResolver(System);

   // Stores the normalized paths and data from all JSPM lookups.
   const normalizedData = [];
   const parseTopLevelPackages = [];
   const duplicateCheck = {};

   const normalizedDataESDoc = [];
   const parseTopLevelPackagesESDoc = [];
   const duplicateCheckESDoc = {};

   for (const packageName in jspmPackageMap)
   {
      const normalizedPackage = JSPMParser.parseNormalizedPackage(System, packageName, rootPath, options.silent,
       'esdoc-plugin-jspm');

      // Save the normalized data.
      if (normalizedPackage !== null)
      {
         // Verify if a duplicate linked package has a different relative path; post warning if so.
         if (typeof duplicateCheck[normalizedPackage.packageName] === 'string')
         {
            if (!options.silent && duplicateCheck[normalizedPackage.packageName] !== normalizedPackage.relativePath)
            {
               console.log(`esdoc-plugin-jspm - Warning: Duplicate package '${normalizedPackage.packageName}' `
                + `linked to a different relative path '${normalizedPackage.relativePath}'.`);
            }
         }

         normalizedData.push(normalizedPackage);
         parseTopLevelPackages.push(packageName);
         duplicateCheck[normalizedPackage.packageName] = normalizedPackage.relativePath;
      }

      const normalizedPackageESDoc = JSPMParser.parseNormalizedPackage(System, packageName, rootPath, options.silent,
       'esdoc-plugin-jspm', s_PARSE_ESDOC_PACKAGE);

      // Save the normalized ESDoc data.
      if (normalizedPackageESDoc !== null)
      {
         // Verify if a duplicate linked package has a different relative path; post warning if so.
         if (typeof duplicateCheckESDoc[normalizedPackageESDoc.packageName] === 'string')
         {
            if (!options.silent &&
             duplicateCheckESDoc[normalizedPackageESDoc.packageName] !== normalizedPackageESDoc.relativePath)
            {
               console.log(`esdoc-plugin-jspm - Warning: Duplicate package '${normalizedPackageESDoc.packageName}' `
                + `linked to a different relative path '${normalizedPackageESDoc.relativePath}'.`);
            }
         }

         normalizedDataESDoc.push(normalizedPackageESDoc);
         parseTopLevelPackagesESDoc.push(packageName);
         duplicateCheckESDoc[normalizedPackageESDoc.packageName] = normalizedPackageESDoc.relativePath;
      }
   }

   if (options.parseDependencies)
   {
      const childPackages = packageResolver.getUniqueDependencyList(parseTopLevelPackages);

      for (let cntr = 0; cntr < childPackages.length; cntr++)
      {
         const normalizedPackage = JSPMParser.parseNormalizedPackage(System, childPackages[cntr], rootPath,
          options.silent, 'esdoc-plugin-jspm');

         // Save the normalized data.
         if (normalizedPackage !== null)
         {
            // Verify if a duplicate linked package has a different relative path; post warning if so.
            if (typeof duplicateCheck[normalizedPackage.packageName] === 'string')
            {
               if (!options.silent &&
                duplicateCheck[normalizedPackage.packageName] !== normalizedPackage.relativePath)
               {
                  console.log(`esdoc-plugin-jspm - Warning: Duplicate package '${normalizedPackage.packageName}' `
                   + `linked to a different relative path '${normalizedPackage.relativePath}'.`);
               }
            }

            normalizedData.push(normalizedPackage);
            duplicateCheck[normalizedPackage.packageName] = normalizedPackage.relativePath;
         }
      }

      const childPackagesESDoc = packageResolver.getUniqueDependencyList(parseTopLevelPackagesESDoc);

      for (let cntr = 0; cntr < childPackagesESDoc.length; cntr++)
      {
         const normalizedPackageESDoc = JSPMParser.parseNormalizedPackage(System, childPackagesESDoc[cntr], rootPath,
          options.silent, 'esdoc-plugin-jspm', s_PARSE_ESDOC_PACKAGE);

         // Save the normalized data.
         if (normalizedPackageESDoc !== null)
         {
            // Verify if a duplicate linked package has a different relative path; post warning if so.
            if (typeof duplicateCheckESDoc[normalizedPackageESDoc.packageName] === 'string')
            {
               if (!options.silent &&
                duplicateCheckESDoc[normalizedPackageESDoc.packageName] !== normalizedPackageESDoc.relativePath)
               {
                  console.log(`esdoc-plugin-jspm - Warning: Duplicate package '${normalizedPackageESDoc.packageName}' `
                   + `linked to a different relative path '${normalizedPackageESDoc.relativePath}'.`);
               }
            }

            normalizedDataESDoc.push(normalizedPackageESDoc);
            duplicateCheckESDoc[normalizedPackageESDoc.packageName] = normalizedPackageESDoc.relativePath;
         }
      }
   }

   const normPackageData = normalizedData || [];
   const normPackageDataESDoc = normalizedDataESDoc || [];

   const uniqueDeps = packageResolver.getUniqueDependencyList(Object.keys(jspmPackageMap));
   const uniqueDevDeps = packageResolver.getUniqueDependencyList(Object.keys(jspmDevPackageMap));
   const uniqueDepsAll = packageResolver.getUniqueDependencyList();

   const topLevelPackages = s_FILTER_PACKAGE_MAP(packageResolver.topLevelPackages);
   const childPackageMap = packageResolver.childPackageMap;

   global.$$esdoc_plugin_jspm =
   {
      childPackageMap,        // All child packages parsed from System / config.js
      jspmDevPackageMap,      // Top level JSPM packages taken from options and / or package.json jspm.devDependencies.
      jspmPackageMap,         // Top level JSPM packages taken from options and / or package.json jspm.dependencies.
      normPackageData,        // Normalized package data for all JSPM managed packages.
      normPackageDataESDoc,   // Normalized package data for all ESDoc enabled JSPM managed packages.
      rootDirName,            // Root directory name.
      rootPackageName,        // Root package name.
      rootPath,               // Root path
      topLevelPackages,       // All top level dependencies and dev dependencies.
      uniqueDeps,             // Unique package dependencies
      uniqueDevDeps,          // Unique package dev dependencies
      uniqueDepsAll           // All unique package dependencies
   };

   return global.$$esdoc_plugin_jspm;
}

// Utility functions ------------------------------------------------------------------------------------------------

/**
 * Defines the supported file names for ESDoc configuration file names.
 * @type {string[]}
 */
const s_ESDOC_CONFIG_NAMES = ['.esdocrc', 'esdoc.json'];

/**
 * Filters a package map copying over to output only NPM or GitHub packages.
 *
 * @param {object}   packageMap - Package map to filter.
 * @param {object}   output - An optional output map.
 * @returns {{}}
 */
const s_FILTER_PACKAGE_MAP = (packageMap, output = {}) =>
{
   for (const key in packageMap)
   {
      const value = packageMap[key];
      if (value.startsWith('npm:') || value.startsWith('github:')) { output[key] = value; }
   }

   return output;
};

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
         const packageJSON = fs.readFileSync(`${result.fullPath}${path.sep}${esdocFilename}`, 'utf-8');
         packageESDocConfig = JSON.parse(packageJSON);
      }
      catch (err) { /* ... */ }

      if (typeof packageESDocConfig !== 'undefined') { break; }
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