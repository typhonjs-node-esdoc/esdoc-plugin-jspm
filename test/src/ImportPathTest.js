var assert = require('power-assert');
var fs = require('fs-extra');

/**
 * @test {onHandleCode}
 */
describe('Import Path', function()
{
   it('TestCollection extends Collection', function()
   {
      var html = fs.readFileSync(
       './test/fixture/docs/class/esdoc-plugin-jspm/test/fixture/TestCollection.js~TestCollection.html').toString();

      assert(html.indexOf('src/Collection.js~Collection.html">Collection</a></span> &#x2192; TestCollection<') >= 0);
   });
});