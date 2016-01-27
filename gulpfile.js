/**
 * Locally defined Gulp tasks from `typhonjs-core-gulptasks` (https://www.npmjs.com/package/typhonjs-core-gulptasks)
 */

var fs =       require('fs-extra');
var gulp =     require('gulp');
var path =     require('path');

// The root path of the project being operated on via all tasks.
var rootPath = __dirname;

// The source glob defining all sources.
var srcGlob = ['./src/**/*.js', './test/src/**/*.js'];

/**
 * Runs ESLint with the given source glob with the `.eslintrc` file defined in the root path.
 */
gulp.task('eslint', function()
{
   var eslint = require('gulp-eslint');

   // The location of the `.eslintrc` configuration file.
   var eslintConfigPath = rootPath + path.sep + '.eslintrc';

   if (!fs.existsSync(eslintConfigPath))
   {
      console.error('Could not locate `.eslintrc` at: ' + eslintConfigPath);
      process.exit(1);
   }

   // Run ESLint
   return gulp.src(srcGlob)
    .pipe(eslint(eslintConfigPath))
    .pipe(eslint.formatEach('compact', process.stderr))
    .pipe(eslint.failOnError());
});

/**
 * Runs `npm install` via NPM CLI.
 */
gulp.task('npm-install', function(cb)
{
   var exec = require('child_process').exec;
   exec('npm install', { cwd: rootPath }, function(err, stdout, stderr)
   {
      console.log(stdout);
      console.log(stderr);
      cb(err);
   });
});

/**
 * Runs `npm list --depth=0` via NPM CLI.
 */
gulp.task('npm-list-depth-0', function(cb)
{
   var exec = require('child_process').exec;
   exec('npm list --depth=0', { cwd: rootPath }, function(err, stdout, stderr)
   {
      console.log(stdout);
      console.log(stderr);
      cb(err);
   });
});

/**
 * Runs `npm outdated` via NPM CLI.
 */
gulp.task('npm-outdated', function(cb)
{
   var exec = require('child_process').exec;
   exec('npm outdated', { cwd: rootPath }, function(err, stdout, stderr)
   {
      console.log(stdout);
      console.log(stderr);
      cb(err);
   });
});

// Load any package.json in `rootPath` and add Gulp tasks to invoke any script entries.

var packageJSONPath = rootPath + path.sep + 'package.json';

if (fs.existsSync(packageJSONPath))
{
   var packageJSON = require(packageJSONPath);

   // If a scripts entry exists then create Gulp tasks to invoke them.
   if (typeof packageJSON.scripts === 'object')
   {
      Object.keys(packageJSON.scripts).forEach(function(element)
      {
         /**
          * Runs `npm run <script name>` via NPM CLI.
          */
         gulp.task('npm-run-' + element, function(cb)
         {
            var exec = require('child_process').exec;
            exec('npm run ' + element, { cwd: rootPath }, function(err, stdout, stderr)
            {
               console.log(stdout);
               console.log(stderr);
               cb(err);
            });
         });
      });
   }
}

/**
 * Runs `npm uninstall <package>` via NPM CLI for all node modules installed.
 */
gulp.task('npm-uninstall', function(cb)
{
   var exec = require('child_process').exec;
   exec('for package in `ls node_modules`; do npm uninstall $package; done;', { cwd: rootPath },
    function(err, stdout, stderr)
   {
      console.log(stdout);
      console.log(stderr);
      cb(err);
   });
});