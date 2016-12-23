"use strict"

var crypto = require("crypto")
var Promise = require("bluebird")
var fs = Promise.promisifyAll(require("fs"))
var request = require("request")
var EventEmitter = require("events")
var util = require("util")
var url = require("url")
var path = require("path")
var os = require("os")
var uuid = require('uuid')

const VERSION = process.env.npm_package_version
const DEFAULT_COLLECTOR_URL = "https://metrics-api.iopipe.com"

function readstat (pid) {
  if (process.platform !== 'linux') {
    return Promise.resolve({
      utime: 0,
      stime: 0,
      cutime: 0,
      cstime: 0,
      rss: 0
    })
  }

  return Promise.join(
    fs.readFileAsync(`/proc/${pid}/stat`)
  ).spread((
    pre_proc_self_stat_file
  ) => {
    var pre_proc_self_stat_fields = pre_proc_self_stat_file.toString().split(" ")
    return {
      utime: pre_proc_self_stat_fields[13],
      stime: pre_proc_self_stat_fields[14],
      cutime: pre_proc_self_stat_fields[15],
      cstime: pre_proc_self_stat_fields[16],
      rss: pre_proc_self_stat_fields[23]
    }
  })
}

function readstatus (pid) {
  if (process.platform !== 'linux') {
    var mem = process.memoryUsage()
    return Promise.resolve({
      FDSize: 0,
      Threads: 1,
      VmRSS: mem.rss / 1024,
      VmData: 0,
      VmStk: 0,
      VmExe: 0,
      VmSwap: 0
    })
  }

  return Promise.join(
    fs.readFileAsync(`/proc/${pid}/status`)
  ).spread((
    proc_self_status_file
  ) => {
    var proc_self_status_fields = {};
    // Parse status file and apply to the proc_self_status_fields dict.
    proc_self_status_file.toString().split("\n").map(
      (x) => {
        return (x) ? x.split("\t") : [ null, null ]
      }
    ).forEach(
      (x) => { proc_self_status_fields[x[0]] = x[1] }
    )

    return {
      FDSize: proc_self_status_fields['FDSize'],
      Threads: proc_self_status_fields['Threads'],
      VmRSS: proc_self_status_fields['VmRSS'],
      VmData: proc_self_status_fields['VmData'],
      VmStk: proc_self_status_fields['VmStk'],
      VmExe: proc_self_status_fields['VmExe'],
      VmSwap: proc_self_status_fields['VmSwap']
    }
  })
}

function readbootid () {
  if (process.platform !== 'linux') {
    return Promise.resolve(uuid.v4())
  }

  return fs.readFileAsync('/proc/sys/kernel/random/boot_id')
}

function _make_generateLog(emitter, func, start_time, config, context) {
  var pre_stat_promise = readstat('self')

  return function generateLog(err, callback) {
      Promise.join(
        pre_stat_promise,
        readstat('self'),
        readstatus('self'),
        readbootid()
      ).spread((
        pre_proc_self_stat,
        proc_self_stat,
        proc_self_status,
        boot_id
      ) => {
        var runtime_env = {
          agent: {
            runtime: "nodejs",
            version: VERSION
          },
          host: {
            vm_id: boot_id
          },
          os: {
            hostname: os.hostname(),
            uptime: os.uptime(),
            totalmem: os.totalmem(),
            freemem: os.freemem(),
            usedmem: os.totalmem() - os.freemem(),
            cpus: os.cpus(),
            arch: os.arch(),
            linux: {
              pid: {
                self: {
                  stat_start: pre_proc_self_stat,
                  stat: proc_self_stat,
                  status: proc_self_status
                }
              }
            }
          },
          nodejs: {
            title: process.title,
            version: process.version,
            modulesloadList: process.modulesloadList,
            versions: process.versions,
            arch: process.arch,
            platform: process.platform,
            argv: process.argv,
            execArgv: process.execArgv,
            pid: process.pid,
            features: process.features,
            execPath: process.execPath,
            debugPort: process.debugPort,
            _maxListeners: process._maxListeners,
            config: process.config,
            maxTickDepth: process.maxTickDepth,
            // /* Circular ref */ mainModule: process.mainModule,
            release: process.release,
            uptime: process.uptime(),
            getuid: process.getuid(),
            getgid: process.getgid(),
            geteuid: process.geteuid(),
            getegid: process.getegid(),
            memoryUsage: process.memoryUsage(),
          }
        }

        var retainErr = {};
        if (err) {
          retainErr = ((err) => {
                        return {
                          name: err.name,
                          message: err.message,
                          stack: err.stack,
                          lineNumber: err.lineNumber,
                          columnNumber: err.columnNumber,
                          fileName: err.fileName
                        }
                      })((typeof(err) === "string") ? new Error(err) : err)
        }

        var time_sec_nanosec = process.hrtime(start_time)
        var time_secs = time_sec_nanosec[0]
        var time_nanosecs = Math.ceil(time_secs * 1000000000.0 + time_sec_nanosec[1])

        /*
         depreciated fields:
         - time_sec_nanosec (use duration; 11/23/2016)
         - time_sec (use duration; 11/23/2016)
        */
        var response_body = {
          environment: runtime_env,
          aws: {
            functionName: context.functionName,
            functionVersion: context.functionVersion,
            invokedFunctionArn: context.invokedFunctionArn,
            memoryLimitInMB: context.memoryLimitInMB,
            awsRequestId: context.awsRequestId,
            logGroupName: context.logGroupName,
            logStreamName: context.logStreamName
          },
          errors: retainErr,
          custom_metrics: emitter.queue,
          time_sec_nanosec: time_sec_nanosec,
          time_sec: time_sec_nanosec[0],
          time_nanosec: time_sec_nanosec[1],
          duration: time_nanosecs,
          client_id: config.clientId
        }

        if (context.getRemainingTimeInMillis) {
          response_body['getRemainingTimeInMillis'] = context.getRemainingTimeInMillis()
        }

        if (config.debug) {
          console.log("IOPIPE-DEBUG: ", response_body)
        }

        if (!config.clientId) {
          callback()
          return
        }
        request(
          {
            url: config.url,
            method: "POST",
            json: true,
            body: response_body
          },
          function(reqErr, res, body) {
            // Throw uncaught errors from the wrapped function.
            if (err) {
              context.fail(err)
            }
            /*if (reqErr) {
              console.log("WOLF:IOpipeLoggingError: ", reqErr)
            }*/
            callback()
          }
        )
      }
    )
  }
}

