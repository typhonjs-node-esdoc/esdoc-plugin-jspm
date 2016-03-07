/**
 * 000Init -- Bootstraps the testing process by generating the documentation linking the backbone-es6 JSPM package
 * with a simple local file: TestCollection. Any previous coverage (./coverage) and docs (./test/fixture/docs) are
 * deleted before docs are generated.
 */

import fs         from 'fs-extra';
import ESDoc      from '../../node_modules/esdoc/out/src/ESDoc.js';
import publisher  from '../../node_modules/esdoc/out/src/Publisher/publish.js';

const config =
{
   source: './test/fixture',
   destination: './test/fixture/docs',
   plugins:
   [
      {
         name: './src/plugin.js'
      }
   ]
};

fs.emptyDirSync(config.destination);

ESDoc.generate(config, publisher);