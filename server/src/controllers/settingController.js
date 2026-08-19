const SystemSetting = require('../models/SystemSetting');
const settingService = require('../services/settingService');
const { ok } = require('../utils/response');

exports.get = async (_req, res, next) => {
  try { ok(res, await settingService.get(), 'Operational settings loaded'); } catch (error) { next(error); }
};

exports.update = async (req, res, next) => {
  try {
    const allowed = ['meetingDurationMinutes', 'companyName', 'receptionPhone', 'receptionEmail'];
    const updates = Object.fromEntries(allowed.filter((key) => req.body[key] !== undefined).map((key) => [key, req.body[key]]));
    updates.updatedBy = req.user._id;
    const settings = await SystemSetting.findOneAndUpdate({ key: 'operations' }, { $set: updates, $setOnInsert: { key: 'operations' } }, { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true });
    ok(res, settings, 'Operational settings updated');
  } catch (error) { next(error); }
};