function _agentEmitter() {
  this.queue = []
  EventEmitter.call(this);
}
util.inherits(_agentEmitter, EventEmitter)

function new_context (generateLog, old_context) {
  var context = {
    awsRequestId: old_context.awsRequestId,
    invokeid: old_context.invokeid,
    logGroupName: old_context.logGroupName,
    logStreamName: old_context.logStreamName,
    functionVersion: old_context.functionVersion,
    isDefaultFunctionVersion: old_context.isDefaultFunctionVersion,
    functionName: old_context.functionName,
    memoryLimitInMB: old_context.memoryLimitInMB,
    succeed: function(data) {
      generateLog(null, () => {
        old_context.succeed(data)
      })
    },
    fail: function(err) {
      generateLog(err, () => {
        old_context.fail(err)
      })
    },
    done: function(err, data) {
      generateLog(err, () => {
        old_context.done(err, data)
      })
    },
    iopipe_log: function(level, data) {
      emitter.queue.push([level, data])
    },
    getRemainingTimeInMillis: old_context.getRemainingTimeInMillis
  }

  /* Map getters/setters */
  context.__defineGetter__('callbackWaitsForEmptyEventLoop',
     () => { return old_context.callbackWaitsForEmptyEventLoop })
  context.__defineSetter__('callbackWaitsForEmptyEventLoop',
     (value) => { old_context.callbackWaitsForEmptyEventLoop = value })

  return context
}

function new_callback (generateLog, callback) {
  if (typeof(callback) !== 'function') {
    return undefined
  }
  return (err, data) => {
    //console.log("WOLF:CalledLambdaCallback.")
    generateLog(err, () => {
      callback.apply(callback, [err, data])
    })
  }
}

module.exports = function(configObject) {
  return function(func) {
    return function() {
      var baseurl = (configObject && configObject.url) ? configObject.url : DEFAULT_COLLECTOR_URL
      var eventURL = url.parse(baseurl)
      eventURL.pathname = path.join(eventURL.pathname, 'v0/event')
      eventURL.path = eventURL.search ? eventURL.pathname + eventURL.search : eventURL.pathname

      var config = {
        url: eventURL,
        clientId: configObject.clientId || process.env.IOPIPE_CLIENTID || "",
        debug: configObject.debug || process.env.IOPIPE_DEBUG || false
      }

      var emitter = new _agentEmitter()
      emitter.on("iopipe_event", (name, value) => {
        var numberValue, stringValue
        if (typeof value === 'number') {
          numberValue = value
        } else {
          if(typeof value === 'object') {
            JSON.stringify(value)
          } else {
            stringValue = String(value)
          }
        }
        emitter.queue.push({
          name: name,
          n: numberValue,
          s: stringValue
        })
      })

      var args = [].slice.call(arguments)

      var start_time = process.hrtime()
      var generateLog = _make_generateLog(emitter, func, start_time, config, args[1])

      /* Mangle arguments, wrapping callbacks. */
      args[1] = new_context(generateLog, args[1])
      args[2] = new_callback(generateLog, args[2])

      try {
        return func.apply(emitter, args)
      }
      catch (err) {
        generateLog(err, () => {})
        return undefined
      }
    }
  }
}
