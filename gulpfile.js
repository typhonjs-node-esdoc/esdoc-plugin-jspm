/**
 * Please see `typhonjs-core-gulptasks` (https://www.npmjs.com/package/typhonjs-core-gulptasks)
 */

var gulp = require('gulp');

// Require all tasks and set `rootPath` to the base project path and `srcGlob` to all JS sources
// in `./src` & `./test/src`.
require('typhonjs-core-gulptasks')(gulp,
{
   rootPath: __dirname,
   importTasks: ['eslint', 'npm'],
   srcGlob: ['./src/**/*.js', './test/src/**/*.js']
});