'use strict';

const iopipe = require('./iopipe')({
  debug: true,
  token: process.env.IOPIPE_TOKEN || 'testSuite'
});

module.exports.callback = iopipe((event, context, callback) => {
  context.iopipe.log('custom_metric', 'A custom metric for callback');
  callback(null, 'callback');
});

module.exports.succeed = iopipe((event, context) => {
  context.iopipe.log('custom_metric', 'A custom metric for succeed');
  context.succeed('context.succeed');
});

module.exports.fail = iopipe((event, context) => {
  context.iopipe.log('custom_metric', 'A custom metric for fail');
  context.fail('context.fail');
});

module.exports.done = iopipe((event, context) => {
  context.iopipe.log('custom_metric', 'A custom metric for done');
  context.done(null, 'context.done');
});
