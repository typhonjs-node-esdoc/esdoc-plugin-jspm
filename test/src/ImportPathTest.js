import { assert } from 'chai';
import fs         from 'fs-extra';

/**
 * This test confirms that the Backbone-ES6 JSPM package is properly linked with the local source. In this case
 * a successful result is when TestCollection properly extends Collection and the inheritance link is made
 * in documentation for TestCollection.
 *
 * @test {onHandleCode}
 */
describe('Import Path', () =>
{
   it('TestCollection extends Collection', () =>
   {
      const html = fs.readFileSync(
       './test/fixture/docs/class/esdoc-plugin-jspm/test/fixture/TestCollection.js~TestCollection.html', 'utf-8');

      assert(html.indexOf('src/Collection.js~Collection.html">Collection</a></span> &#x2192; TestCollection<') >= 0);
   });
});