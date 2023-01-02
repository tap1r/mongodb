/*
 *  Name: "dbstats.js"
 *  Version: "0.3.0"
 *  Description: DB storage stats uber script
 *  Authors: ["tap1r <luke.prochazka@gmail.com>"]
 */

// Usage: "[mongo|mongosh] [connection options] --quiet dbstats.js"

/*
 *  Load helper mdblib.js (https://github.com/tap1r/mongodb-scripts/blob/master/src/mdblib.js)
 *  Save libs to the $MDBLIB or other valid search path
 */

let __script = { "name": "dbstats.js", "version": "0.3.0" },
   __comment = `\n Running script ${__script.name} v${__script.version}`;
if (typeof __lib === 'undefined') {
   /*
    *  Load helper library mdblib.js
    */
   let __lib = { "name": "mdblib.js", "paths": null, "path": null };
   if (typeof _getEnv !== 'undefined') { // newer legacy shell _getEnv() method
      __lib.paths = [_getEnv('MDBLIB'), _getEnv('HOME') + '/.mongodb', '.'];
      __lib.path = __lib.paths.find(path => fileExists(path + '/' + __lib.name)) + '/' + __lib.name;
   } else if (typeof process !== 'undefined') { // mongosh process.env[] method
      __lib.paths = [process.env.MDBLIB, process.env.HOME + '/.mongodb', '.'];
      __lib.path = __lib.paths.find(path => fs.existsSync(path + '/' + __lib.name)) + '/' + __lib.name;
   } else {
      print(`[WARN] Legacy shell methods detected, must load ${__lib.name} from the current working directory`);
      __lib.path = __lib.name;
   }
   load(__lib.path);
}
__comment += ` with ${__lib.name} v${__lib.version}`;
console.log(__comment);

/*
 *  User defined parameters
 */

if (typeof scale === 'undefined') {
   // 'B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'
   (scale = new ScaleFactor());
}

/*
 *  Global defaults
 */

// formatting preferences
if (typeof termWidth === 'undefined') (termWidth = 124);
if (typeof columnWidth === 'undefined') (columnWidth = 14);
if (typeof rowHeader === 'undefined') (rowHeader = 40);

// connection preferences
if (typeof readPref === 'undefined') (readPref = (hello().secondary === false) ? 'primaryPreferred' : 'secondaryPreferred');

async function main() {
   /*
    *  main
    */
   slaveOk(readPref);
   printDbPath(await getStats());
}

async function getStats() {
   /*
    *  Gather DB stats (and print)
    */
   let dbPath = new MetaStats();
   dbPath.init();
   // db.getMongo().getDBNames().map(async dbName => {
   db.getMongo().getDBNames().map(dbName => {
      let dbStats = db.getSiblingDB(dbName).stats();
      let database = new MetaStats(dbStats.db, dbStats.dataSize, dbStats.storageSize, dbStats.objects, 0, '', dbStats.indexSize);
      database.init();
      let collections = db.getSiblingDB(dbName).getCollectionInfos({ "type": "collection" }, true);
      printDbHeader(database.name);
      printCollHeader(collections.length);
      // collections.map(async collInfo => {
      collections.map(collInfo => {
         let collStats = db.getSiblingDB(dbName).getCollection(collInfo.name).stats({ "indexDetails": true });
         let collection = new MetaStats(
            collInfo.name, collStats.size, collStats.wiredTiger['block-manager']['file size in bytes'],
            collStats.count, collStats.wiredTiger['block-manager']['file bytes available for reuse'],
            // collStats.wiredTiger.creationString.match(/block_compressor=(?<compressor>\w+)/)?.groups?.compressor
            collStats.wiredTiger.creationString.match(/block_compressor=(\w+)/)[1]
         );
         collection.init();
         Object.keys(collStats.indexDetails).map(indexName => {
            collection.indexSize += collStats.indexDetails[indexName]['block-manager']['file size in bytes'];
            collection.indexFree += collStats.indexDetails[indexName]['block-manager']['file bytes available for reuse'];
         });
         printCollection(collection);
         database.blocksFree += collection.blocksFree;
         database.indexFree += collection.indexFree;
      });
      let views = db.getSiblingDB(dbName).getCollectionInfos({ "type": "view" }, true);
      printViewHeader(views.length);
      views.map(viewInfo => printView(viewInfo.name));
      printDb(database);
      dbPath.dataSize += database.dataSize;
      dbPath.storageSize += database.storageSize;
      dbPath.objects += database.objects;
      dbPath.indexSize += database.indexSize;
      dbPath.indexFree += database.indexFree;
      dbPath.blocksFree += database.blocksFree;
   });

   return dbPath;
}

function formatUnit(metric) {
   /*
    *  Pretty format unit
    */
   return `${(metric / scale.factor).toFixed(scale.precision)} ${scale.unit}`;
}

