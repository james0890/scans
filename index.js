var async = require('async');
var AWS = require('aws-sdk');
var plugins = require('./exports.js');
var collector = require('./collect.js');

module.exports = (region, resultsCallback) => {
    let credProvider = new AWS.CredentialProviderChain();
    credProvider.providers.push(new AWS.EnvironmentCredentials('AWS'));
    credProvider.providers.push(new AWS.SharedIniFileCredentials({profile: 'default'}));
    credProvider.resolvePromise().then(credentialObj => {
        var AWSConfig = {
            accessKeyId: credentialObj.accessKeyId,
            secretAccessKey: credentialObj.secretAccessKey,
            sessionToken: credentialObj.sessionToken,
            region
        };

        if (!AWSConfig || !AWSConfig.accessKeyId) {
            return console.log('ERROR: Invalid AWSConfig');
        }

        var skipRegions = [
            'us-east-1',
            'us-east-2',
            'us-west-1',
            'us-west-2',
            'ca-central-1',
            'eu-west-2',
            'eu-central-1',
            'ap-northeast-1',
            'ap-northeast-2',
            'ap-southeast-1',
            'ap-southeast-2',
            'ap-south-1',
            'sa-east-1'
        ];

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

        var securityResults = [];

        // STEP 2 - Collect API Metadata from AWS
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
