import _ from 'lodash';
import mockContext from 'aws-lambda-mock-context';

import IOpipe from './index';

jest.mock('./sendReport');
import { reports } from './sendReport';
import { hooks } from './hooks';

import DummyPlugin from './plugins/dummy';
import {
  instantiate as AllHooksPlugin,
  data as allHooksData
} from './plugins/allHooks';

test('Hooks have not changed', () => {
  expect(hooks.length).toEqual(6);
  expect(hooks).toMatchSnapshot();
});

test('Can instantiate a test plugin', done => {
  const plugin = DummyPlugin();

  const invocationInstance = {};
  const pluginInstance = plugin(invocationInstance);

  expect(pluginInstance.hasSetup).toEqual(false);

  done();
});

test('Can instantiate a test plugin with config', done => {
  const plugin = DummyPlugin({
    foo: 'bar'
  });

  const invocationInstance = {};
  const pluginInstance = plugin(invocationInstance);

  expect(pluginInstance.config.foo).toEqual('bar');

  done();
});

test('Can call a plugin hook function', done => {
  const plugin = DummyPlugin();

  const invocationInstance = {
    context: {
      iopipe: {}
    }
  };
  const pluginInstance = plugin(invocationInstance);

  expect(pluginInstance.hasSetup).toBe(false);
  pluginInstance.hooks['post:setup'](invocationInstance);
  expect(pluginInstance.hasSetup).toBe(true);

  done();
});

test('Can run a test plugin hook that modifies a invocation instance', done => {
  const plugin = DummyPlugin();

  const invocationInstance = { context: { iopipe: { log: _.noop } } };
  const pluginInstance = plugin(invocationInstance);

  expect(_.isFunction(invocationInstance.context.iopipe.dummy)).toBe(false);
  pluginInstance.hooks['post:setup']();
  expect(pluginInstance.hasSetup).toEqual(true);
  expect(_.isFunction(invocationInstance.context.iopipe.dummy)).toBe(true);

  done();
});

test('Can run a test plugin hook directly', done => {
  const plugin = DummyPlugin();

  const invocationInstance = {
    metrics: [
      {
        name: 'ding',
        s: 'dong'
      }
    ],
    context: {
      iopipe: {}
    }
  };
  const pluginInstance = plugin(invocationInstance);

  pluginInstance.hooks['post:setup']();
  invocationInstance.context.iopipe.dummy('metric-2', 'baz');
  const { metrics } = invocationInstance;
  expect(metrics.length).toBe(2);
  expect(
    _.find(metrics, m => m.name === 'ding' && m.s === 'dong')
  ).toBeTruthy();
  expect(
    _.find(metrics, m => m.name === 'dummy-metric-2' && m.s === 'baz')
  ).toBeTruthy();

  done();
});

test('A single plugin can be loaded and work', async () => {
  try {
    const iopipe = IOpipe({
      token: 'single-plugin',
      plugins: [DummyPlugin()]
    });

    const wrapped = iopipe((event, ctx) => {
      ctx.iopipe.dummy('ok', 'neat');
      ctx.succeed(ctx.iopipe.dummy);
    });

    const context = mockContext();

    wrapped({}, context);

    const val = await context.Promise;
    expect(_.isFunction(val)).toBe(true);

    const metric = _.chain(reports)
      .find(obj => obj.client_id === 'single-plugin')
      .get('custom_metrics')
      .find({ name: 'dummy-ok', s: 'neat' })
      .value();
    expect(_.isObject(metric)).toBe(true);

    const plugin = _.chain(reports)
      .find(obj => obj.client_id === 'single-plugin')
      .get('plugins')
      .find({
        name: 'dummy',
        version: '0.0.1',
        homepage: 'https://github.com/not/a/real/plugin'
      })
      .value();

    expect(_.isObject(plugin)).toBe(true);
  } catch (err) {
    console.error(err);
    throw err;
  }
});

test('Multiple plugins can be loaded and work', async () => {
  try {
    const iopipe = IOpipe({
      token: 'multiple-plugins',
      plugins: [
        DummyPlugin(),
        DummyPlugin({
          functionName: 'secondDummy'
        })
      ]
    });

    const wrapped = iopipe((event, ctx) => {
      ctx.iopipe.dummy('ok', 'neat');
      ctx.iopipe.secondDummy('foo', 'bar');
      ctx.succeed('indeed');
    });

    const context = mockContext();

    wrapped({}, context);

    const val = await context.Promise;
    expect(val).toBe('indeed');

    const metrics = _.chain(reports)
      .find(obj => obj.client_id === 'multiple-plugins')
      .get('custom_metrics')
      .value();
    expect(_.isArray(metrics));
    expect(metrics.length).toBe(2);
    expect(metrics).toMatchSnapshot();
  } catch (err) {
    console.error(err);
    throw err;
  }
});

test('All hooks are called successfully when a plugin uses them all', async () => {
  try {
    const iopipe = IOpipe({
      token: 'single-plugin',
      plugins: [AllHooksPlugin()]
    });

    const wrapped = iopipe((event, ctx) => {
      ctx.succeed(ctx);
    });

    const context = mockContext();

    wrapped({}, context);

    const val = await context.Promise;
    _.reject(hooks, h => h === 'pre:setup').map(hook => {
      expect(val[`hasRun:${hook}`]).toBe(true);
    });
    expect(allHooksData).toMatchSnapshot();
  } catch (err) {
    console.error(err);
    throw err;
  }
});
