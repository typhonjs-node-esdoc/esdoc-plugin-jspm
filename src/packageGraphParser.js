import _       from 'underscore';

import Utils   from './Utils.js';

const packageLinksAll = [];
const packageLinksDev = [];
const packageLinksMain = [];

const packageNodesAll = [];
const packageNodesDev = [];
const packageNodesMain = [];

const packageNodeMapAll = new Map();
const packageNodeMapDev = new Map();
const packageNodeMapMain = new Map();

/**
 * Creates a graph of JSPM package dependencies outputting a hash including max depth level and arrays of nodes / links.
 *
 * @param {object}   options -
 */
export default function packageGraphParser(options)
{
   const { jspmDevPackageMap, jspmPackageMap, normPackageDataAll, rootPackageName, topLevelPackages } =
    global.$$esdoc_plugin_jspm;

   let currentDepth = 0;

   if (rootPackageName)
   {
      const packageData =
      {
         actualPackageName: rootPackageName,
         packageName: rootPackageName,
         version: 'master',
         isAlias: false,
         jspmType: 'root'
      };

      let index = packageNodesAll.length;
      const objectID = `root-${rootPackageName}-master`;

      let object = { id: objectID, minLevel: currentDepth, packageScope: 'all', packageData, fixed: false, index };
      packageNodesAll.push(object);
      packageNodeMapAll.set(objectID, object);

      index = packageNodesMain.length;
      object = { id: objectID, minLevel: currentDepth, packageScope: 'main', packageData, fixed: false, index };
      packageNodesMain.push(object);
      packageNodeMapMain.set(objectID, object);

      index = packageNodesDev.length;
      object = { id: objectID, minLevel: currentDepth, packageScope: 'dev', packageData, fixed: false, index };
      packageNodesDev.push(object);
      packageNodeMapDev.set(objectID, object);

      currentDepth++;
   }

   // Parse top level packages
   for (const key in topLevelPackages)
   {
      const fullPackage = topLevelPackages[key];
      const objectID = Utils.sanitizePackageID(fullPackage);
      const packageData = normPackageDataAll[objectID];

      s_CORRECT_ALIASED_NAME(objectID, key);

      if (typeof jspmPackageMap[key] === 'undefined' && typeof jspmDevPackageMap[key] === 'undefined')
      {
         throw new Error(`esdoc-plugin-dependency-graphs: unknown top level package: ${key}`);
      }

      let index = packageNodesAll.length;
      let object = { id: objectID, minLevel: currentDepth, packageScope: 'all', packageData, fixed: false, index };

      if (!packageNodeMapAll.has(objectID))
      {
         if (options.verbose)
         {
            console.log(
             `esdoc-plugin-jspm: packageGraphParser - adding top level (all) node: ${JSON.stringify(object)}`);
         }
         packageNodesAll.push(object);
         packageNodeMapAll.set(objectID, object);

         // If currentDepth is greater than 0 then there is a top level root node, so add a link.
         if (currentDepth > 0) { packageLinksAll.push({ source: 0, target: index, minLevel: currentDepth }); }
      }

      if (typeof jspmPackageMap[key] !== 'undefined')
      {
         index = packageNodesMain.length;
         object = { id: objectID, minLevel: currentDepth, packageScope: 'main', packageData, fixed: false, index };

         if (!packageNodeMapMain.has(objectID))
         {
            if (options.verbose)
            {
               console.log(
                `esdoc-plugin-jspm: packageGraphParser - adding top level (dev) node: ${JSON.stringify(object)}`);
            }

            packageNodesMain.push(object);
            packageNodeMapMain.set(objectID, object);

            // If currentDepth is greater than 0 then there is a top level root node, so add a link.
            if (currentDepth > 0) { packageLinksMain.push({ source: 0, target: index, minLevel: currentDepth }); }
         }
      }

      if (typeof jspmDevPackageMap[key] !== 'undefined')
      {
         index = packageNodesDev.length;
         object = { id: objectID, minLevel: currentDepth, packageScope: 'dev', packageData, fixed: false, index };

         if (!packageNodeMapDev.has(objectID))
         {
            if (options.verbose)
            {
               console.log(
                `esdoc-plugin-jspm: packageGraphParser - adding top level (main) node: ${JSON.stringify(object)}`);
            }

            packageNodesDev.push(object);
            packageNodeMapDev.set(objectID, object);

            // If currentDepth is greater than 0 then there is a top level root node, so add a link.
            if (currentDepth > 0) { packageLinksDev.push({ source: 0, target: index, minLevel: currentDepth }); }
         }
      }
   }

   if (options.verbose)
   {
      console.log('esdoc-plugin-jspm: packageGraphParser --- parsing top level all dependencies');
   }

   currentDepth++;

   // Recursively parse all dependencies
   s_DEPTH_TRAVERSAL_NODES(_.clone(packageNodesAll), packageNodesAll, packageNodeMapAll, packageLinksAll, 'all',
    currentDepth, options);

   if (options.verbose)
   {
      console.log('esdoc-plugin-jspm: packageGraphParser --- parsing top level dev dependencies');
   }

   // Recursively parse dev dependencies
   s_DEPTH_TRAVERSAL_NODES(_.clone(packageNodesDev), packageNodesDev, packageNodeMapDev, packageLinksDev, 'dev',
    currentDepth, options);

   if (options.verbose)
   {
      console.log('esdoc-plugin-jspm: packageGraphParser --- parsing top level main dependencies');
   }

   // Recursively parse main dependencies
   s_DEPTH_TRAVERSAL_NODES(_.clone(packageNodesMain), packageNodesMain, packageNodeMapMain, packageLinksMain, 'main',
    currentDepth, options);

   global.$$esdoc_plugin_jspm_package_graph = {};

   // Determine max package level for `all` category.
   let maxPackageLevel = 0;
   packageNodesAll.forEach((node) => { if (node.minLevel > maxPackageLevel) { maxPackageLevel = node.minLevel; } });
   packageLinksAll.forEach((link) => { if (link.minLevel > maxPackageLevel) { maxPackageLevel = link.minLevel; } });

   global.$$esdoc_plugin_jspm_package_graph.packageGraphAll =
   {
      maxLevel: maxPackageLevel,
      nodes: packageNodesAll,
      links: packageLinksAll
   };

   // Determine max package level for `dev` category.
   maxPackageLevel = 0;
   packageNodesDev.forEach((node) => { if (node.minLevel > maxPackageLevel) { maxPackageLevel = node.minLevel; } });
   packageLinksDev.forEach((link) => { if (link.minLevel > maxPackageLevel) { maxPackageLevel = link.minLevel; } });

   global.$$esdoc_plugin_jspm_package_graph.packageGraphDev =
   {
      maxLevel: maxPackageLevel,
      nodes: packageNodesDev,
      links: packageLinksDev
   };

   // Determine max package level for `main` category.
   maxPackageLevel = 0;
   packageNodesMain.forEach((node) => { if (node.minLevel > maxPackageLevel) { maxPackageLevel = node.minLevel; } });
   packageLinksMain.forEach((link) => { if (link.minLevel > maxPackageLevel) { maxPackageLevel = link.minLevel; } });

   global.$$esdoc_plugin_jspm_package_graph.packageGraphMain =
   {
      maxLevel: maxPackageLevel,
      nodes: packageNodesMain,
      links: packageLinksMain
   };
}

