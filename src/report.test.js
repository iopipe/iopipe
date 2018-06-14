import _ from 'lodash';
import flatten from 'flat';
import context from 'aws-lambda-mock-context';

import { resetEnv } from '../util/testUtils';
import Report from './report';
import mockPlugin from './plugins/mock';

const schema = require('./schema.json');

const config = {
  clientId: 'foo'
};

beforeEach(() => {
  resetEnv();
});

describe('Report creation', () => {
  test('creates a new report object', () => {
    expect(
      typeof new Report({
        config,
        context: context()
      })
    ).toBe('object');
  });

  test('can take no arguments', () => {
    expect(typeof new Report()).toBe('object');
  });

  test('creates a report that matches the schema', async done => {
    const r = new Report({
      labels: new Set('a-label'),
      metrics: [{ name: 'foo-metric', s: 'wow-string', n: 99 }]
    });
    await r.prepare(new Error('Holy smokes!'));
    r.send(() => {
      const flatReport = _.chain(r.report)
        .thru(flatten)
        .keys()
        .value();
      const flatSchema = _.chain(schema)
        .thru(flatten)
        .keys()
        .value();
      const diff = _.difference(flatSchema, flatReport);

      const allowedMissingFields = [
        'projectId',
        'disk.totalMiB',
        'disk.usedMiB',
        'disk.usedPercentage',
        'memory.rssMiB',
        'memory.totalMiB',
        'memory.rssTotalPercentage',
        'environment.runtime.vendor',
        'environment.runtime.vmVersion',
        'environment.runtime.vmVendor',
        'environment.python.version',
        'errors.stackHash',
        'errors.count',
        'performanceEntries.0.name',
        'performanceEntries.0.startTime',
        'performanceEntries.0.duration',
        'performanceEntries.0.entryType',
        'performanceEntries.0.timestamp',
        'plugins.0.name',
        'plugins.0.version',
        'plugins.0.homepage',
        'plugins.0.enabled',
        'plugins.0.uploads.0'
      ];

      expect(_.isEqual(allowedMissingFields, diff)).toBe(true);

      done();
    });
  });

  test('keeps custom metrics references', () => {
    const myMetrics = [];
    const r = new Report({ config, context: context(), metrics: myMetrics });
    myMetrics.push({ n: 1, name: 'a_value' });

    expect(r.report.custom_metrics).toHaveLength(1);
  });

  test('tracks plugins in use', () => {
    const plugin = mockPlugin();

    const r = new Report({ plugins: [plugin()] });

    expect(r.report.plugins).toHaveLength(1);

    expect(r.report.plugins[0].name).toBe('mock');

    expect(r.report.plugins[0].version).toBe('0.0.1');

    expect(r.report.plugins[0].homepage).toBe(
      'https://github.com/not/a/real/plugin'
    );
  });

  test('patches the ARN if SAM local is detected', () => {
    process.env.AWS_SAM_LOCAL = true;
    const localReport = new Report({ config, context: context() });
    expect(localReport.report.aws.invokedFunctionArn).toBe(
      'arn:aws:lambda:local:0:function:aws-lambda-mock-context'
    );

    delete process.env.AWS_SAM_LOCAL;
    const normalReport = new Report({ config, context: context() });
    expect(normalReport.report.aws.invokedFunctionArn).toBe(
      'arn:aws:lambda:us-west-1:123456789012:function:aws-lambda-mock-context:$LATEST'
    );
  });

  test('patches the ARN if no ARN is detected', () => {
    const newContext = context();
    delete newContext.invokedFunctionArn;
    const localReport = new Report({ config, context: newContext });
    expect(localReport.report.aws.invokedFunctionArn).toBe(
      'arn:aws:lambda:local:0:function:aws-lambda-mock-context'
    );
  });
});
