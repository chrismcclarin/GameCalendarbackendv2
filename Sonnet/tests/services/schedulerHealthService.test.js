// tests/services/schedulerHealthService.test.js
// Unit tests for recordRun + checkAnomalies + runAnomalySweep.
// Mocks the SchedulerRun model and @sentry/node so tests do not require a DB.

// ---- Mocks must be set up BEFORE requiring the service under test ----

// Make sure the lazy Sentry init path is taken before we require the service.
process.env.SENTRY_DSN = process.env.SENTRY_DSN || 'https://test@example.com/1';

const mockSentryCaptureException = jest.fn();
const mockSentryWithScope = jest.fn((cb) => {
  cb({
    setTag: jest.fn(),
    setLevel: jest.fn(),
    setExtra: jest.fn(),
  });
});

jest.mock('@sentry/node', () => ({
  captureException: (...args) => mockSentryCaptureException(...args),
  withScope: (cb) => mockSentryWithScope(cb),
}));

const mockSchedulerRunCreate = jest.fn();
const mockSchedulerRunFindAll = jest.fn();
const mockSchedulerRunFindOne = jest.fn();

jest.mock('../../models', () => ({
  SchedulerRun: {
    create: (...args) => mockSchedulerRunCreate(...args),
    findAll: (...args) => mockSchedulerRunFindAll(...args),
    findOne: (...args) => mockSchedulerRunFindOne(...args),
  },
}));

const {
  recordRun,
  checkAnomalies,
  runAnomalySweep,
} = require('../../services/schedulerHealthService');

describe('schedulerHealthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSchedulerRunCreate.mockResolvedValue({});
  });

  describe('recordRun', () => {
    test('records sent/skipped on success and returns the counts', async () => {
      const result = await recordRun('reminder', async () => ({ sent: 7, skipped: 3 }));

      expect(result).toEqual({ sent: 7, skipped: 3 });
      expect(mockSchedulerRunCreate).toHaveBeenCalledTimes(1);
      const row = mockSchedulerRunCreate.mock.calls[0][0];
      expect(row.job_name).toBe('reminder');
      expect(row.sent_count).toBe(7);
      expect(row.skipped_count).toBe(3);
      expect(row.error).toBeNull();
      expect(typeof row.duration_ms).toBe('number');
      expect(mockSentryCaptureException).not.toHaveBeenCalled();
    });

    test('treats undefined / non-object return as zero counts', async () => {
      const result = await recordRun('auto_promotion', async () => undefined);

      expect(result).toEqual({ sent: 0, skipped: 0 });
      const row = mockSchedulerRunCreate.mock.calls[0][0];
      expect(row.sent_count).toBe(0);
      expect(row.skipped_count).toBe(0);
      expect(row.error).toBeNull();
    });

    test('records error and re-throws on failure, captures to Sentry', async () => {
      const boom = new Error('database unavailable');

      await expect(recordRun('deadline', async () => { throw boom; })).rejects.toThrow('database unavailable');

      expect(mockSchedulerRunCreate).toHaveBeenCalledTimes(1);
      const row = mockSchedulerRunCreate.mock.calls[0][0];
      expect(row.job_name).toBe('deadline');
      expect(row.sent_count).toBe(0);
      expect(row.skipped_count).toBe(0);
      expect(row.error).toBe('database unavailable');

      expect(mockSentryWithScope).toHaveBeenCalledTimes(1);
      expect(mockSentryCaptureException).toHaveBeenCalledTimes(1);
      expect(mockSentryCaptureException).toHaveBeenCalledWith(boom);
    });

    test('does not crash when SchedulerRun.create itself fails', async () => {
      mockSchedulerRunCreate.mockRejectedValueOnce(new Error('persist failed'));

      // Even though the persist step fails, the success path should resolve.
      const result = await recordRun('prompt_sync', async () => ({ sent: 1, skipped: 0 }));
      expect(result).toEqual({ sent: 1, skipped: 0 });
    });
  });

  describe('checkAnomalies', () => {
    test('does NOT alert when there are fewer than `threshold` runs in window', async () => {
      mockSchedulerRunFindAll.mockResolvedValue([
        { sent_count: 0 },
        { sent_count: 0 },
      ]); // only 2 < threshold 3

      const result = await checkAnomalies({ jobName: 'reminder', threshold: 3 });

      expect(result.anomaly).toBe(false);
      expect(mockSentryCaptureException).not.toHaveBeenCalled();
    });

    test('does NOT alert when there are no historical non-zero runs (quiet job)', async () => {
      mockSchedulerRunFindAll.mockResolvedValue([
        { sent_count: 0 },
        { sent_count: 0 },
        { sent_count: 0 },
      ]);
      // No historical non-zero — job is "always zero", quiet-by-design.
      mockSchedulerRunFindOne.mockResolvedValue(null);

      const result = await checkAnomalies({ jobName: 'reminder', threshold: 3 });

      expect(result.anomaly).toBe(false);
      expect(mockSentryCaptureException).not.toHaveBeenCalled();
    });

    test('DOES alert when last 3 runs are zero AND there is a non-zero run within 7 days', async () => {
      mockSchedulerRunFindAll.mockResolvedValue([
        { sent_count: 0 },
        { sent_count: 0 },
        { sent_count: 0 },
      ]);
      const lastNonZeroDate = new Date(Date.now() - 6 * 3600 * 1000); // 6 hours ago, non-zero
      mockSchedulerRunFindOne.mockResolvedValue({
        sent_count: 12,
        ran_at: lastNonZeroDate,
      });

      const result = await checkAnomalies({ jobName: 'reminder', threshold: 3 });

      expect(result.anomaly).toBe(true);
      expect(result.lastNonZeroAt).toEqual(lastNonZeroDate);
      expect(mockSentryWithScope).toHaveBeenCalledTimes(1);
      expect(mockSentryCaptureException).toHaveBeenCalledTimes(1);
      const capturedErr = mockSentryCaptureException.mock.calls[0][0];
      expect(capturedErr.message).toMatch(/Scheduler anomaly: reminder produced 0 output for 3 consecutive runs/);
    });

    test('does NOT alert when latest run is non-zero', async () => {
      mockSchedulerRunFindAll.mockResolvedValue([
        { sent_count: 5 }, // most recent run still emitting
        { sent_count: 0 },
        { sent_count: 0 },
      ]);

      const result = await checkAnomalies({ jobName: 'reminder', threshold: 3 });

      expect(result.anomaly).toBe(false);
      // The historical lookup is short-circuited because the recent runs aren't all zero.
      expect(mockSchedulerRunFindOne).not.toHaveBeenCalled();
      expect(mockSentryCaptureException).not.toHaveBeenCalled();
    });
  });

  describe('runAnomalySweep', () => {
    test('runs checkAnomalies for every sweep job and continues past failures', async () => {
      // Make sure the SWEEP_JOBS path runs cleanly: insufficient runs -> no anomaly.
      mockSchedulerRunFindAll.mockResolvedValue([]);

      const results = await runAnomalySweep();

      expect(Object.keys(results)).toEqual(
        expect.arrayContaining(['reminder', 'deadline', 'auto_promotion', 'prompt_sync'])
      );
      // No anomalies because no runs returned.
      Object.values(results).forEach((r) => expect(r.anomaly).toBe(false));
    });
  });
});
