IOpipe Analytics & Distributed Tracing Agent
--------------------------------------------
[![Coverage Status](https://coveralls.io/repos/github/iopipe/iopipe/badge.svg?branch=master)](https://coveralls.io/github/iopipe/iopipe?branch=master)
[![npm version](https://badge.fury.io/js/iopipe.svg)](https://badge.fury.io/js/iopipe)

This package provides analytics and distributed tracing for
event-driven applications running on AWS Lambda.

# Installation & usage

Install by requiring this module, passing it an object with your project token
([register for access](https://www.iopipe.com)), and it will
automatically monitor and collect metrics from your application
running on AWS Lambda.

If you are using the Serverless Framework to deploy your lambdas, check out our
[serverless plugin](https://github.com/iopipe/serverless-plugin-iopipe).

Example:

```javascript
var iopipe = require("iopipe")({ token: "YOUR_TOKEN"})

exports.handle = iopipe(
  function (event, context) {
    context.succeed("This is my serverless function!")
  }
)
```

# Environment-based config

This library will look for an environment variable, `IOPIPE_TOKEN` and will use
this if one is not explicitly passed to the configuration object. If a project
token is passed to the configuration object, the library will prefer that
token over the environment variable.

```javascript
exports.handle = require("iopipe")()(
  function (event, context, callback) {
    // Do things here. Nothing will be reported.
  }
)
```

# Debugging integration

Debugging is possible by seeing the `debug` key to `true`
in the configuration as such, which will log all data sent to
IOpipe servers to STDOUT. This is also a good way to evaluate
the sort of data that IOpipe is receiving from your application.

Debugging is also enabled if the the environment variable,
`IOPIPE_DEBUG` is set to a truthful value.

```javascript
exports.handle = require("iopipe")({ debug: true })(
  function (event, context, callback) {
    // Do things here. We'll log info to STDOUT.
  }
)
```

# License

Apache 2.0
