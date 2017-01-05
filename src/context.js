'use strict'

function clone(oldObject) {
  // Basis.
  if (!(oldObject instanceof Object)) {
    return oldObject
  }

  var clonedObject

  // Filter out special objects.
  var Constructor = oldObject.constructor
  switch (Constructor) {
    // Implement other special objects here.
  case Promise:
    clonedObject = oldObject.then()
    break
  case Date:
    clonedObject = new Constructor(oldObject.getTime())
    break
  default:
    clonedObject = new Constructor()
  }

  // Clone each property.
  for (var prop in oldObject) {
    clonedObject[prop] = clone(oldObject[prop])
  }

  return clonedObject
}

function Context(generateLog, oldContext) {
  let context = clone(oldContext)
  context.succeed = function(data) {
    generateLog(null, () => {
      oldContext.succeed(data)
    })
  }

  context.fail = function(err) {
    generateLog(err, () => {
      oldContext.fail(err)
    })
  }

  context.done = function(err, data) {
    generateLog(err, () => {
      oldContext.done(err, data)
    })
  }

  context.getRemainingTimeInMillis = oldContext.getRemainingTimeInMillis

  /* Map getters/setters */
  context.__defineGetter__('callbackWaitsForEmptyEventLoop',
                           () => { return oldContext.callbackWaitsForEmptyEventLoop })
  context.__defineSetter__('callbackWaitsForEmptyEventLoop',
                           (value) => { oldContext.callbackWaitsForEmptyEventLoop = value })

  return context
}

module.exports = Context
