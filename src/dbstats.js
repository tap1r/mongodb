/*
 *  dbstats.js
 *  Description: DB storage stats uber script
 *  Created by: luke.prochazka@mongodb.com
 */

// Usage: "mongo [+connection options] --quiet dbstats.js"

/*
 *  Load helper library (https://github.com/tap1r/mongodb-scripts/blob/master/src/mdblib.js)
 *  Save mdblib.js to the local directory for the mongo shell to read
 */

load('mdblib.js');

// Global defaults

var dbPath, database, collection, dbStats, collStats = {};

/*
 *  Formatting preferences
 */

const scale = new ScaleFactor(); // 'B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'
let termWidth = 124, columnWidth = 15, rowHeader = 36;

/*
 *  main
 */

function getStats() {
    /*
     *  Gather DB stats (and print)
     */
    dbPath = { "name": "", "dataSize": 0, "storageSize": 0, "objects": 0, "freeBlocks": 0, "compression": 0, "indexSize": 0, "indexFree": 0 };
    db.getMongo().getDBNames().map(dbName => {
        database = { "name": "", "dataSize": 0, "storageSize": 0, "objects": 0, "freeBlocks": 0, "compression": 0, "indexSize": 0, "indexFree": 0 };
        dbStats = db.getSiblingDB(dbName).stats();
        database.name = dbStats.db;
        database.objects = dbStats.objects;
        database.dataSize = dbStats.dataSize;
        database.storageSize = dbStats.storageSize;
        database.indexSize = dbStats.indexSize;
        printDbHeader(database.name);
        printCollHeader();
        db.getSiblingDB(dbName).getCollectionInfos({ "type": "collection" }, true).map(collInfo => {
            collection = { "name": "", "dataSize": 0, "storageSize": 0, "objects": 0, "freeBlocks": 0, "compression": 0, "indexSize": 0, "indexFree": 0 };
            collStats = db.getSiblingDB(dbName).getCollection(collInfo.name).stats({ "indexDetails" : true });
            collection.name = collStats.ns.substr(collStats.ns.indexOf('.') + 1);
            collection.objects = collStats.count;
            collection.dataSize = collStats.size;
            collection.storageSize = collStats.wiredTiger['block-manager']['file size in bytes'];
            Object.keys(collStats['indexDetails']).map(indexName => {
                collection.indexSize += collStats['indexDetails'][indexName]['block-manager']['file size in bytes'];
                collection.indexFree += collStats['indexDetails'][indexName]['block-manager']['file bytes available for reuse'];
            });
            collection.freeBlocks = collStats.wiredTiger['block-manager']['file bytes available for reuse'];
            collection.compression = collection.dataSize / (collection.storageSize - collection.freeBlocks);
            printCollection(collection);
            database.freeBlocks += collection.freeBlocks;
            database.indexFree += collection.indexFree;
        });
        printViewHeader();
        db.getSiblingDB(dbName).getCollectionInfos({ "type": "view" }, true).map(viewInfo => {
            // view = { "name": "" };
            // view.name = viewInfo.name;
            printView(viewInfo.name);
        });
        database.compression = database.dataSize / (database.storageSize - database.freeBlocks);
        printDb(database);
        dbPath.dataSize += database.dataSize;
        dbPath.storageSize += database.storageSize;
        dbPath.objects += database.objects;
        dbPath.indexSize += database.indexSize;
        dbPath.indexFree += database.indexFree;
        dbPath.freeBlocks += database.freeBlocks;
    });
    dbPath.compression = dbPath.dataSize / (dbPath.storageSize - dbPath.freeBlocks);
    printDbPath(dbPath);
}

function fmtUnit(metric) {
    /*
     *  Pretty format unit
     */
    return (metric / scale.factor).toFixed(scale.precision) + ' ' + scale.unit;
}

function fmtPct(numerator, denominator) {
    /*
     *  Pretty format percentage
     */
    return (numerator / denominator * 100).toFixed(scale.pctPoint) + '%';
}

function fmtRatio(metric) {
    /*
     *  Pretty format ratio
     */
    return (metric).toFixed(scale.precision) + ':1';
}

