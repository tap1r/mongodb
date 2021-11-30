/*
 *  Aggregation template with extended options
 */
var dbName = 'database', collName = 'collection',
    // explainPlan = 'executionStats', // ["queryPlanner"|"executionStats"|"allPlansExecution"]
    options = {
        "allowDiskUse": true,
        "cursor": { "batchSize": 0 },
        // "maxTimeMS": 0,
        // "bypassDocumentValidation": false,
        "readConcern": { "level": "local" },
        // "collation": { "locale": "simple" },
        // "hint": "_id_",
        "comment": "My aggregation query",
        "writeConcern": { w: "majority", /* j: true, wtimeout: 10000 */ },
        // "let": {} // Added in MongoDB v5.0
    },
    pipeline = [
        // aggregation stage operators
        {}
    ];

db.getSiblingDB(dbName).getCollection(collName).aggregate(pipeline, options).forEach(printjson);
// db.getSiblingDB(dbName).getCollection(collName).explain(explainPlan).aggregate(pipeline, options);