// Provides a recursive function traversing package dependencies.
const s_DEPTH_TRAVERSAL_NODES = (packageDeps, packageNodes, packageNodeMap, packageLinks, packageScope, depth,
                                 options) =>
{
   const { childPackageMap, normPackageDataAll } = global.$$esdoc_plugin_jspm;

   const nextLevelPackages = [];

   for (let cntr = 0; cntr < packageDeps.length; cntr++)
   {
      const packageDep = packageDeps[cntr];

      if (options.verbose)
      {
         console.log(`esdoc-plugin-dependency-graphs: s_DEPTH_TRAVERSAL_NODES - depth: ${depth}; packageDep.index: `
          + `${packageDep.index}; dep: ${JSON.stringify(packageDep)}`);
      }

      const childDepMap = childPackageMap[packageDep.packageData.fullPackage];

      if (typeof childDepMap === 'undefined')
      {
         continue;
      }

      // Parse top level packages
      for (const key in childDepMap)
      {
         const fullPackage = childDepMap[key];
         const index = packageNodes.length;
         const objectID = Utils.sanitizePackageID(fullPackage);
         const packageData = normPackageDataAll[objectID];

         s_CORRECT_ALIASED_NAME(objectID, key);

         const newNode = { id: objectID, minLevel: depth, packageScope, packageData, fixed: false, index };

         if (!packageNodeMap.has(objectID))
         {
            nextLevelPackages.push(newNode);

            if (options.verbose)
            {
               console.log(
                `esdoc-plugin-dependency-graphs: s_DEPTH_TRAVERSAL_NODES - depth: ' + depth + '; adding node: `
                + `${JSON.stringify(newNode)}`);
            }

            packageNodes.push(newNode);
            packageNodeMap.set(objectID, newNode);

            packageLinks.push({ source: packageDep.index, target: index, minLevel: depth });
         }
         else
         {
            // Update min level if current depth is greater than stored depth
            const existingNode = packageNodeMap.get(objectID);

            if (existingNode && newNode.minLevel < existingNode.minLevel)
            {
               existingNode.minLevel = newNode.minLevel;

               if (options.verbose)
               {
                  console.log(
                   `esdoc-plugin-dependency-graphs: s_DEPTH_TRAVERSAL_NODES - depth: ${depth}; updating min level: `
                   + `${JSON.stringify(existingNode)}`);
               }
            }

            packageLinks.push({ source: packageDep.index, target: existingNode.index, minLevel: depth });
         }
      }
   }

   if (nextLevelPackages.length > 0)
   {
      if (options.verbose)
      {
         console.log(`esdoc-plugin-dependency-graphs: s_DEPTH_TRAVERSAL_NODES - depth: ${depth}; nextLevelPackages: `
          + `${JSON.stringify(nextLevelPackages)}`);
      }

      s_DEPTH_TRAVERSAL_NODES(nextLevelPackages, packageNodes, packageNodeMap, packageLinks, packageScope, depth + 1,
       options);
   }
};

// Module Private ---------------------------------------------------------------------------------------------------

const s_DATA_FIELDS = ['normPackageDataAll', 'normPackageDataDev', 'normPackageDataESDoc', 'normPackageDataMain'];

/**
 * Corrects all normalized package data names if an alias is detected when walking the package dependency graph.
 *
 * @param {string}   objectID - package key.
 * @param {string}   packageName - Name of potentially aliased package.
 */
const s_CORRECT_ALIASED_NAME = (objectID, packageName) =>
{
   s_DATA_FIELDS.forEach((field) =>
   {
      const normPackageData = global.$$esdoc_plugin_jspm[field];
      const packageData = normPackageData[objectID];

      if (packageData && packageName !== packageData.packageName)
      {
         packageData.packageName = packageName;
         packageData.isAlias = true;
      }
   });
};