function printDbHeader(databaseName) {
    /*
     *  Print DB table header
     */
    print('\n');
    print('='.repeat(termWidth));
    print('Database:', databaseName);
}

function printCollHeader() {
    /*
     *  Print collection table header
     */
    print('-'.repeat(termWidth));
    print('Collection(s)'.padEnd(rowHeader), 'Data size'.padStart(columnWidth),
        'Size on disk'.padStart(columnWidth), 'Object count'.padStart(columnWidth),
        'Free blocks (reuse)'.padStart(columnWidth + 8), 'Compression'.padStart(columnWidth)
    );
}

function printViewHeader() {
    /*
     *  Print view table header
     */
    print('-'.repeat(termWidth));
    print('View(s)'.padEnd(rowHeader));
}

function printCollection(collection) {
    /*
     *  Print collection level stats
     */
    print('-'.repeat(termWidth));
    print((' ' + collection.name).padEnd(rowHeader),
        fmtUnit(collection.dataSize).padStart(columnWidth),
        fmtUnit(collection.storageSize).padStart(columnWidth),
        collection.objects.toString().padStart(columnWidth),
        (fmtUnit(collection.freeBlocks) +
            ('(' + fmtPct(collection.freeBlocks,
            collection.storageSize) + ')').padStart(8)).padStart(columnWidth + 8),
        fmtRatio(collection.compression).padStart(columnWidth)
    );
}

function printView(view) {
    /*
     *  Print view names
     */
    print('-'.repeat(termWidth));
    print((' ' + view).padEnd(rowHeader));
}

function printDb(database) {
    /*
     *  Print DB level rollup stats
     */
    print('-'.repeat(termWidth));
    print('Collections subtotal:'.padEnd(rowHeader),
        fmtUnit(database.dataSize).padStart(columnWidth),
        fmtUnit(database.storageSize).padStart(columnWidth),
        database.objects.toString().padStart(columnWidth),
        (fmtUnit(database.freeBlocks).padStart(columnWidth) +
            ('(' + fmtPct(database.freeBlocks,
            database.storageSize) + ')').padStart(8)).padStart(columnWidth + 8),
        fmtRatio(database.compression).padStart(columnWidth)
    );
    print('Indexes subtotal:'.padEnd(rowHeader),
    ''.padStart(columnWidth),
        fmtUnit(database.indexSize).padStart(columnWidth),
        ''.padStart(columnWidth),
        (fmtUnit(database.indexFree).padStart(columnWidth) +
            ('(' + fmtPct(database.indexFree,
            database.indexSize) + ')').padStart(8)).padStart(columnWidth + 8)
    );
    print('='.repeat(termWidth));
}

function printDbPath(dbPath) {
    /*
     *  Print total dbPath rollup stats
     */
    print('\n' + '='.repeat(termWidth));
    print('dbPath totals'.padEnd(rowHeader), 'Data size'.padStart(columnWidth),
        'Size on disk'.padStart(columnWidth), 'Object count'.padStart(columnWidth),
        'Free blocks (reuse)'.padStart(columnWidth + 8), 'Compression'.padStart(columnWidth)
    );
    print('-'.repeat(termWidth));
    print('All DBs:'.padEnd(rowHeader),
        fmtUnit(dbPath.dataSize).padStart(columnWidth),
        fmtUnit(dbPath.storageSize).padStart(columnWidth),
        dbPath.objects.toString().padStart(columnWidth),
        (fmtUnit(dbPath.freeBlocks) +
            ('(' + fmtPct(dbPath.freeBlocks,
            dbPath.storageSize) + ')').padStart(8)).padStart(columnWidth + 8),
        fmtRatio(dbPath.compression).padStart(columnWidth)
    );
    print('All indexes:'.padEnd(rowHeader),
        ''.padStart(columnWidth),
        fmtUnit(dbPath.indexSize).padStart(columnWidth),
        ''.padStart(columnWidth),
        (fmtUnit(dbPath.indexFree) +
            ('(' + fmtPct(dbPath.indexFree,
            dbPath.indexSize) + ')').padStart(8)).padStart(columnWidth + 8)
    );
    print('='.repeat(termWidth));
}

slaveOk();
getStats();

// EOF
