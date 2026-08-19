const SystemSetting = require('../models/SystemSetting');

exports.get = () => SystemSetting.findOneAndUpdate(
  { key: 'operations' },
  { $setOnInsert: { key: 'operations', meetingDurationMinutes: 30 } },
  { upsert: true, new: true, setDefaultsOnInsert: true },
);
