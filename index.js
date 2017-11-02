var async = require('async');
var AWS = require('aws-sdk');
var plugins = require('./exports.js');
var collector = require('./collect.js');

module.exports = (resultsCallback) => {
    let credProvider = new AWS.CredentialProviderChain();
    credProvider.providers.push(new AWS.EnvironmentCredentials('AWS'));
    credProvider.providers.push(new AWS.SharedIniFileCredentials({profile: 'default'}));
    credProvider.resolvePromise().then(credentialObj => {
        var AWSConfig = {
            accessKeyId: credentialObj.accessKeyId,
            secretAccessKey: credentialObj.secretAccessKey,
            sessionToken: credentialObj.sessionToken,
            region: 'eu-west-1'
        };

        if (!AWSConfig || !AWSConfig.accessKeyId) {
            return console.log('ERROR: Invalid AWSConfig');
        }

        var skipRegions = [];
        var settings = {};

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

        var securityResults = [];

        collector(AWSConfig, {api_calls: apiCalls, skip_regions: skipRegions}, function(err, collection) {
            if (err || !collection) return console.log('ERROR: Unable to obtain API metadata');

            console.log('INFO: Metadata collection complete. Analyzing...');
            console.log('INFO: Analysis complete. Scan report to follow...\n');

            async.forEachOfLimit(plugins, 10, (plugin, key, callback) => {
                plugin.run(collection, settings, (err, results) => {
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

                        const object = {
                            category: plugin.category,
                            title: plugin.title,
                            region: results[r].region || 'Global',
                            status: statusWord,
                            message: results[r].message
                        };

                        securityResults.push(object);                    
                    }

                    callback();
                });
            }, () => {
                resultsCallback(securityResults);
            });
        });
    });
};
