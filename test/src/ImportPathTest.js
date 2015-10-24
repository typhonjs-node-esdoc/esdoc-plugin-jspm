var assert = require('power-assert');
var fs = require('fs-extra');

/**
 * This test confirms that the Backbone-ES6 JSPM package is properly linked with the local source. In this case
 * a successful result is when TestCollection properly extends Collection and the inheritance link is made
 * in documentation for TestCollection.
 *
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