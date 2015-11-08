## 0.4.0 (2015-11-08)
- **Feat**
  - If options.packages is specified it will now properly pick up any data from `package.json` and parse dependencies
  from `config.js`.
  - Added `silent` option which silences logging output.

## 0.3.0 (2015-11-06)
- **Feat**
  - Added automatic parsing of `package.json` entries for `jspm.dependencies`. It is no longer necessary to specify an `option.packages` array for JSPM packages to link in `esdoc.json`. Any valid JSPM package with an `esdoc.json` file in the respective root path will linked including any valid child dependencies defined in `config.js`.
  
## 0.2.0 (2015-11-01)
- **Feat**
  - Added `jspmRootPath` top level entry for `esdoc.json` to explicitly configure the project root path.
  
## 0.1.0 (2015-10-26)
- Initial release
