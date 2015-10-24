#!/usr/bin/env node

/**
 * test -- Initiates the testing cycle and sets `./test/src` as the files to execute. Istanbul is used for code
 * coverage and tests are run with Mocha and results are uploaded to Codecov.io
 */

var sh = require('./sh');

var mochaOption=" -t 10000 --recursive ./test/src -R spec";

if (process.env.TRAVIS)
{
   sh.exec('./node_modules/.bin/istanbul cover ./node_modules/mocha/bin/_mocha --report lcovonly -- ' +mochaOption
    +' && cat ./coverage/lcov.info | ./node_modules/codecov.io/bin/codecov.io.js');
}
else if(process.argv.indexOf('--coverage') !== -1)
{
   sh.exec('./node_modules/.bin/istanbul cover ./node_modules/mocha/bin/_mocha  -- ' +mochaOption);
}
else
{
   sh.exec('./node_modules/.bin/mocha' +mochaOption);
}