var fs         = require('fs');
var ESDoc      = require('../../node_modules/esdoc/out/src/ESDoc.js');
var publisher  = require('../../node_modules/esdoc/out/src/Publisher/publish.js');

console.log("000Init - __dirname: " +__dirname);

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
   fs.rmdirSync(config.destination);
}

//ESDoc.generate(config, publisher);