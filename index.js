var async = require('async');
var AWS = require('aws-sdk');
var plugins = require('./exports.js');
var collector = require('./collect.js');

module.exports = (region) => {
    AWS.Credentials.getPromise().then(() => {
        var AWSConfig = {
            accessKeyId: AWS.Credentials.accessKeyId,
            secretAccessKey: AWS.Credentials.secretAccessKey,
            sessionToken: AWS.Credentials.sessionToken,
            region
        };

        if (!AWSConfig || !AWSConfig.accessKeyId) {
            return console.log('ERROR: Invalid AWSConfig');
        }

        var skipRegions = [];

        // Custom settings - place plugin-specific settings here
        var settings = {};

        // STEP 1 - Obtain API calls to make
        console.log('INFO: Determining API calls to make...');

        var apiCalls = [];

        for (p in plugins) {
            for (a in plugins[p].apis) {
                if (apiCalls.indexOf(plugins[p].apis[a]) === -1) {
                    apiCalls.push(plugins[p].apis[a]);
                }
            }
        }

        console.log('INFO: API calls determined.');
        console.log('INFO: Collecting AWS metadata. This may take several minutes...');

        // STEP 2 - Collect API Metadata from AWS
        collector(AWSConfig, {api_calls: apiCalls, skip_regions: skipRegions}, function(err, collection) {
            if (err || !collection) return console.log('ERROR: Unable to obtain API metadata');

            console.log('INFO: Metadata collection complete. Analyzing...');
            console.log('INFO: Analysis complete. Scan report to follow...\n');

            async.forEachOfLimit(plugins, 10, function(plugin, key, callback) {
                plugin.run(collection, settings, function(err, results) {
                    for (r in results) {
                        var statusWord;
                        if (results[r].status === 0) {
                            statusWord = 'OK';
                        } else if (results[r].status === 1) {
                            statusWord = 'WARN';
                        } else if (results[r].status === 2) {
                            statusWord = 'FAIL';
                        } else {
                            statusWord = 'UNKNOWN';
                        }
                        
                        console.log(plugin.category + '\t' + plugin.title + '\t' +
                                    (results[r].resource || 'N/A') + '\t' +
                                    (results[r].region || 'Global') + '\t\t' +
                                    statusWord + '\t' + results[r].message);
                    }

                    callback(err);
                });
            }, function(err){
                if (err) return console.log(err);
            });
        });
    });
}