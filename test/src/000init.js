/**
 * 000Init -- Bootstraps the testing process by generating the documentation linking the backbone-es6 JSPM package
 * with a simple local file: TestCollection. Any previous coverage (./coverage) and docs (./test/fixture/docs) are
 * deleted before docs are generated.
 *
 * @type {fse|exports|module.exports}
 */

var fs         = require('fs-extra');
var ESDoc      = require('../../node_modules/esdoc/out/src/ESDoc.js');
var publisher  = require('../../node_modules/esdoc/out/src/Publisher/publish.js');

var config = {
   source: './test/fixture',
   destination: './test/fixture/docs',
   "plugins":
   [
      {
         "name": "./src/plugin.js"
      }
   ]
};

if (fs.existsSync(config.destination))
{
   fs.removeSync(config.destination);
}

if (fs.existsSync('./coverage'))
{
   fs.removeSync('./coverage');
}

ESDoc.generate(config, publisher);