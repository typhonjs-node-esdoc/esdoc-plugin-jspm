/* eslint-disable */

import Collection from 'backbone-es6/src/Collection.js';

/**
 * This is a local test source file.
 */
export default class TestCollection extends Collection
{
   /**
    * Adds two variables together.
    *
    * @param {number} var1 - A number
    * @param {number} var2 - A number
    * @returns {number}
    */
   add(var1, var2)
   {
      return var1 + var2;
   }
}