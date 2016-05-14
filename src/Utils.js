/**
 * Provides a few shared utility methods.
 */
export default class Utils
{
   static parsePackageRepoLink(packageJSON)
   {

   }

   /**
    * Parses the relative path and returns a normalized full JSPM package representation
    *
    * @param {string}   path - JSPM relative package path.
    * @returns {string}
    */
   static parseRelativePath(path)
   {
      const packagePath = path.replace('jspm_packages/', '');
      return packagePath.replace('/', ':');
   }

   /**
    * Replaces semver and other special characters with `-`.
    *
    * @param {string}   value - Value to sanitize.
    * @returns {string}
    */
   static sanitizePackageID(value)
   {
      return value.replace(/(\.|\/|:|@|\^|>=|>|<=|<|~|\*)/gi, '-');
   }
}