function formatPct(numerator, denominator) {
   /*
    *  Pretty format percentage
    */
   return `${(numerator / denominator * 100).toFixed(scale.pctPoint)}%`;
}

function formatRatio(metric) {
   /*
    *  Pretty format ratio
    */
   return `${metric.toFixed(scale.precision)}:1`;
}

function printCollHeader(collTotal = 0) {
   /*
    *  Print collection table header
    */
   print('-'.repeat(termWidth));
   print(('Collection' + ((collTotal === 1) ? '' : 's') + ':\t' + collTotal).padEnd(rowHeader));
}

function printCollection({ name, dataSize, compression, compressor, storageSize, blocksFree, objects }) {
   /*
    *  Print collection level stats
    */
   print(' ' + '-'.repeat(termWidth - 1));
   print(
      (' ' + name).padEnd(rowHeader),
      formatUnit(dataSize).padStart(columnWidth),
      (formatRatio(compression) +
         (compressor).padStart(7)).padStart(columnWidth + 1),
      formatUnit(storageSize).padStart(columnWidth),
      (formatUnit(blocksFree) +
         ('(' + formatPct(blocksFree,
         storageSize) + ')').padStart(8)).padStart(columnWidth + 8),
      objects.toString().padStart(columnWidth)
   );
}

function printViewHeader(viewTotal = 0) {
   /*
    *  Print view table header
    */
   print('-'.repeat(termWidth));
   print(('View' + ((viewTotal === 1) ? '' : 's') + ':\t\t' + viewTotal).padEnd(rowHeader));
}

function printView(viewName) {
   /*
    *  Print view name
    */
   print('-'.repeat(termWidth));
   print((' ' + viewName).padEnd(rowHeader));
}

function printDbHeader(dbName) {
   /*
    *  Print DB table header
    */
   print('\n');
   print('='.repeat(termWidth));
   print(
      ('Database: ' + dbName).padEnd(rowHeader),
      'Data size'.padStart(columnWidth),
      'Compression'.padStart(columnWidth + 1),
      'Size on disk'.padStart(columnWidth),
      'Free blocks (reuse)'.padStart(columnWidth + 8),
      'Object count'.padStart(columnWidth)
   );
}

function printDb({
      dataSize, compression, storageSize, blocksFree,
      objects, indexSize, indexFree
   }) {
   /*
    *  Print DB level rollup stats
    */
   print('-'.repeat(termWidth));
   print(
      'Collections subtotal:'.padEnd(rowHeader),
      formatUnit(dataSize).padStart(columnWidth),
      formatRatio(compression).padStart(columnWidth + 1),
      formatUnit(storageSize).padStart(columnWidth),
      (formatUnit(blocksFree).padStart(columnWidth) +
         ('(' + formatPct(blocksFree,
         storageSize) + ')').padStart(8)).padStart(columnWidth + 8),
      objects.toString().padStart(columnWidth)
   );
   print(
      'Indexes subtotal:'.padEnd(rowHeader),
      ''.padStart(columnWidth),
      ''.padStart(columnWidth + 1),
      formatUnit(indexSize).padStart(columnWidth),
      (formatUnit(indexFree).padStart(columnWidth) +
         ('(' + formatPct(indexFree,
         indexSize) + ')').padStart(8)).padStart(columnWidth + 8)
   );
   print('='.repeat(termWidth));
}

function printDbPath({
      dbPath, proc, hostname, dataSize, storageSize,
      blocksFree, compression, objects, indexSize, indexFree
   }) {
   /*
    *  Print total dbPath rollup stats
    */
   print('\n');
   print('='.repeat(termWidth));
   print(
      'dbPath totals'.padEnd(rowHeader),
      'Data size'.padStart(columnWidth),
      'Compression'.padStart(columnWidth + 1),
      'Size on disk'.padStart(columnWidth),
      'Free blocks (reuse)'.padStart(columnWidth + 8),
      'Object count'.padStart(columnWidth)
   );
   print('-'.repeat(termWidth));
   print(
      'All DBs:'.padEnd(rowHeader),
      formatUnit(dataSize).padStart(columnWidth),
      formatRatio(compression).padStart(columnWidth + 1),
      formatUnit(storageSize).padStart(columnWidth),
      (formatUnit(blocksFree) +
         ('(' + formatPct(blocksFree,
         storageSize) + ')').padStart(8)).padStart(columnWidth + 8),
      objects.toString().padStart(columnWidth)
   );
   print(
      'All indexes:'.padEnd(rowHeader),
      ''.padStart(columnWidth),
      ''.padStart(columnWidth + 1),
      formatUnit(indexSize).padStart(columnWidth),
      (formatUnit(indexFree) +
         ('(' + formatPct(indexFree,
         indexSize) + ')').padStart(8)).padStart(columnWidth + 8)
   );
   print('='.repeat(termWidth));
   print('Host:', hostname, '\tType:', proc, '\tdbPath:', dbPath);
   print('='.repeat(termWidth));
   print('\n');
}

main();

// EOF
