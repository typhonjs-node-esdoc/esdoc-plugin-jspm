var fs         = require('fs-extra');
var ESDoc      = require('../../node_modules/esdoc/out/src/ESDoc.js');
var publisher  = require('../../node_modules/esdoc/out/src/Publisher/publish.js');

var config = {
   source: './test/fixture',
   destination: './test/fixture/docs',
   "plugins":
   [
      {
         "name": "./src/plugin.js",
         "option":
         {
            "packages": ["backbone-es6"]
         }
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